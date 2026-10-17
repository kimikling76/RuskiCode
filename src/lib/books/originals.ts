'use client';
import {localStore} from './local-store';
import {libraryEvents} from './library';

// Imported PDFs kept exactly as they are, edited in place: page tools (Stirling PDF, src/components/pdf/document-editor.tsx)
// or text edits (Nutrient, src/components/pdf/original-editor.tsx).
// The file and its details are stored apart, so listing and syncing never load every PDF into memory.
//
// Every change is a new version; nothing is overwritten. The first version is the PDF as it was imported.
// Undo and redo move between versions; any older one can be opened again.

export type OriginalPdf = {
  id: string;
  name: string;
  size: number;
  createdAt: number;
  updatedAt: number;
  /** The file did not come with the record: it is larger than what sync carries, and stays on the other computer. */
  missing?: boolean;
  /** The version shown now. Absent in PDFs imported before versions existed. */
  version?: string;
};

export type PdfVersion = {
  id: string;
  docId: string;
  /** What made it: «Original importado», «Rotar la página 2»… */
  label: string;
  createdAt: number;
  size: number;
  /** The version it was made from (undo goes back to it). */
  parent?: string;
  /** Like OriginalPdf.missing: the file stayed on the other computer. */
  missing?: boolean;
};

/** «850 KB», «2,4 MB». */
export function fileSize(bytes: number) {
  return bytes < 1_000_000 ? Math.max(1, Math.round(bytes / 1000)) + ' KB' : (bytes / 1_000_000).toLocaleString('es-AR', {maximumFractionDigits: 1}) + ' MB';
}

/** PDFs up to this size travel with the account (the server takes files of at most 4 MB). */
export const SYNC_LIMIT = 4_000_000;
/** Versions kept per PDF. Past this, the oldest are dropped, except the imported original. */
export const MAX_VERSIONS = 40;

const metaKey = (id: string) => 'pdfmeta:' + id;
const dataKey = (id: string) => 'pdfdata:' + id;
const versionKey = (docId: string, id: string) => 'pdfver:' + docId + ':' + id;
const versionDataKey = (id: string) => 'pdfverdata:' + id;
const changed = () => libraryEvents?.dispatchEvent(new Event('change'));

// Open in the editor right now: changes from another computer wait (never overwrite silently).
const open = new Map<string, number>();
export function markOriginalOpen(id: string) { open.set(id, (open.get(id) || 0) + 1); return () => { const n = (open.get(id) || 1) - 1; if (n) open.set(id, n); else open.delete(id); }; }
export const isOriginalOpen = (id: string) => open.has(id);

export async function listOriginals(): Promise<OriginalPdf[]> {
  const keys = (await localStore.keys()).filter(k => k.startsWith('pdfmeta:'));
  const items = await Promise.all(keys.map(k => localStore.get<OriginalPdf>(k)));
  return items.filter((p): p is OriginalPdf => Boolean(p?.id)).sort((a, b) => b.updatedAt - a.updatedAt);
}

export const getOriginal = (id: string) => localStore.get<OriginalPdf>(metaKey(id));
export const loadOriginalData = (id: string) => localStore.get<ArrayBuffer>(dataKey(id));

/** Bytes must be a PDF: its file starts with «%PDF-». */
export function isPdf(bytes: ArrayBuffer) {
  const head = new Uint8Array(bytes.slice(0, 1024));
  for (let i = 0; i + 4 < head.length; i++) if (head[i] === 0x25 && head[i + 1] === 0x50 && head[i + 2] === 0x44 && head[i + 3] === 0x46 && head[i + 4] === 0x2d) return true;
  return false;
}

// ---------- Versions ----------

export async function listVersions(docId: string): Promise<PdfVersion[]> {
  const prefix = 'pdfver:' + docId + ':';
  const keys = (await localStore.keys()).filter(k => k.startsWith(prefix));
  const items = await Promise.all(keys.map(k => localStore.get<PdfVersion>(k)));
  return items.filter((v): v is PdfVersion => Boolean(v?.id)).sort((a, b) => a.createdAt - b.createdAt);
}

