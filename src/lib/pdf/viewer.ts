'use client';
import type {PDFDocumentProxy, PDFPageProxy, RenderTask} from 'pdfjs-dist';

// pdf.js in this browser, to show an imported PDF: pages, thumbnails and the text layer that lets the author
// select text. The legacy build, as in the importer (src/lib/books/import/browser.ts).

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let lib: Promise<PdfJs> | null = null;

export function pdfjs() {
  lib ??= import('pdfjs-dist/legacy/build/pdf.mjs').then(m => {
    m.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
    return m;
  });
  lib.catch(() => { lib = null; });
  return lib;
}

export async function openPdf(bytes: ArrayBuffer): Promise<PDFDocumentProxy> {
  const m = await pdfjs();
  // pdf.js takes ownership of the buffer it receives: it gets a copy.
  const task = m.getDocument({
    data: new Uint8Array(bytes.slice(0)),
    cMapUrl: '/vendor/pdfjs/cmaps/', cMapPacked: true,
    standardFontDataUrl: '/vendor/pdfjs/standard_fonts/', wasmUrl: '/vendor/pdfjs/wasm/',
  });
  try {
    return await task.promise;
  } catch (e) {
    throw Error((e as {name?: string})?.name === 'PasswordException' ? 'PDF_PASSWORD' : 'PDF_INVALID');
  }
}

/** Draws a page into a canvas `width` CSS pixels wide, sharp on high-density screens. */
export function drawPage(page: PDFPageProxy, canvas: HTMLCanvasElement, width: number): {task: RenderTask; scale: number} {
  const base = page.getViewport({scale: 1});
  const scale = width / base.width;
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const viewport = page.getViewport({scale: scale * ratio});
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = Math.floor(base.width * scale) + 'px';
  canvas.style.height = Math.floor(base.height * scale) + 'px';
  return {task: page.render({canvas, viewport}), scale};
}

/** The text layer over a drawn page: invisible text in place, so it can be selected and copied. */
export async function drawTextLayer(page: PDFPageProxy, container: HTMLElement, scale: number) {
  const m = await pdfjs();
  container.replaceChildren();
  container.style.setProperty('--scale-factor', String(scale));
  container.style.setProperty('--total-scale-factor', String(scale));
  const layer = new m.TextLayer({textContentSource: page.streamTextContent(), container, viewport: page.getViewport({scale})});
  await layer.render();
  return layer;
}

/**
 * Text as pdf.js extracts it, cleaned without guessing: control characters some PDFs map to their glyphs are dropped,
 * and spaces before a Russian stress mark (U+0301) go, since a mark never starts a word. Some PDFs (LibreOffice with
 * combining marks) still show a stray space after a stressed vowel; it is left, because it cannot be told apart from
 * a real space between words.
 */
export function joinStress(text: string) {
  return text.normalize('NFC').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').replace(/[^\S\n]+(?=\u0301)/g, '');
}

/** The page's text in reading order as pdf.js gives it; empty for a scanned page. */
export async function pageText(page: PDFPageProxy) {
  const content = await page.getTextContent();
  let out = '';
  for (const item of content.items) {
    if (!('str' in item)) continue;
    out += item.str + (item.hasEOL ? '\n' : '');
  }
  return joinStress(out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim());
}

/** Page size in points (as the page is shown, rotation included). */
export function pageSize(page: PDFPageProxy) {
  const v = page.getViewport({scale: 1});
  return {width: v.width, height: v.height};
}
