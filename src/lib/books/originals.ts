'use client';
import {localStore} from './local-store';
import {libraryEvents} from './library';

// PDFs kept exactly as they are, edited in place with Nutrient (src/components/pdf/original-editor.tsx).
// The file and its details are stored apart, so listing and syncing never load every PDF into memory.

export type OriginalPdf = {
  id: string;
  name: string;
  size: number;
  createdAt: number;
  updatedAt: number;
  /** The file did not come with the record: it is larger than what sync carries, and stays on the other computer. */
  missing?: boolean;
};

/** «850 KB», «2,4 MB». */
export function fileSize(bytes: number) {
  return bytes < 1_000_000 ? Math.max(1, Math.round(bytes / 1000)) + ' KB' : (bytes / 1_000_000).toLocaleString('es-AR', {maximumFractionDigits: 1}) + ' MB';
}

/** PDFs up to this size travel with the account (the server takes files of at most 4 MB). */
export const SYNC_LIMIT = 4_000_000;

const metaKey = (id: string) => 'pdfmeta:' + id;
const dataKey = (id: string) => 'pdfdata:' + id;
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

export async function createOriginal(name: string, bytes: ArrayBuffer) {
  if (!isPdf(bytes)) throw Error('NOT_PDF');
  const now = Date.now();
  const meta: OriginalPdf = {id: crypto.randomUUID(), name: name.replace(/\.pdf$/i, '').slice(0, 200) || 'Documento', size: bytes.byteLength, createdAt: now, updatedAt: now};
  await localStore.set(dataKey(meta.id), bytes);
  await localStore.set(metaKey(meta.id), meta);
  changed();
  return meta.id;
}

export async function saveOriginalData(id: string, bytes: ArrayBuffer) {
  const meta = await getOriginal(id);
  if (!meta) throw Error('NOT_FOUND');
  await localStore.set(dataKey(id), bytes);
  await localStore.set(metaKey(id), {...meta, size: bytes.byteLength, updatedAt: Date.now(), missing: false} satisfies OriginalPdf);
  changed();
}

export async function deleteOriginal(id: string): Promise<{meta: OriginalPdf; bytes?: ArrayBuffer} | null> {
  const meta = await getOriginal(id);
  if (!meta) return null;
  const bytes = await loadOriginalData(id);
  await localStore.remove(dataKey(id));
  await localStore.remove(metaKey(id));
  changed();
  return {meta, bytes};
}

/** «Deshacer» after deleting: the same record and file come back. */
export async function restoreOriginal(saved: {meta: OriginalPdf; bytes?: ArrayBuffer}) {
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
  await localStore.set(metaKey(meta.id), {id: meta.id, name: meta.name, size: meta.size, createdAt: meta.createdAt, updatedAt: meta.updatedAt, missing: !hasFile});
}

export async function removeSyncedOriginal(id: string) {
  await localStore.remove(dataKey(id));
  await localStore.remove(metaKey(id));
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
