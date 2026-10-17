'use client';
import {create} from 'zustand';
import {collections, hydrateAll, type Collection} from './collections';
import {tokenOf} from './canonical';
import type {RemoteItem, PushResult} from './server';

// ---------- State shown to the person ----------

export type SyncStatus = 'starting' | 'saving' | 'saved' | 'offline' | 'error' | 'disabled' | 'signed-out';

export type Conflict = {
  id: string;
  kind: string;
  key: string;
  label: string;
  /** This computer's version (null when it was deleted here). */
  local: unknown | null;
  /** The other computer's version (data null when it was deleted there). */
  remote: RemoteItem;
  remoteData: unknown | null;
};

type SyncState = {
  status: SyncStatus;
  savedAt: number | null;
  error: string;
  conflicts: Conflict[];
  /** Records from another computer waiting because they are open here (kind/key). */
  waiting: string[];
  /** Records too big to sync; they stay in this browser. */
  tooLarge: string[];
};

export const useSync = create<SyncState>(() => ({status: 'starting', savedAt: null, error: '', conflicts: [], waiting: [], tooLarge: []}));

// ---------- Local bookkeeping ----------

const META = 'rc-sync-v1';
type Meta = {user: string | null; cursor: string; device: string; items: Record<string, {v: number; t: string}>};

function loadMeta(): Meta {
  try {
    const m = JSON.parse(localStorage.getItem(META) || 'null');
    if (m && typeof m.cursor === 'string' && m.items && typeof m.items === 'object') return {device: m.device || crypto.randomUUID(), user: m.user ?? null, cursor: m.cursor, items: m.items};
  } catch {}
  return {user: null, cursor: '0', device: crypto.randomUUID(), items: {}};
}
const saveMeta = (m: Meta) => { try { localStorage.setItem(META, JSON.stringify(m)); } catch {} };

const ref = (kind: string, key: string) => kind + '/' + key;
const DELETED = '-';
const FORCE = '!';
const byKind = new Map(collections.map(c => [c.kind as string, c]));
const tokenFor = (c: Collection, data: unknown) => data === null || data === undefined ? DELETED : c.token ? c.token(data) : tokenOf(data);

class SyncFailure extends Error {
  constructor(public code: string) { super(code); }
}

async function request(url: string, init?: RequestInit) {
  let r: Response;
  try { r = await fetch(url, {cache: 'no-store', ...init}); } catch { throw new SyncFailure('OFFLINE'); }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new SyncFailure(r.status === 401 ? 'AUTH_REQUIRED' : typeof body.error === 'string' ? body.error : 'SYNC_UNAVAILABLE');
  return body;
}

// Records held back (open in the editor, answer still streaming): applied on a later cycle.
const held = new Map<string, RemoteItem>();

function addConflict(c: Omit<Conflict, 'id'>) {
  const id = ref(c.kind, c.key);
  useSync.setState(s => ({conflicts: [...s.conflicts.filter(x => x.id !== id), {...c, id}]}));
}
const conflicted = (id: string) => useSync.getState().conflicts.some(c => c.id === id);

/** Window event so an open editor can reload a record that sync just replaced. */
function announce(kind: string, key: string) {
  window.dispatchEvent(new CustomEvent('rc-sync-applied', {detail: {kind, key}}));
}

// ---------- One remote record against the local one ----------

async function reconcile(meta: Meta, c: Collection, item: RemoteItem, local: unknown | undefined, out: {key: string; data: unknown | null}[]) {
  const id = ref(item.kind, item.key);
  const m = meta.items[id];
  if (m && item.version <= m.v) return;
  const remoteData = item.deleted ? null : c.decode ? await c.decode(item.data) : item.data;
  const remoteToken = tokenFor(c, remoteData);
  const localToken = local === undefined ? DELETED : tokenFor(c, local);
  const dirty = m ? localToken !== m.t : local !== undefined;
  const pristine = local !== undefined && c.pristine?.(local);
  if (!dirty || localToken === remoteToken || pristine) {
    if (localToken !== remoteToken) out.push({key: item.key, data: remoteData});
    meta.items[id] = {v: item.version, t: remoteToken};
    useSync.setState(s => ({conflicts: s.conflicts.filter(x => x.id !== id)}));
    return;
  }
  // Both computers changed it. Merge only when that can never lose work; otherwise ask.
  const merged = local !== undefined && remoteData !== null ? c.merge?.(local, remoteData) : undefined;
  if (merged !== undefined) {
    out.push({key: item.key, data: merged});
    meta.items[id] = {v: item.version, t: remoteToken};
    return;
  }
  addConflict({kind: item.kind, key: item.key, label: c.label(local ?? remoteData), local: local ?? null, remote: item, remoteData});
}

// ---------- Pull and push ----------