export const loadVersionData = (id: string) => localStore.get<ArrayBuffer>(versionDataKey(id));

async function writeVersion(version: PdfVersion, bytes: ArrayBuffer | null) {
  if (bytes) await localStore.set(versionDataKey(version.id), bytes);
  await localStore.set(versionKey(version.docId, version.id), version);
}

async function removeVersion(version: PdfVersion) {
  await localStore.remove(versionDataKey(version.id));
  await localStore.remove(versionKey(version.docId, version.id));
}

/** Old versions past the limit go, oldest first; the imported original and the one shown stay. */
async function prune(docId: string, keep: string) {
  const versions = await listVersions(docId);
  const extra = versions.length - MAX_VERSIONS;
  if (extra <= 0) return;
  const removable = versions.slice(1).filter(v => v.id !== keep).slice(0, extra);
  for (const v of removable) await removeVersion(v);
}

/** PDFs imported before versions existed get their current file as the first version, so it can always come back. */
async function ensureBase(meta: OriginalPdf): Promise<OriginalPdf> {
  if (meta.version) return meta;
  const bytes = await loadOriginalData(meta.id);
  if (!bytes) return meta;
  const base: PdfVersion = {id: crypto.randomUUID(), docId: meta.id, label: 'Original importado', createdAt: meta.createdAt, size: bytes.byteLength};
  await writeVersion(base, bytes);
  const next = {...meta, version: base.id};
  await localStore.set(metaKey(meta.id), next);
  return next;
}

export async function createOriginal(name: string, bytes: ArrayBuffer, label = 'Original importado') {
  if (!isPdf(bytes)) throw Error('NOT_PDF');
  const now = Date.now();
  const id = crypto.randomUUID();
  const version: PdfVersion = {id: crypto.randomUUID(), docId: id, label, createdAt: now, size: bytes.byteLength};
  const meta: OriginalPdf = {id, name: name.replace(/\.pdf$/i, '').slice(0, 200) || 'Documento', size: bytes.byteLength, createdAt: now, updatedAt: now, version: version.id};
  await writeVersion(version, bytes);
  await localStore.set(dataKey(meta.id), bytes);
  await localStore.set(metaKey(meta.id), meta);
  changed();
  return meta.id;
}

/** A change becomes a new version and the version shown. The previous file stays in the history. */
export async function commitVersion(docId: string, bytes: ArrayBuffer, label: string) {
  if (!isPdf(bytes)) throw Error('NOT_PDF');
  const found = await getOriginal(docId);
  if (!found) throw Error('NOT_FOUND');
  const meta = await ensureBase(found);
  const version: PdfVersion = {id: crypto.randomUUID(), docId, label: label.slice(0, 200), createdAt: Date.now(), size: bytes.byteLength, parent: meta.version};
  await writeVersion(version, bytes);
  await localStore.set(dataKey(docId), bytes);
  await localStore.set(metaKey(docId), {...meta, size: bytes.byteLength, updatedAt: Date.now(), missing: false, version: version.id} satisfies OriginalPdf);
  await prune(docId, version.id);
  changed();
  return version;
}

/** Shows an earlier (or later) version again. Nothing is deleted: the other versions stay in the history. */
export async function showVersion(docId: string, versionId: string) {
  const meta = await getOriginal(docId);
  const version = await localStore.get<PdfVersion>(versionKey(docId, versionId));
  const bytes = await loadVersionData(versionId);
  if (!meta || !version) throw Error('NOT_FOUND');
  if (!bytes) throw Error('MISSING');
  await localStore.set(dataKey(docId), bytes);
  await localStore.set(metaKey(docId), {...meta, size: bytes.byteLength, updatedAt: Date.now(), missing: false, version: versionId} satisfies OriginalPdf);
  changed();
}

