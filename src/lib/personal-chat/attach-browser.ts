'use client';
import {attachmentLimits, type ChatAttachment} from './attachments';
import {readText} from '@/lib/books/import/browser';
import {htmlToNodes, parseHtml} from '@/lib/books/import/html';
import type {ImportNode} from '@/lib/books/import/model';

// Files attached in the Chat are prepared in this browser: images are scaled down, documents are read to text.
// Then the result (not the original file) is stored once by hash in /api/sync/assets, like a book's images.

export const acceptAttachments = 'image/png,image/jpeg,image/webp,image/gif,image/avif,.pdf,.docx,.txt,.md,.markdown,.html,.htm,.csv,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/html,text/csv,application/json';

export class AttachError extends Error {}

const previews = new Map<string, string>();
/** A local preview of an image attached from this browser, so it shows before (and without) downloading it again. */
export const localPreview = (hash: string) => previews.get(hash);

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const storeErrors: Record<string, string> = {
  AUTH_REQUIRED: 'La sesión terminó. Volvé a iniciar sesión.',
  ITEM_TOO_LARGE: 'El archivo preparado sigue siendo demasiado grande.',
  RATE_LIMIT: 'Se subieron muchos archivos seguidos. Esperá un minuto.',
  SYNC_NOT_READY: 'El almacenamiento de archivos del estudio no está listo en el servidor.',
};

async function store(bytes: Uint8Array, mime: string) {
  const hash = await sha256(bytes);
  let r: Response;
  try {
    r = await fetch('/api/sync/assets', {method: 'POST', headers: {'Content-Type': mime}, body: bytes as BodyInit});
  } catch {
    throw new AttachError('No se pudo subir el archivo. Revisá la conexión.');
  }
  const body = await r.json().catch(() => ({})) as {hash?: string; error?: string};
  if (!r.ok) throw new AttachError(storeErrors[body.error || ''] || 'No se pudo guardar el archivo en el estudio. Probá de nuevo.');
  if (body.hash !== hash) throw new AttachError('El archivo llegó distinto al servidor. Probá de nuevo.');
  return hash;
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new AttachError('No se pudo preparar la imagen.')), type, quality));

/** Images keep their file when they are already small; otherwise they are scaled to 2048 px and saved as JPEG. */
async function prepareImage(file: File) {
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new AttachError('Este navegador no puede abrir esa imagen. Probá con PNG, JPEG o WebP.'); }
  const side = attachmentLimits.imageSide;
  const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && /^image\/(png|jpeg|webp)$/.test(file.type) && file.size <= 3_000_000) {
    bitmap.close();
    return {bytes: new Uint8Array(await file.arrayBuffer()), mime: file.type as 'image/png' | 'image/jpeg' | 'image/webp'};
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new AttachError('No se pudo preparar la imagen.');
  // JPEG has no transparency: transparent areas become white, as on a page.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let blob = await toBlob(canvas, 'image/jpeg', 0.88);
  if (blob.size > 3_500_000) blob = await toBlob(canvas, 'image/jpeg', 0.75);
  return {bytes: new Uint8Array(await blob.arrayBuffer()), mime: 'image/jpeg' as const};
}

