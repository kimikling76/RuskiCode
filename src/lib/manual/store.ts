'use client';
import {localStore} from '@/lib/books/local-store';
import {libraryEvents} from '@/lib/books/library';
import {fetchEditorFonts} from './fonts';
import {readPdf} from './pdf-read';
import {unitFromPdf, type ImportReport} from './segment';
import {blankUnitFrom} from './units';
import {unitSchema, usedAssets, type Unit} from './model';

// Manual units in this browser (IndexedDB), with their files and versions:
// - `manual:<id>` the unit (elements, template; files only by their hash);
// - `masset:<hash>` each file once, shared by every unit and version that uses it (the imported PDF, its images);
// - `mver:<unit>:<id>` saved versions, each a whole unit.
// Files travel to the account by hash (/api/sync/assets), up to 4 MB each.

export type ManualVersion = {id: string; unitId: string; label: string; createdAt: number; unit: Unit};

const unitKey = (id: string) => 'manual:' + id;
const assetKey = (hash: string) => 'masset:' + hash;
const versionKey = (unitId: string, id: string) => 'mver:' + unitId + ':' + id;
const changed = () => libraryEvents?.dispatchEvent(new Event('change'));
export const MAX_ASSET = 4_000_000;
export const MAX_MANUAL_VERSIONS = 30;

// Open in the editor right now: changes from another computer wait.
const open = new Map<string, number>();
export function markUnitOpen(id: string) { open.set(id, (open.get(id) || 0) + 1); return () => { const n = (open.get(id) || 1) - 1; if (n) open.set(id, n); else open.delete(id); }; }
export const isUnitOpen = (id: string) => open.has(id);

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------- Files ----------

export async function putAsset(bytes: Uint8Array) {
  const hash = await sha256(bytes);
  if (!(await localStore.get(assetKey(hash)))) await localStore.set(assetKey(hash), bytes);
  return hash;
}

const fetching = new Map<string, Promise<Uint8Array | null>>();
/** A file of a unit: from this browser, or from the account (then kept here). Null when nobody has it. */
export function getAsset(hash: string): Promise<Uint8Array | null> {
  let p = fetching.get(hash);
  if (p) return p;
  p = (async () => {
    const local = await localStore.get<Uint8Array | ArrayBuffer>(assetKey(hash));
    if (local) return local instanceof Uint8Array ? local : new Uint8Array(local);
    const r = await fetch('/api/sync/assets?hash=' + hash).catch(() => null);
    if (!r?.ok) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (await sha256(bytes) !== hash) return null;
    await localStore.set(assetKey(hash), bytes);
    return bytes;
  })();
  fetching.set(hash, p);
  p.then(v => { if (!v) fetching.delete(hash); }, () => fetching.delete(hash));
  return p;
}

const hasLocal = async (hash: string) => Boolean(await localStore.get(assetKey(hash)));

async function failIfBad(r: Response) {
  if (r.ok) return;
  const body = await r.json().catch(() => ({}));
  throw Error(typeof body.error === 'string' ? body.error : 'SYNC_UNAVAILABLE');
}

/** Sends to the account the files of a unit it does not have yet. Files over 4 MB stay on this computer. */
export async function uploadAssets(assets: Unit['assets']) {
  const hashes = Object.keys(assets);
  for (let i = 0; i < hashes.length; i += 50) {
    const chunk = hashes.slice(i, i + 50);
    const r = await fetch('/api/sync/assets?missing=' + chunk.join(','), {cache: 'no-store'});
    await failIfBad(r);
    const {missing} = await r.json() as {missing: string[]};
    for (const hash of missing) {
      const bytes = await localStore.get<Uint8Array>(assetKey(hash));
      if (!bytes || bytes.byteLength > MAX_ASSET) continue;
      const up = await fetch('/api/sync/assets', {method: 'POST', headers: {'Content-Type': assets[hash]}, body: bytes as BodyInit});
      await failIfBad(up);
      const {hash: got} = await up.json() as {hash: string};
      if (got !== hash) throw Error('ASSET_MISMATCH');
    }
  }
}

/** Brings the files of a unit that came from another computer. The missing ones are left for later. */
export async function downloadAssets(assets: Unit['assets']) {
  const missing: string[] = [];
  for (const hash of Object.keys(assets)) {
    if (await hasLocal(hash)) continue;
    if (!(await getAsset(hash))) missing.push(hash);
  }
  return missing;
}

// ---------- Units ----------

export async function listUnits(): Promise<Unit[]> {
  const keys = (await localStore.keys()).filter(k => k.startsWith('manual:'));
  const items = await Promise.all(keys.map(k => localStore.get<Unit>(k)));
  return items.filter((u): u is Unit => Boolean(u?.id)).sort((a, b) => b.updatedAt - a.updatedAt);
}

export const getUnit = (id: string) => localStore.get<Unit>(unitKey(id));