/** Undo goes to the version the current one was made from; redo to the newest one made from the current one. */
export function neighbours(versions: PdfVersion[], current: string | undefined) {
  const now = versions.find(v => v.id === current);
  const back = now?.parent ? versions.find(v => v.id === now.parent) : undefined;
  const forward = [...versions].reverse().find(v => v.parent === current);
  return {back, forward};
}

/** Kept for the Nutrient editor: its save is one more version. */
export async function saveOriginalData(id: string, bytes: ArrayBuffer, label = 'Edición en el editor de texto') {
  await commitVersion(id, bytes, label);
}

export async function renameOriginal(id: string, name: string) {
  const meta = await getOriginal(id);
  if (!meta) throw Error('NOT_FOUND');
  await localStore.set(metaKey(id), {...meta, name: name.trim().slice(0, 200) || meta.name, updatedAt: Date.now()});
  changed();
}

type Deleted = {meta: OriginalPdf; bytes?: ArrayBuffer; versions: {version: PdfVersion; bytes?: ArrayBuffer}[]};

export async function deleteOriginal(id: string): Promise<Deleted | null> {
  const meta = await getOriginal(id);
  if (!meta) return null;
  const bytes = await loadOriginalData(id);
  const versions = [];
  for (const version of await listVersions(id)) {
    versions.push({version, bytes: await loadVersionData(version.id)});
    await removeVersion(version);
  }
  await localStore.remove(dataKey(id));
  await localStore.remove(metaKey(id));
  changed();
  return {meta, bytes, versions};
}

/** «Deshacer» after deleting: the same record, file and versions come back. */
export async function restoreOriginal(saved: Deleted) {
  for (const {version, bytes} of saved.versions || []) await writeVersion(version, bytes || null);
  if (saved.bytes) await localStore.set(dataKey(saved.meta.id), saved.bytes);
  await localStore.set(metaKey(saved.meta.id), {...saved.meta, updatedAt: Date.now()});
  changed();
}

// ---------- Sync only: records exactly as they came from another computer ----------

export async function putSyncedOriginal(meta: OriginalPdf, bytes: ArrayBuffer | null, copyOf?: string) {
  let file = bytes;
  // A conflict copy («Conservar las dos») takes this computer's file.
  if (!file && copyOf) file = (await loadOriginalData(copyOf)) || null;
  if (file) await localStore.set(dataKey(meta.id), file);
  const hasFile = Boolean(file || await loadOriginalData(meta.id));
  await localStore.set(metaKey(meta.id), {id: meta.id, name: meta.name, size: meta.size, createdAt: meta.createdAt, updatedAt: meta.updatedAt, missing: !hasFile, ...(meta.version && !copyOf ? {version: meta.version} : {})});
}

export async function removeSyncedOriginal(id: string) {
  for (const version of await listVersions(id)) await removeVersion(version);
  await localStore.remove(dataKey(id));
  await localStore.remove(metaKey(id));
}

/** Every version of every PDF, for sync. */
export async function listAllVersions(): Promise<PdfVersion[]> {
  const keys = (await localStore.keys()).filter(k => k.startsWith('pdfver:'));
  const items = await Promise.all(keys.map(k => localStore.get<PdfVersion>(k)));
  return items.filter((v): v is PdfVersion => Boolean(v?.id));
}

export async function putSyncedVersion(version: PdfVersion, bytes: ArrayBuffer | null) {
  const has = bytes || await loadVersionData(version.id);
  await writeVersion({id: version.id, docId: version.docId, label: version.label, createdAt: version.createdAt, size: version.size, ...(version.parent ? {parent: version.parent} : {}), missing: !has}, bytes);
}

export async function removeSyncedVersion(id: string) {
  const version = (await listAllVersions()).find(v => v.id === id);
  if (version) await removeVersion(version);
}

export function bytesToDataUrl(bytes: ArrayBuffer) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(Error('READ_FAILED'));
    reader.readAsDataURL(new Blob([bytes], {type: 'application/pdf'}));
  });
}

export async function dataUrlToBytes(dataUrl: string) {
  return (await (await fetch(dataUrl)).blob()).arrayBuffer();
}
