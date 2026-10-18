import {PDFDict, PDFDocument, PDFName, PDFNull, PDFNumber, PDFBool, PDFRef, type PDFFont, type PDFObject} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {lineLayout, noShaping, type EditorFonts} from './fonts';
import {elementBox} from './elements';
import {type Clip, type Color, type Element, type FontId, type ImageData, type PathOp, type Unit} from './model';

// Writes a unit as a PDF. Same input, same bytes: no dates or random names are added, so two exports of an
// unchanged unit are identical and can be compared.
//
// - Text is written with the editor's DejaVu Sans, letter by letter (no shaping), at the exact position it had.
// - Images imported from a PDF are written back with their original encoded bytes: nothing is re-compressed.
// - Shapes, clips and opacity are written as they were read.
// - A page the reader could not take apart is drawn from the original PDF, unchanged.

export type ElementBox = {page: number; block: string; element: string; box: [number, number, number, number]};
export type Overflow = {page: number; block: string; element: string; width: number; maxWidth: number};
export type RenderResult = {bytes: Uint8Array; boxes: ElementBox[]; overflows: Overflow[]; /** Assets that were not available: their images are left out. */ missing: string[]};
export type RenderOptions = {
  fonts: EditorFonts;
  /** Bytes of an asset of the unit, by hash; null when this computer does not have it (yet). */
  asset: (hash: string) => Promise<Uint8Array | null>;
  /** Only these pages (indexes), for a quick preview of one page. All pages when absent. */
  pages?: number[];
};

class MissingAsset extends Error {}

const fmt = (n: number) => {
  if (!Number.isFinite(n)) throw new Error('Número inválido en la página.');
  const r = Math.round(n * 1e4) / 1e4;
  return Object.is(r, -0) ? '0' : String(r);
};

function colorOps(c: Color, stroke: boolean) {
  const v = c.c.map(fmt).join(' ');
  if (c.space === 'rgb') return v + (stroke ? ' RG' : ' rg');
  if (c.space === 'cmyk') return v + (stroke ? ' K' : ' k');
  return v + (stroke ? ' G' : ' g');
}

function pathOps(ops: PathOp[]) {
  const out: string[] = [];
  for (const op of ops) {
    if (op[0] === 'M') out.push(fmt(op[1]) + ' ' + fmt(op[2]) + ' m');
    else if (op[0] === 'L') out.push(fmt(op[1]) + ' ' + fmt(op[2]) + ' l');
    else if (op[0] === 'C') out.push(op.slice(1).map(v => fmt(v as number)).join(' ') + ' c');
    else out.push('h');
  }
  return out.join('\n');
}

const clipOps = (clips: Clip[] | undefined) => (clips || []).map(c => pathOps(c.path) + (c.evenOdd ? '\nW* n' : '\nW n')).join('\n');