async function process(meta: Meta, items: RemoteItem[]) {
  const groups = new Map<string, RemoteItem[]>();
  for (const item of items) groups.set(item.kind, [...(groups.get(item.kind) || []), item]);
  for (const [kind, list] of groups) {
    const c = byKind.get(kind);
    if (!c) continue;
    const local = new Map((await c.list()).map(e => [e.key, e.data]));
    const out: {key: string; data: unknown | null}[] = [];
    for (const item of list) {
      const m = meta.items[ref(kind, item.key)];
      // This computer's own write coming back: nothing to do, never a reason to hold an open record.
      if (m && item.version <= m.v) continue;
      // A record open here waits, but only when this computer has a copy to protect: a first arrival is applied.
      if (c.busy?.(item.key) && local.has(item.key)) {
        const here = local.get(item.key);
        const same = here !== undefined && !item.deleted && tokenFor(c, here) === (c.token ? c.token(item.data) : tokenOf(item.data));
        if (!same) { held.set(ref(kind, item.key), item); continue; }
      }
      await reconcile(meta, c, item, local.get(item.key), out);
    }
    if (out.length) {
      await c.apply(out);
      for (const o of out) announce(kind, o.key);
    }
  }
}

async function pull(meta: Meta) {
  // Records held on an earlier cycle get another chance first.
  const retry = [...held.values()];
  held.clear();
  await process(meta, retry);
  let since = meta.cursor;
  for (let page = 0; page < 50; page++) {
    const r = await request('/api/sync?since=' + since);
    if (r.user && meta.user && r.user !== meta.user) {
      // Another account in this browser: start over without mixing records.
      meta.items = {}; meta.user = r.user; since = '0'; held.clear(); continue;
    }
    meta.user = r.user ?? meta.user;
    await process(meta, r.items as RemoteItem[]);
    since = r.cursor;
    if (!r.more) break;
  }
  // Never move the cursor past a held record, so it comes back even after a reload.
  const heldSeqs = [...held.values()].map(i => BigInt(i.seq));
  const min = heldSeqs.length ? heldSeqs.reduce((a, b) => a < b ? a : b) : null;
  meta.cursor = min !== null && BigInt(since) >= min ? (min - BigInt(1)).toString() : since;
  useSync.setState({waiting: [...held.keys()]});
}

type Outgoing = {kind: string; key: string; base: number; data?: unknown; deleted?: boolean; token: string; local: unknown | null};

async function push(meta: Meta) {
  const outgoing: Outgoing[] = [];
  for (const c of collections) {
    const entries = await c.list();
    const keys = new Set<string>();
    for (const {key, data} of entries) {
      keys.add(key);
      const id = ref(c.kind, key);
      if (conflicted(id) || held.has(id) || (c.ready && !c.ready(data))) continue;
      const token = tokenFor(c, data);
      const m = meta.items[id];
      if (m && m.t === token) continue;
      outgoing.push({kind: c.kind, key, base: m?.v ?? 0, data, token, local: data});
    }
    for (const id of Object.keys(meta.items)) {
      if (!id.startsWith(c.kind + '/')) continue;
      const key = id.slice(c.kind.length + 1);
      const m = meta.items[id];
      if (keys.has(key) || m.t === DELETED || conflicted(id) || held.has(id)) continue;
      outgoing.push({kind: c.kind, key, base: m.v, deleted: true, token: DELETED, local: null});
    }
  }
  if (!outgoing.length) return false;
  useSync.setState({status: 'saving'});
  // Batches stay well under the platform's request size limit.
  let batch: {change: Outgoing; body: unknown}[] = [];
  let size = 0;
  const send = async () => {
    if (!batch.length) return;
    const r = await request('/api/sync', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({device: meta.device, changes: batch.map(b => b.body)}),
    });
    for (const [i, result] of (r.results as PushResult[]).entries()) {
      const {change} = batch[i];
      const id = ref(change.kind, change.key);
      const c = byKind.get(change.kind)!;
      if (result.status === 'ok') { meta.items[id] = {v: result.version, t: change.token}; continue; }
      const out: {key: string; data: unknown | null}[] = [];
      // Stale write: treat the server's record like a pull, with this computer's version as the local one.
      delete meta.items[id];
      meta.items[id] = {v: Math.max(0, result.current.version - 1), t: FORCE};
      await reconcile(meta, c, result.current, change.local === null ? undefined : change.local, out);
      if (out.length) { await c.apply(out); for (const o of out) announce(change.kind, o.key); }
    }
    saveMeta(meta);
    batch = []; size = 0;
  };
  const tooLarge: string[] = [];
  for (const change of outgoing) {
    const c = byKind.get(change.kind)!;
    const data = change.deleted ? undefined : c.encode ? await c.encode(change.data) : change.data;
    const body = {kind: change.kind, key: change.key, base: change.base, ...(change.deleted ? {deleted: true} : {data})};
    const length = JSON.stringify(body).length;
    if (length > 2_000_000) { tooLarge.push(c.label(change.local)); continue; } // Stays in this browser.
    if (batch.length && (size + length > 2_800_000 || batch.length >= 50)) await send();
    batch.push({change, body}); size += length;
  }
  await send();
  useSync.setState({tooLarge});
  return true;
}

