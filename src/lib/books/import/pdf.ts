import type {PDFDocumentProxy, PDFPageProxy} from 'pdfjs-dist';
import type {ImportedDoc} from './model';
import {pagesToNodes, type PdfImage, type PdfItem, type PdfPage} from './pdf-layout';

// Reads a loaded pdf.js document (browser or Node) into ImportNodes. Pixels are only touched through
// `pixels`, which the browser provides; without it (tests, Node) only the text is read.

export const MAX_PDF_PAGES = 150;

export type PdfPixels = {
  /** An image object from pdf.js (bitmap or raw pixels) → data URL, or null if it cannot be used. */
  image: (data: unknown) => Promise<string | null>;
  /** The whole page drawn as a picture → data URL (for scanned pages). */
  page: (page: PDFPageProxy) => Promise<string | null>;
};

export type PdfReadOptions = {
  OPS: Record<string, number>;
  pixels?: PdfPixels;
  onProgress?: (page: number, total: number) => void;
  signal?: AbortSignal;
};

type Matrix = [number, number, number, number, number, number];
const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
];

function objectOf(page: PDFPageProxy, id: string, ms = 5000): Promise<unknown> {
  const store = id.startsWith('g_') ? page.commonObjs : page.objs;
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), ms);
    try { store.get(id, (value: unknown) => { clearTimeout(timer); resolve(value); }); } catch { clearTimeout(timer); resolve(null); }
  });
}

/** Images painted on the page with their vertical position; icons, rules and full-page backgrounds are skipped. */
async function pageImages(page: PDFPageProxy, width: number, height: number, ops: Record<string, number>, list: {fnArray: number[]; argsArray: unknown[][]}, pixels: PdfPixels, hasText: boolean): Promise<PdfImage[]> {
  const out: PdfImage[] = [];
  const stack: Matrix[] = [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = list.fnArray[i];
    const args = list.argsArray[i];
    if (fn === ops.save) stack.push(ctm);
    else if (fn === ops.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === ops.transform) ctm = multiply(args as Matrix, ctm);
    else if (fn === ops.paintImageXObject && typeof args?.[0] === 'string') {
      const xs = [ctm[4], ctm[0] + ctm[4], ctm[2] + ctm[4], ctm[0] + ctm[2] + ctm[4]];
      const ys = [ctm[5], ctm[1] + ctm[5], ctm[3] + ctm[5], ctm[1] + ctm[3] + ctm[5]];
      const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
      if (w < 40 || h < 40 || w * h < width * height * 0.015) continue;
      if (hasText && w * h > width * height * 0.85) continue;
      if (out.length >= 30) break;
      const dataUrl = await pixels.image(await objectOf(page, args[0]));
      if (dataUrl) out.push({top: Math.max(...ys), bottom: Math.min(...ys), dataUrl});
    }
  }
  return out;
}

export async function readPdfDocument(doc: PDFDocumentProxy, fileName: string, options: PdfReadOptions): Promise<ImportedDoc> {
  const total = Math.min(doc.numPages, MAX_PDF_PAGES);
  const pages: PdfPage[] = [];
  let pageSize: {width: number; height: number} | undefined;
  let lostImages = 0;
  for (let n = 1; n <= total; n++) {
    if (options.signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
    options.onProgress?.(n, total);
    const page = await doc.getPage(n);
    try {
      const viewport = page.getViewport({scale: 1});
      const [x0, y0] = [viewport.viewBox[0], viewport.viewBox[1]];
      const width = viewport.viewBox[2] - x0, height = viewport.viewBox[3] - y0;
      if (n === 1) pageSize = {width, height};
      // The operator list loads the fonts (to know which are bold) and lists the images.
      let list: {fnArray: number[]; argsArray: unknown[][]} | null = null;
      try { list = await page.getOperatorList() as unknown as {fnArray: number[]; argsArray: unknown[][]}; } catch {}
      const content = await page.getTextContent();
      const bold = new Map<string, boolean>();
      const isBold = (font: string) => {
        if (!bold.has(font)) {
          let value = false;
          try {
            if (page.commonObjs.has(font)) {
              const f = page.commonObjs.get(font) as {bold?: boolean; black?: boolean; name?: string};
              value = Boolean(f?.bold || f?.black || /bold|black|heavy|semibold|demi/i.test(f?.name || ''));
            }
          } catch {}
          bold.set(font, value);
        }
        return bold.get(font)!;
      };
      const items: PdfItem[] = [];
      for (const it of content.items) {
        if (!('str' in it) || !it.str) continue;
        const t = it.transform as number[];
        const size = Math.hypot(t[2], t[3]) || it.height;
        // Vertical text (rotated pieces) does not fit the reading-order rules; it is left out.
        if (Math.abs(t[1]) > Math.abs(t[0]) * 0.2) continue;
        items.push({text: it.str, x: t[4] - x0, y: t[5] - y0, w: it.width, size, bold: isBold(it.fontName)});
      }
      const chars = items.reduce((c, it) => c + it.text.replace(/\s/g, '').length, 0);
      let images: PdfImage[] = [];
      let scan: string | undefined;
      if (options.pixels) {
        if (chars < 15) scan = (await options.pixels.page(page)) || undefined;
        else if (list) {
          try { images = await pageImages(page, width, height, options.OPS, list, options.pixels, true); } catch { lostImages++; }
        }
      }
      pages.push({number: n, width, height, items, images, scan});
    } finally {
      page.cleanup();
    }
  }

  const layout = pagesToNodes(pages);
  const notes = [...layout.notes];
  if (doc.numPages > total) notes.unshift('El PDF tiene ' + doc.numPages + ' páginas; se leyeron las primeras ' + total + '.');
  if (!options.pixels) notes.push('Las imágenes del PDF no se leyeron.');
  if (lostImages) notes.push('No se pudieron leer las imágenes de ' + (lostImages === 1 ? 'una página' : lostImages + ' páginas') + '.');
  let title: string | undefined;
  try {
    const meta = await doc.getMetadata();
    const value = (meta.info as {Title?: unknown})?.Title;
    // Many PDFs carry a placeholder title (the file name, «Untitled», «Microsoft Word - …»).
    if (typeof value === 'string' && value.trim() && !/^(untitled|sin título|microsoft word|document\d*|\S+\.(docx?|pdf|indd))/i.test(value.trim())) title = value.trim();
  } catch {}
  return {source: 'pdf', fileName, title, pages: doc.numPages, pageSize, nodes: layout.nodes, notes};
}