export async function saveUnit(unit: Unit) {
  const valid = unitSchema.parse({...unit, assets: usedAssets(unit)});
  await localStore.set(unitKey(valid.id), valid);
  changed();
  return valid;
}

export async function putSyncedUnit(unit: Unit) {
  const parsed = unitSchema.safeParse(unit);
  if (!parsed.success) return;
  await localStore.set(unitKey(parsed.data.id), parsed.data);
}
export async function removeSyncedUnit(id: string) {
  await localStore.remove(unitKey(id));
  for (const v of await listVersions(id)) await localStore.remove(versionKey(id, v.id));
}

type Deleted = {unit: Unit; versions: ManualVersion[]};
/** Deletes the unit and its versions. Its files stay (other units or versions may use them). */
export async function deleteUnit(id: string): Promise<Deleted | null> {
  const unit = await getUnit(id);
  if (!unit) return null;
  const versions = await listVersions(id);
  await removeSyncedUnit(id);
  changed();
  return {unit, versions};
}
export async function restoreUnit(saved: Deleted) {
  for (const v of saved.versions) await localStore.set(versionKey(v.unitId, v.id), v);
  await localStore.set(unitKey(saved.unit.id), {...saved.unit, updatedAt: Date.now()});
  changed();
}

export async function renameUnit(id: string, title: string) {
  const unit = await getUnit(id);
  if (!unit) throw Error('NOT_FOUND');
  return saveUnit({...unit, title: title.trim().slice(0, 200) || unit.title, updatedAt: Date.now()});
}

// ---------- Versions ----------

export async function listVersions(unitId: string): Promise<ManualVersion[]> {
  const prefix = 'mver:' + unitId + ':';
  const keys = (await localStore.keys()).filter(k => k.startsWith(prefix));
  const items = await Promise.all(keys.map(k => localStore.get<ManualVersion>(k)));
  return items.filter((v): v is ManualVersion => Boolean(v?.id)).sort((a, b) => a.createdAt - b.createdAt);
}

export async function listAllVersions(): Promise<ManualVersion[]> {
  const keys = (await localStore.keys()).filter(k => k.startsWith('mver:'));
  const items = await Promise.all(keys.map(k => localStore.get<ManualVersion>(k)));
  return items.filter((v): v is ManualVersion => Boolean(v?.id));
}

/** Saves the unit as it is now as a version. Past the limit the oldest go, except the first (the import). */
export async function saveVersion(unit: Unit, label: string) {
  const version: ManualVersion = {id: crypto.randomUUID(), unitId: unit.id, label: label.slice(0, 200), createdAt: Date.now(), unit};
  await localStore.set(versionKey(unit.id, version.id), version);
  const all = await listVersions(unit.id);
  const extra = all.length - MAX_MANUAL_VERSIONS;
  if (extra > 0) for (const v of all.slice(1, 1 + extra)) await localStore.remove(versionKey(unit.id, v.id));
  changed();
  return version;
}

export async function putSyncedVersion(v: ManualVersion) {
  if (!v?.id || !v.unitId || !unitSchema.safeParse(v.unit).success) return;
  await localStore.set(versionKey(v.unitId, v.id), v);
}
export async function removeSyncedVersion(id: string) {
  const v = (await listAllVersions()).find(x => x.id === id);
  if (v) await localStore.remove(versionKey(v.unitId, v.id));
}

// ---------- Creating units ----------

export type ImportResult = {id: string; report: ImportReport};

/** Imports a PDF as an editable unit. The PDF is kept unchanged, to compare and to draw pages kept as they are. */
export async function importUnitPdf(name: string, bytes: Uint8Array, opts: {number?: string} = {}): Promise<ImportResult> {
  const fonts = await fetchEditorFonts();
  const read = await readPdf(bytes);
  if (!read.pages.length) throw Error('EMPTY');
  const source = await putAsset(bytes);
  for (const [hash, asset] of read.assets) {
    const stored = await putAsset(asset.bytes);
    if (stored !== hash) throw Error('ASSET_MISMATCH');
  }
  const now = Date.now();
  const title = name.replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').trim().slice(0, 200) || 'Unidad';
  const {unit, report} = unitFromPdf(fonts, read, {
    id: crypto.randomUUID(), title, now, ...(opts.number ? {number: opts.number} : {}),
    source: {asset: source, name: name.slice(0, 300), pages: read.pages.length, size: bytes.byteLength},
  });
  const saved = await saveUnit(unit);
  await saveVersion(saved, 'Importada del PDF');
  return {id: saved.id, report};
}

/** A new unit that uses the template and page frame of another one: one page, ready to add exercises. */
export async function createUnitFrom(model: Unit, title: string, number?: string) {
  const fonts = await fetchEditorFonts();
  const unit = blankUnitFrom(fonts, model, {id: crypto.randomUUID(), title, number, now: Date.now()});
  const saved = await saveUnit(unit);
  await saveVersion(saved, 'Unidad nueva');
  return saved.id;
}
