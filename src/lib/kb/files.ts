'use client';
import {getAsset, putAsset, MAX_ASSET} from '@/lib/manual/store';
import type {KbEntry, KbRef, PackageFile} from './model';

// Pictures and sheets of the characters, stored unchanged by their content hash in this browser and in the account
// (/api/sync/assets, the same store as the manual's files). A file over the size of one stored file is kept in parts,
// each a stored file of its own; the whole file is checked against its hash when it is put back together.

export const CHUNK = 3_900_000;
export const MAX_REF_FILE = 16 * CHUNK;
export const refMimes = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'] as const;

export async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Keeps a file in this browser and describes it as a reference of a character, checked against the manifest. */
export async function storeRefFile(name: string, mime: KbRef['mime'], bytes: Uint8Array, manifestSha: string | null, kind: KbRef['kind']): Promise<KbRef> {
  if (bytes.byteLength > MAX_REF_FILE) throw Error('FILE_TOO_LARGE');
  const hash = await sha256(bytes);
  let chunks: string[] | undefined;
  if (bytes.byteLength <= MAX_ASSET) {
    if (await putAsset(bytes) !== hash) throw Error('ASSET_MISMATCH');
  } else {
    chunks = [];
    for (let at = 0; at < bytes.byteLength; at += CHUNK) chunks.push(await putAsset(bytes.slice(at, at + CHUNK)));
  }
  return {
    hash, mime, name: name.slice(0, 300), size: bytes.byteLength, kind, review: 'observed',
    verified: !manifestSha ? 'unlisted' : manifestSha === hash ? 'manifest' : 'mismatch',
    ...(chunks ? {chunks} : {}), addedAt: Date.now(),
  };
}

/** The bytes of a reference, from this browser or the account; null when they are missing or do not match. */
export async function refBytes(ref: Pick<KbRef, 'hash' | 'chunks'>): Promise<Uint8Array | null> {
  if (!ref.chunks) return getAsset(ref.hash);
  const parts: Uint8Array[] = [];
  for (const c of ref.chunks) { const p = await getAsset(c); if (!p) return null; parts.push(p); }
  const all = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const p of parts) { all.set(p, at); at += p.byteLength; }
  return await sha256(all) === ref.hash ? all : null;
}

/** Stored files a reference is made of, with the type they are sent with. */
export const refParts = (ref: KbRef): [string, string][] => ref.chunks ? ref.chunks.map(c => [c, 'application/octet-stream']) : [[ref.hash, ref.mime]];

async function failIfBad(r: Response) {
  if (r.ok) return;
  const body = await r.json().catch(() => ({}));
  throw Error(typeof body.error === 'string' ? body.error : 'SYNC_UNAVAILABLE');
}

/** Sends to the account the files of an entry it does not have yet, before the entry itself is synced. */
export async function uploadEntryFiles(entry: KbEntry) {
  if (entry.kind !== 'character' || !entry.data.refs.length) return;
  const parts = new Map(entry.data.refs.flatMap(refParts));
  const hashes = [...parts.keys()];
  for (let i = 0; i < hashes.length; i += 50) {
    const r = await fetch('/api/sync/assets?missing=' + hashes.slice(i, i + 50).join(','), {cache: 'no-store'});
    await failIfBad(r);
    const {missing} = await r.json() as {missing: string[]};
    for (const hash of missing) {
      const bytes = await getAsset(hash);
      // A file this computer does not have stays where it is; the other computer still has it.
      if (!bytes) continue;
      const up = await fetch('/api/sync/assets', {method: 'POST', headers: {'Content-Type': parts.get(hash)!}, body: bytes as BodyInit});
      await failIfBad(up);
      const {hash: got} = await up.json() as {hash: string};
      if (got !== hash) throw Error('ASSET_MISMATCH');
    }
  }
}

// ---------- Files inside an export ----------

function toBase64(bytes: Uint8Array) {
  let text = '';
  for (let at = 0; at < bytes.byteLength; at += 0x8000) text += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(text);
}

function fromBase64(data: string) {
  const text = atob(data);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}

export type Unpacked = {bytes: Uint8Array; chunks?: string[]};

/** The files an export carries, each checked against its hash, with the parts a large one is kept in. */
export async function unpackFiles(files: PackageFile[]) {
  const ok = new Map<string, Unpacked>();
  const bad: string[] = [];
  for (const f of files) {
    if (ok.has(f.hash)) continue;
    let bytes: Uint8Array;
    try { bytes = fromBase64(f.data); } catch { bad.push(f.name); continue; }
    if (bytes.byteLength > MAX_REF_FILE || await sha256(bytes) !== f.hash) { bad.push(f.name); continue; }
    if (bytes.byteLength <= MAX_ASSET) { ok.set(f.hash, {bytes}); continue; }
    const chunks: string[] = [];
    for (let at = 0; at < bytes.byteLength; at += CHUNK) chunks.push(await sha256(bytes.slice(at, at + CHUNK)));
    ok.set(f.hash, {bytes, chunks});
  }
  return {ok, bad};
}

/** Keeps the files of an export in this browser; the account gets them when their entries sync. */
export async function storeUnpacked(files: Iterable<Unpacked>) {
  for (const f of files) {
    if (!f.chunks) { await putAsset(f.bytes); continue; }
    for (let at = 0; at < f.bytes.byteLength; at += CHUNK) await putAsset(f.bytes.slice(at, at + CHUNK));
  }
}

/** The files of the characters' references, for an export that carries its pictures; `missing` names the ones not found. */
export async function packFiles(entries: KbEntry[]) {
  const files: PackageFile[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    if (e.kind !== 'character') continue;
    for (const r of e.data.refs) {
      if (seen.has(r.hash)) continue;
      seen.add(r.hash);
      const bytes = await refBytes(r);
      if (bytes) files.push({hash: r.hash, mime: r.mime, name: r.name, data: toBase64(bytes)}); else missing.push(r.name);
    }
  }
  return {files, missing};
}