/** A PDF value from what the reader stored in decodeParms. */
function parmValue(v: number | boolean | string): PDFObject {
  if (typeof v === 'number') return PDFNumber.of(v);
  if (typeof v === 'boolean') return (v ? PDFBool.True : PDFBool.False);
  return PDFName.of(v.replace(/^\//, ''));
}

export async function renderUnit(unit: Unit, opts: RenderOptions): Promise<RenderResult> {
  const doc = await PDFDocument.create({updateMetadata: false});
  doc.registerFontkit(fontkit);
  const ctx = doc.context;
  doc.setTitle(unit.title || 'Unidad');
  doc.setProducer('Ruski Code Studio');
  doc.setCreator('PDF Studio · Manual');

  const fonts = new Map<FontId, PDFFont>();
  const font = async (id: FontId) => {
    let f = fonts.get(id);
    if (!f) {
      f = await doc.embedFont(opts.fonts[id].bytes, {subset: true, features: noShaping, customName: id === 'bold' ? 'DejaVuSans-Bold' : 'DejaVuSans'});
      fonts.set(id, f);
    }
    return f;
  };

  const missing = new Set<string>();
  const assetCache = new Map<string, Promise<Uint8Array>>();
  const assetBytes = (hash: string) => {
    let p = assetCache.get(hash);
    if (!p) {
      p = opts.asset(hash).then(b => { if (!b) { missing.add(hash); throw new MissingAsset(hash); } return b; });
      assetCache.set(hash, p);
    }
    return p;
  };

  const xobjects = new Map<string, Promise<PDFRef>>();
  const rawImage = async (data: ImageData, smask?: PDFRef): Promise<PDFRef> => {
    const bytes = await assetBytes(data.asset);
    if (data.format === 'jpeg') return (await doc.embedJpg(bytes)).ref;
    if (data.format === 'png') return (await doc.embedPng(bytes)).ref;
    const dict: Record<string, PDFObject> = {
      Type: PDFName.of('XObject'), Subtype: PDFName.of('Image'),
      Width: PDFNumber.of(data.width), Height: PDFNumber.of(data.height),
      BitsPerComponent: PDFNumber.of(data.bitsPerComponent ?? 8),
    };
    if (data.colorSpace) dict.ColorSpace = PDFName.of(data.colorSpace);
    if (data.filters?.length) dict.Filter = ctx.obj(data.filters.map(f => PDFName.of(f)));
    if (data.decodeParms) {
      dict.DecodeParms = ctx.obj(data.decodeParms.map(p => {
        if (!p) return PDFNull;
        const d = PDFDict.withContext(ctx);
        for (const [k, v] of Object.entries(p)) d.set(PDFName.of(k), parmValue(v));
        return d;
      }));
    }
    if (data.decode) dict.Decode = ctx.obj(data.decode.map(v => PDFNumber.of(v)));
    if (data.interpolate !== undefined) dict.Interpolate = (data.interpolate ? PDFBool.True : PDFBool.False);
    if (smask) dict.SMask = smask;
    const stream = ctx.stream(bytes, dict);
    return ctx.register(stream);
  };
  const imageRef = (data: ImageData, smask?: ImageData) => {
    const key = data.asset + '/' + (smask?.asset || '') + '/' + JSON.stringify([data, smask]);
    let p = xobjects.get(key);
    if (!p) {
      p = (async () => {
        // A missing transparency mask leaves the picture without it rather than out.
        const mask = smask ? await rawImage(smask).catch(e => { if (e instanceof MissingAsset) return undefined; throw e; }) : undefined;
        return rawImage(data, mask);
      })();
      xobjects.set(key, p);
    }
    return p;
  };

  let source: PDFDocument | null = null;
  const sourcePage = async (index: number) => {
    if (!unit.source) { missing.add('source'); throw new MissingAsset('source'); }
    source ??= await PDFDocument.load(await assetBytes(unit.source.asset), {updateMetadata: false});
    const original = source.getPage(index);
    const box = original.getMediaBox();
    // A little wider than the page: what the original draws up to its edge is cut by the page, as in the original,
    // and not one pixel earlier by the copy's own border.
    const m = 2;
    const embedded = await doc.embedPage(original, {left: box.x - m, bottom: box.y - m, right: box.x + box.width + m, top: box.y + box.height + m});
    return {embedded, dx: -m, dy: -m};
  };

  const boxes: ElementBox[] = [];
  const overflows: Overflow[] = [];
  const indexes = opts.pages ?? unit.pages.map((_, i) => i);

  for (const pageIndex of indexes) {
    const page = unit.pages[pageIndex];
    if (!page) continue;
    const pdfPage = doc.addPage([page.width, page.height]);
    const node = pdfPage.node;
    const out: string[] = [];
    const fontNames = new Map<FontId, PDFName>();
    const fontName = async (id: FontId) => {
      let n = fontNames.get(id);
      if (!n) { n = node.newFontDictionary(id === 'bold' ? 'FB' : 'FR', (await font(id)).ref); fontNames.set(id, n); }
      return n;
    };
    const alphaNames = new Map<number, PDFName>();
    const alphaName = (a: number) => {
      let n = alphaNames.get(a);
      if (!n) {
        n = node.newExtGState('GA', ctx.obj({Type: 'ExtGState', ca: a, CA: a}));
        alphaNames.set(a, n);
      }
      return n;
    };

    if (page.conserved) {
      try {
        const {embedded, dx, dy} = await sourcePage(page.conserved.sourcePage);
        const name = node.newXObject('Orig', embedded.ref);
        out.push('q 1 0 0 1 ' + fmt(dx) + ' ' + fmt(dy) + ' cm ' + name.asString() + ' Do Q');
      } catch (e) {
        if (!(e instanceof MissingAsset)) throw e;
      }
    }

    const elements: {el: Element; block: string}[] = [];
    for (const block of page.blocks) for (const el of block.elements) elements.push({el, block: block.id});
    elements.sort((a, b) => a.el.z - b.el.z);

    for (const {el, block} of elements) {
      const pre: string[] = ['q'];
      const clips = clipOps(el.clips);
      if (clips) pre.push(clips);
      if (el.opacity !== undefined && el.opacity < 1) pre.push(alphaName(el.opacity).asString() + ' gs');

      if (el.kind === 'text') {
        out.push(...pre, 'BT');
        if (el.mode) out.push(el.mode + ' Tr');
        const {starts} = lineLayout(opts.fonts, el);
        let last: {font?: FontId; size?: number; color?: string; tc?: number; tz?: number} = {};
        for (let i = 0; i < el.spans.length; i++) {
          const span = el.spans[i];
          if (!span.text) continue;
          const f = await font(span.font);
          if (last.font !== span.font || last.size !== span.size) out.push((await fontName(span.font)).asString() + ' ' + fmt(span.size) + ' Tf');
          const color = colorOps(span.color, false);
          if (last.color !== color) out.push(color);
          if ((last.tc ?? 0) !== (span.charSpacing ?? 0)) out.push(fmt(span.charSpacing ?? 0) + ' Tc');
          if ((last.tz ?? 100) !== (span.scale ?? 100)) out.push(fmt(span.scale ?? 100) + ' Tz');
          last = {font: span.font, size: span.size, color, tc: span.charSpacing ?? 0, tz: span.scale ?? 100};
          out.push('1 0 0 1 ' + fmt(starts[i]) + ' ' + fmt(el.y) + ' Tm');
          if (span.wordSpacing) {
            // Word spacing (Tw) does not apply to two-byte fonts: the space after each word is added by hand.
            const parts = span.text.split(' ');
            const adjust = fmt(-span.wordSpacing * 1000 / span.size / ((span.scale ?? 100) / 100));
            out.push('[' + parts.map((p, k) => (k ? f.encodeText(' ').toString() + ' ' + adjust + ' ' : '') + (p ? f.encodeText(p).toString() : '')).join(' ') + '] TJ');
          } else out.push(f.encodeText(span.text).toString() + ' Tj');
        }
        out.push('ET', 'Q');
        const box = elementBox(opts.fonts, el);
        boxes.push({page: pageIndex, block, element: el.id, box});
        if (el.maxWidth !== undefined) {
          const width = box[2] - el.x;
          if (width > el.maxWidth + 0.5) overflows.push({page: pageIndex, block, element: el.id, width, maxWidth: el.maxWidth});
        }
      } else if (el.kind === 'image') {
        const ref = await imageRef(el.image, el.smask).catch(e => { if (e instanceof MissingAsset) return null; throw e; });
        if (ref) {
          const name = node.newXObject('Im', ref);
          out.push(...pre, el.matrix.map(fmt).join(' ') + ' cm', name.asString() + ' Do', 'Q');
        }
        boxes.push({page: pageIndex, block, element: el.id, box: elementBox(opts.fonts, el)});
      } else {
        out.push(...pre);
        if (el.fill) out.push(colorOps(el.fill.color, false));
        if (el.stroke) {
          const s = el.stroke;
          out.push(colorOps(s.color, true), fmt(s.width) + ' w');
          if (s.cap) out.push(s.cap + ' J');
          if (s.join) out.push(s.join + ' j');
          if (s.miter !== undefined) out.push(fmt(s.miter) + ' M');
          if (s.dash) out.push('[' + s.dash[0].map(fmt).join(' ') + '] ' + fmt(s.dash[1]) + ' d');
        }
        out.push(pathOps(el.ops));
        const paint = el.fill && el.stroke ? (el.fill.evenOdd ? 'B*' : 'B') : el.fill ? (el.fill.evenOdd ? 'f*' : 'f') : 'S';
        out.push(paint, 'Q');
        boxes.push({page: pageIndex, block, element: el.id, box: elementBox(opts.fonts, el)});
      }
    }
    const content = ctx.flateStream(new TextEncoder().encode(out.join('\n')));
    node.set(PDFName.of('Contents'), ctx.register(content));
  }

  const bytes = await doc.save({useObjectStreams: true});
  return {bytes, boxes, overflows, missing: [...missing]};
}

/** The element ids of a page that the render reported, by position: for clicking on the page. */
export function hitTest(boxes: ElementBox[], page: number, x: number, y: number) {
  return boxes.filter(b => b.page === page && x >= b.box[0] && x <= b.box[2] && y >= b.box[1] && y <= b.box[3]);
}