type Source = NonNullable<ChatAttachment['source']>;
function sourceOf(file: File): Source {
  const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
  if (ext === 'pdf' || file.type === 'application/pdf') return 'pdf';
  if (ext === 'docx' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (ext === 'html' || ext === 'htm' || file.type === 'text/html') return 'html';
  if (ext === 'md' || ext === 'markdown' || file.type === 'text/markdown') return 'markdown';
  if (ext === 'csv' || file.type === 'text/csv') return 'csv';
  if (ext === 'json' || file.type === 'application/json') return 'json';
  if (ext === 'txt' || file.type === 'text/plain') return 'text';
  if (ext === 'doc') throw new AttachError('Los .doc (Word 97-2003) no se pueden leer acá. Guardalo como .docx o PDF.');
  throw new AttachError('Ese tipo de archivo no se puede adjuntar. Sirven imágenes, PDF, Word (.docx), texto, Markdown, HTML, CSV y JSON.');
}

function nodesToText(nodes: ImportNode[]) {
  return nodes.map(n => n.kind === 'heading' ? '#'.repeat(n.level) + ' ' + n.text
    : n.kind === 'list' ? n.items.map((t, i) => (n.ordered ? i + 1 + '.' : '-') + ' ' + t).join('\n')
      : n.kind === 'table' ? n.rows.map(r => '| ' + r.join(' | ') + ' |').join('\n')
        : n.kind === 'image' ? '' : n.text).filter(Boolean).join('\n\n');
}

/** The document's text as the file has it: nothing is summarized or rewritten. */
async function readDocument(file: File, source: Source): Promise<{text: string; pages?: number; emptyPages?: number}> {
  if (source === 'pdf') {
    const {openPdf, pageText} = await import('@/lib/pdf/viewer');
    let doc;
    try { doc = await openPdf(await file.arrayBuffer()); } catch (e) {
      throw new AttachError((e as Error).message === 'PDF_PASSWORD' ? 'Ese PDF tiene contraseña. Quitásela y adjuntalo de nuevo.' : 'No se pudo abrir ese PDF.');
    }
    try {
      const pages: string[] = [];
      let empty = 0;
      for (let n = 1; n <= doc.numPages; n++) {
        const text = await pageText(await doc.getPage(n));
        if (!text) empty++;
        pages.push('— Página ' + n + ' —\n' + (text || '(sin texto: página escaneada o solo imagen)'));
      }
      if (empty === doc.numPages) throw new AttachError('Ese PDF no tiene texto que se pueda leer (parece escaneado). Pasalo por «Reconocer texto (OCR)» en PDF Studio y adjuntalo de nuevo.');
      return {text: pages.join('\n\n'), pages: doc.numPages, emptyPages: empty};
    } finally {
      void doc.loadingTask.destroy();
    }
  }
  if (source === 'docx') {
    const mammoth = (await import('mammoth')).default;
    try { return {text: (await mammoth.extractRawText({arrayBuffer: await file.arrayBuffer()})).value}; } catch { throw new AttachError('No se pudo leer ese archivo de Word. Guardalo de nuevo como .docx.'); }
  }
  const raw = await readText(file);
  if (source === 'html') {
    const parsed = new DOMParser().parseFromString(raw, 'text/html');
    return {text: nodesToText(htmlToNodes(parseHtml(parsed.body.innerHTML)).nodes)};
  }
  return {text: raw};
}

const clean = (text: string) => text.normalize('NFC').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\n{3,}/g, '\n\n').trim();

/** Prepares one file and stores it; returns the reference the message keeps. */
export async function attachFile(file: File): Promise<ChatAttachment> {
  if (file.size > attachmentLimits.fileBytes) throw new AttachError('El archivo pesa más de 50 MB.');
  const name = (file.name || 'imagen').slice(0, 200);
  if (file.type.startsWith('image/')) {
    const {bytes, mime} = await prepareImage(file);
    const hash = await store(bytes, mime);
    previews.set(hash, URL.createObjectURL(new Blob([bytes as BlobPart], {type: mime})));
    return {kind: 'image', hash, mime, name, size: file.size};
  }
  const source = sourceOf(file);
  const read = await readDocument(file, source);
  const full = clean(read.text);
  if (!full) throw new AttachError('El archivo no tiene texto para leer.');
  const kept = full.slice(0, attachmentLimits.documentChars);
  const hash = await store(new TextEncoder().encode(kept), 'text/plain');
  return {
    kind: 'document', hash, mime: 'text/plain', name, size: file.size, source, chars: full.length,
    ...(read.pages ? {pages: read.pages} : {}), ...(read.emptyPages ? {emptyPages: read.emptyPages} : {}),
    ...(kept.length < full.length ? {truncated: true} : {}),
  };
}