// ---------- Scheduling ----------

let running = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let failures = 0;
let started = false;
let lastActivity = Date.now();

async function locked(fn: () => Promise<void>) {
  // One tab at a time per browser, so two tabs never send the same change twice.
  if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request('rc-sync', fn);
  return fn();
}

export async function syncNow() {
  if (running) { again = true; return; }
  running = true;
  again = false;
  clearTimeout(timer);
  try {
    await locked(async () => {
      const meta = loadMeta();
      await pull(meta);
      saveMeta(meta);
      await push(meta);
      saveMeta(meta);
    });
    failures = 0;
    useSync.setState({status: 'saved', savedAt: Date.now(), error: ''});
  } catch (e) {
    failures++;
    const code = e instanceof SyncFailure ? e.code : e instanceof Error ? e.message : 'SYNC_UNAVAILABLE';
    useSync.setState({
      status: code === 'OFFLINE' ? 'offline' : code === 'AUTH_REQUIRED' ? 'signed-out' : code === 'SYNC_NOT_READY' ? 'disabled' : 'error',
      error: code,
    });
  } finally {
    running = false;
    const s = useSync.getState().status;
    if (again) schedule(400);
    else if (s === 'disabled') schedule(10 * 60_000);
    else if (s === 'error' || s === 'offline') schedule(Math.min(5 * 60_000, 15_000 * 2 ** Math.min(failures, 4)));
    else schedule(60_000, true);
  }
}

function schedule(ms: number, idle = false) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    // Background checks only while someone is using the studio, to keep the free database asleep otherwise.
    if (idle && (document.visibilityState !== 'visible' || Date.now() - lastActivity > 5 * 60_000)) { schedule(60_000, true); return; }
    void syncNow();
  }, ms);
}

/** Starts sync once per page: loads local data, pulls, then pushes changes as they happen. */
export function startSync() {
  if (started || typeof window === 'undefined') return;
  started = true;
  hydrateAll();
  for (const c of collections) c.subscribe(() => { if (useSync.getState().status !== 'signed-out') { useSync.setState({status: 'saving'}); schedule(1200); } });
  const wake = () => { lastActivity = Date.now(); };
  for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, wake, {passive: true});
  window.addEventListener('focus', () => { wake(); void syncNow(); });
  window.addEventListener('online', () => void syncNow());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { wake(); void syncNow(); } });
  void syncNow();
}

// ---------- Conflict resolution ----------

export type Choice = 'both' | 'mine' | 'theirs';

/** Applies the person's decision. Nothing is discarded unless they chose so explicitly. */
export async function resolveConflict(id: string, choice: Choice) {
  const conflict = useSync.getState().conflicts.find(c => c.id === id);
  if (!conflict) return;
  const c = byKind.get(conflict.kind)!;
  const meta = loadMeta();
  const remoteToken = tokenFor(c, conflict.remoteData);
  const keepMine = choice === 'mine' || (choice === 'both' && conflict.remoteData === null);
  if (keepMine) {
    // The next push overwrites the other version on purpose (base = the version we just saw).
    meta.items[id] = {v: conflict.remote.version, t: FORCE};
  } else {
    if (choice === 'both' && conflict.local !== null) {
      const copy = c.duplicate?.(conflict.local);
      if (copy) await c.apply([copy]);
    }
    await c.apply([{key: conflict.key, data: conflict.remoteData}]);
    meta.items[id] = {v: conflict.remote.version, t: remoteToken};
    announce(conflict.kind, conflict.key);
  }
  saveMeta(meta);
  useSync.setState(s => ({conflicts: s.conflicts.filter(x => x.id !== id)}));
  void syncNow();
}

/** For a record held because it is open here: apply the other computer's version now (or turn it into a conflict). */
export async function applyHeld(kind: string, key: string) {
  const id = ref(kind, key);
  const item = held.get(id);
  if (!item) return;
  held.delete(id);
  const c = byKind.get(kind)!;
  const meta = loadMeta();
  const local = new Map((await c.list()).map(e => [e.key, e.data])).get(key);
  const out: {key: string; data: unknown | null}[] = [];
  await reconcile(meta, c, item, local, out);
  if (out.length) { await c.apply(out); announce(kind, key); }
  saveMeta(meta);
  useSync.setState({waiting: [...held.keys()]});
  void syncNow();
}
