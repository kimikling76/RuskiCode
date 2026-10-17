'use client';
import type {PDFPageProxy} from 'pdfjs-dist';
import {blobToDataUrl} from '../images';
import type {ImportedDoc} from './model';
import {textToNodes} from './text';
import {htmlToNodes, parseHtml} from './html';
import {readPdfDocument, type PdfPixels} from './pdf';
import {readDocx} from './docx';

// The file is converted in this browser: it is not uploaded, and no AI reads it.
// pdf.js and mammoth are large, so they load only when a file of their kind is imported.

export const acceptedFiles = '.pdf,.docx,.txt,.md,.markdown,.html,.htm,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/html,application/json';
export const MAX_IMPORT_BYTES = 50_000_000;

export type ImportKind = 'pdf' | 'docx' | 'html' | 'markdown' | 'text' | 'json';

export class ImportError extends Error {
  constructor(public code: 'UNSUPPORTED' | 'OLD_WORD' | 'OTHER_OFFICE' | 'TOO_LARGE' | 'PDF_PASSWORD' | 'PDF_INVALID' | 'DOCX_INVALID' | 'EMPTY' | 'READ_FAILED', message: string) { super(message); }
}

export function kindOf(file: File): ImportKind {
  const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
  if (ext === 'pdf' || file.type === 'application/pdf') return 'pdf';
  if (ext === 'docx' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (ext === 'html' || ext === 'htm' || file.type === 'text/html') return 'html';
  if (ext === 'md' || ext === 'markdown' || file.type === 'text/markdown') return 'markdown';
  if (ext === 'json' || file.type === 'application/json') return 'json';
  if (ext === 'txt' || file.type === 'text/plain') return 'text';
  if (ext === 'doc' || ext === 'dot') throw new ImportError('OLD_WORD', 'Los archivos .doc (Word 97-2003) no se pueden leer acá. Abrilo en Word y elegí «Guardar como» → .docx o PDF.');
  if (['odt', 'rtf', 'pages', 'wps', 'gdoc'].includes(ext)) throw new ImportError('OTHER_OFFICE', 'Ese formato no se puede leer acá. Guardalo como .docx o PDF desde el programa en el que lo escribiste.');
  if (['pptx', 'ppt', 'key', 'odp'].includes(ext)) throw new ImportError('OTHER_OFFICE', 'Las presentaciones no se importan directo. Exportala como PDF y traé ese archivo.');
  throw new ImportError('UNSUPPORTED', 'Ese tipo de archivo no se puede importar. Sirven PDF, Word (.docx), texto (.txt, .md), HTML y el editable de PDF Studio (.json).');
}

/** Text files are usually UTF-8; old Russian files are often Windows-1251. */
export async function readText(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  try { return new TextDecoder('utf-8', {fatal: true}).decode(bytes); } catch {}
  const cyrillic = new TextDecoder('windows-1251').decode(bytes);
  const letters = (cyrillic.match(/\p{L}/gu) || []).length || 1;
  return (cyrillic.match(/[а-яё]/gi) || []).length / letters > 0.3 ? cyrillic : new TextDecoder('windows-1252').decode(bytes);
}

function canvasOf(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('IMAGE_CANVAS');
  return {canvas, ctx};
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) => new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error('IMAGE_ENCODE')), type, quality));

/** Any image the browser can draw → a data URL the book accepts (PNG, JPEG or WebP, scaled down). */
async function usableImage(dataUrl: string): Promise<string | null> {
  const blob = await (await fetch(dataUrl)).blob();
  if (/^image\/(png|jpeg|webp)$/.test(blob.type)) return blobToDataUrl(blob);
  if (!/^image\/(gif|bmp|x-ms-bmp)$/.test(blob.type)) return null; // EMF, WMF, TIFF, SVG: not drawable here
  const bitmap = await createImageBitmap(blob);
  try {
    const {canvas, ctx} = canvasOf(bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, 0, 0);
    return blobToDataUrl(await toBlob(canvas, 'image/png'));
  } finally { bitmap.close(); }
}

type PdfImageObject = {width?: number; height?: number; bitmap?: ImageBitmap; data?: Uint8Array | Uint8ClampedArray; kind?: number};

const pdfPixels: PdfPixels = {
  async image(value) {
    const img = value as PdfImageObject | null;
    if (!img?.width || !img.height) return null;
    const {canvas, ctx} = canvasOf(img.width, img.height);
    if (img.bitmap) ctx.drawImage(img.bitmap, 0, 0);
    else if (img.data) {
      const rgba = new Uint8ClampedArray(img.width * img.height * 4);
      const px = img.width * img.height;
      if (img.kind === 3 && img.data.length >= px * 4) rgba.set(img.data.subarray(0, px * 4));
      else if (img.kind === 2 && img.data.length >= px * 3) for (let i = 0; i < px; i++) { rgba[i * 4] = img.data[i * 3]; rgba[i * 4 + 1] = img.data[i * 3 + 1]; rgba[i * 4 + 2] = img.data[i * 3 + 2]; rgba[i * 4 + 3] = 255; }
      else if (img.kind === 1) {
        // 1 bit per pixel, rows padded to whole bytes.
        const row = Math.ceil(img.width / 8);
        for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
          const on = (img.data[y * row + (x >> 3)] >> (7 - (x & 7))) & 1;
          const v = on ? 255 : 0, i = (y * img.width + x) * 4;
          rgba[i] = rgba[i + 1] = rgba[i + 2] = v; rgba[i + 3] = 255;
        }
      } else return null;
      ctx.putImageData(new ImageData(rgba, img.width, img.height), 0, 0);
    } else return null;
    return blobToDataUrl(await toBlob(canvas, 'image/png'));
  },
  async page(page: PDFPageProxy) {
    const base = page.getViewport({scale: 1});
    const viewport = page.getViewport({scale: Math.min(2.5, 1600 / base.width)});
    const {canvas, ctx} = canvasOf(viewport.width, viewport.height);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({canvas, canvasContext: ctx, viewport}).promise;
    // A scanned page is a photo: JPEG keeps it small enough for the book.
    for (const quality of [0.85, 0.75, 0.6]) {
      const data = canvas.toDataURL('image/jpeg', quality);
      if (data.length <= 3_900_000) return data;
    }
    return null;
  },
};

async function readPdf(file: File, onProgress?: (page: number, total: number) => void, signal?: AbortSignal) {
  // The legacy build carries polyfills for very new JavaScript (Map.getOrInsertComputed) that many
  // browsers still lack. The worker is copied from the same build by scripts/copy-vendor-assets.mjs.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: '/vendor/pdfjs/cmaps/', cMapPacked: true,
    standardFontDataUrl: '/vendor/pdfjs/standard_fonts/', wasmUrl: '/vendor/pdfjs/wasm/',
    // Font names (to tell bold text) are only sent with this on.
    fontExtraProperties: true,
  });
  let doc;
  try { doc = await task.promise; } catch (e) {
    const name = (e as {name?: string})?.name;
    if (name === 'PasswordException') throw new ImportError('PDF_PASSWORD', 'Ese PDF tiene contraseña. Abrilo, guardalo sin contraseña y probá de nuevo.');
    throw new ImportError('PDF_INVALID', 'No se pudo abrir ese PDF: parece dañado o no es un PDF.');
  }
  try {
    return await readPdfDocument(doc, file.name, {OPS: pdfjs.OPS as unknown as Record<string, number>, pixels: pdfPixels, onProgress, signal});
  } finally {
    void task.destroy();
  }
}

export type ImportProgress = {stage: 'loading' | 'reading' | 'done'; page?: number; total?: number};

/** Reads a file into ImportNodes (everything except the .json editable, which the caller opens as is). */
export async function readImport(file: File, {onProgress, signal}: {onProgress?: (p: ImportProgress) => void; signal?: AbortSignal} = {}): Promise<ImportedDoc> {
  if (file.size > MAX_IMPORT_BYTES) throw new ImportError('TOO_LARGE', 'El archivo pesa más de 50 MB. Dividilo o reducí sus imágenes.');
  const kind = kindOf(file);
  onProgress?.({stage: 'loading'});
  let doc: ImportedDoc;
  try {
    if (kind === 'pdf') doc = await readPdf(file, (page, total) => onProgress?.({stage: 'reading', page, total}), signal);
    else if (kind === 'docx') {
      const mammoth = (await import('mammoth')).default;
      try { doc = await readDocx({arrayBuffer: await file.arrayBuffer()}, file.name, mammoth, usableImage); } catch { throw new ImportError('DOCX_INVALID', 'No se pudo leer ese archivo de Word. Probá abrirlo en Word y guardarlo de nuevo como .docx.'); }
    } else if (kind === 'html') {
      const html = await readText(file);
      // The browser's parser repairs the markup; the small reader then walks clean HTML.
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const {nodes, notes} = htmlToNodes(parseHtml(parsed.body.innerHTML));
      doc = {source: 'html', fileName: file.name, title: parsed.title.trim() || undefined, nodes, notes};
    } else if (kind === 'markdown' || kind === 'text') {
      const {nodes, notes} = textToNodes(await readText(file), kind === 'markdown');
      doc = {source: kind, fileName: file.name, nodes, notes};
    } else throw new ImportError('UNSUPPORTED', 'Ese archivo se abre como editable.');
  } catch (e) {
    if (e instanceof ImportError || (e as {name?: string})?.name === 'AbortError') throw e;
    console.error('[import]', e instanceof Error ? e.name + ': ' + e.message : e);
    throw new ImportError('READ_FAILED', 'No se pudo leer el archivo. Probá de nuevo o guardalo en otro formato (PDF o .docx).');
  }
  if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
  onProgress?.({stage: 'done'});
  if (!doc.nodes.length) throw new ImportError('EMPTY', kind === 'pdf' ? 'Ese PDF no tiene texto que se pueda leer.' : 'El archivo no tiene contenido para importar.');
  return doc;
}
