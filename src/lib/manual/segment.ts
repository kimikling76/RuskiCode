import type {EditorFonts} from './fonts';
import {clipBox, contains, inkBox, intersect, isWhite, luminance, plainText, rectOf, visibleBox, type Box} from './elements';
import type {ReadPage, ReadResult} from './pdf-read';
import type {Block, Element, Page, Unit} from './model';
import {extractTemplate} from './template';

// Turns the elements read from a page into blocks the editor can select: the page footer, the unit tab on the
// side, a background picture, the title and one block per exercise. Nothing is redrawn: each element stays as it
// was, with its painting order.
//
// Before that, leftovers of earlier edits are removed when that cannot change the page: text and pictures hidden
// under a white rectangle painted on top of them, and white rectangles that cover nothing. Clips that cut nothing
// from a line of text are dropped too, so a corrected line is not cut off. The import test renders the page before
// and after this cleanup and requires both to be identical.

export type PageReport = {index: number; blocks: number; hidden: number; covers: number; clips: number; unsupported?: string; warnings: string[]};
export type ImportReport = {pages: PageReport[]; editablePages: number; conservedPages: number; elements: number};

const AUDIO = /^\d{1,2}\.\d{2}$/;
const NUMBER = /^\d{1,2}[a-zа-яё]?$/i;

type Cleaned = {elements: Element[]; hidden: number; covers: number; clips: number};

/** Removes what can never be seen. Elements keep their order and ids. */
export function cleanup(fonts: EditorFonts, elements: Element[]): Cleaned {
  const alive = elements.map(() => true);
  const inks = elements.map(el => visibleBox(fonts, el, true));
  let hidden = 0, covers = 0, clips = 0;
  const coverBox = (el: Element): Box | null => {
    if (el.kind !== 'path' || !el.fill || (el.opacity ?? 1) < 1 || !isWhite(el.fill.color)) return null;
    if (el.stroke && !isWhite(el.stroke.color)) return null;
    const rect = rectOf(el.ops);
    if (!rect) return null;
    // A white outline widens the white area by half its width.
    const pad = el.stroke ? el.stroke.width / 2 : 0;
    let box: Box | null = [rect[0] - pad, rect[1] - pad, rect[2] + pad, rect[3] + pad];
    for (const c of el.clips || []) {
      if (!box) break;
      if (!rectOf(c.path)) return null;
      box = intersect(box, clipBox(c));
    }
    return box;
  };
  const coverIdx = elements.map((el, i) => [i, coverBox(el)] as const).filter((x): x is readonly [number, Box] => x[1] !== null);
  // 1. Anything entirely under a white rectangle painted later is hidden.
  for (const [ci, box] of coverIdx) {
    for (let i = 0; i < ci; i++) {
      const ink = inks[i];
      if (!alive[i] || (ink && !contains(box, ink))) continue;
      alive[i] = false;
      hidden++;
    }
  }
  // 2. A white rectangle over nothing (on white paper) cannot be seen.
  for (const [ci] of coverIdx) {
    if (!alive[ci]) continue;
    const box = inks[ci];
    if (!box) { alive[ci] = false; covers++; continue; }
    let over = false;
    for (let i = 0; i < ci && !over; i++) {
      const ink = inks[i];
      if (alive[i] && ink && intersect(box, ink)) over = true;
    }
    if (!over) { alive[ci] = false; covers++; }
  }
  // 3. Rectangular clips that cut nothing from a line of text or a picture.
  const out: Element[] = [];
  elements.forEach((el, i) => {
    if (!alive[i]) return;
    if (el.clips?.length && el.kind !== 'path') {
      const ink = inkBox(fonts, el);
      const keep = el.clips.filter(c => !(rectOf(c.path) && contains(clipBox(c), ink)));
      if (keep.length !== el.clips.length) {
        clips += el.clips.length - keep.length;
        const {clips: _drop, ...rest} = el;
        void _drop;
        out.push((keep.length ? {...rest, clips: keep} : rest) as Element);
        return;
      }
    }
    out.push(el);
  });
  return {elements: out, hidden, covers, clips};
}

const center = (b: Box): [number, number] => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
const shorten = (s: string, n = 70) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

/** Exercise header bands: wide, low, light filled shapes with text on them. */
function findBands(fonts: EditorFonts, page: {width: number; height: number}, els: Element[]) {
  const bands: {el: Element; box: Box}[] = [];
  for (const el of els) {
    if (el.kind !== 'path' || !el.fill || el.stroke || (el.opacity ?? 1) < 1) continue;
    const box = visibleBox(fonts, el);
    if (!box) continue;
    const w = box[2] - box[0], h = box[3] - box[1];
    if (w < page.width * 0.45 || h < 12 || h > 64 || luminance(el.fill.color) < 0.7 || isWhite(el.fill.color)) continue;
    const hasText = els.some(t => t.kind === 'text' && t.z > el.z && t.x >= box[0] && t.x <= box[2] && t.y >= box[1] && t.y <= box[3]);
    if (hasText) bands.push({el, box});
  }
  return bands.sort((a, b) => b.box[3] - a.box[3]);
}

export function segmentPage(fonts: EditorFonts, page: ReadPage, pageId: string): {blocks: Block[]; report: PageReport} {
  const {elements, hidden, covers, clips} = cleanup(fonts, page.elements);
  const W = page.width, H = page.height;
  const boxes = new Map(elements.map(el => [el.id, visibleBox(fonts, el)] as const));
  const taken = new Set<string>();
  const blocks: Block[] = [];
  let n = 0;
  const block = (kind: Block['kind'], label: string, els: Element[], locked = false) => {
    if (!els.length) return;
    for (const el of els) taken.add(el.id);
    blocks.push({id: pageId + '-b' + (n++), kind, label, elements: els, ...(locked ? {locked: true} : {})});
  };
  const role = (el: Element, r: string): Element => ({...el, role: r});
  const free = () => elements.filter(el => !taken.has(el.id) && boxes.get(el.id));

  // Background picture (a cover, a full-page illustration).
  block('background', 'Imagen de fondo', free().filter(el => {
    const b = boxes.get(el.id)!;
    return el.kind === 'image' && (b[2] - b[0]) * (b[3] - b[1]) >= 0.8 * W * H;
  }), true);

  // Footer: what sits in the bottom 7 % of the page.
  const footer = free().filter(el => boxes.get(el.id)![3] < H * 0.07);
  block('footer', 'Pie de página', footer.map(el => el.kind === 'text' && NUMBER.test(plainText(el).trim()) ? role(el, 'page-number') : el.kind === 'text' ? role(el, 'footer-text') : el), true);

  // Unit tab on the right edge.
  const side = free().filter(el => boxes.get(el.id)![0] > W * 0.93);
  block('side', 'Pestaña de la unidad', side.map(el => el.kind === 'text' ? role(el, 'unit-tab') : role(el, 'unit-tab-shape')), true);

  // Sections: each header band and what follows it, down to the next band.
  const rest = free();
  const bands = findBands(fonts, page, rest);
  const sections: {band: Box; els: Element[]}[] = bands.map(b => ({band: b.box, els: []}));
  const title: Element[] = [];
  for (const el of rest) {
    const c = center(boxes.get(el.id)!);
    let at = -1;
    for (let i = 0; i < bands.length; i++) if (c[1] <= bands[i].box[3] + 0.5) at = i;
    if (at < 0) title.push(el); else sections[at].els.push(el);
  }
  if (bands.length) {
    const big = title.filter(el => el.kind === 'text').sort((a, b) => (b.kind === 'text' ? b.spans[0].size : 0) - (a.kind === 'text' ? a.spans[0].size : 0))[0];
    block('title', big ? shorten(plainText(big)) : 'Encabezado', title);
  } else {
    const texts = title.filter(el => el.kind === 'text');
    const big = texts.sort((a, b) => (b.kind === 'text' ? b.spans[0].size : 0) - (a.kind === 'text' ? a.spans[0].size : 0))[0];
    block('content', big ? 'Contenido · ' + shorten(plainText(big), 50) : 'Contenido de la página', title);
  }
  sections.forEach((s, i) => {
    const band = bands[i];
    const inBand = (el: Element) => { const b = boxes.get(el.id)!; return contains([band.box[0] - 2, band.box[1] - 2, band.box[2] + 2, band.box[3] + 2], b, 0.5); };
    const header = s.els.filter(el => el.z >= band.el.z && inBand(el));
    const texts = header.filter((el): el is Extract<Element, {kind: 'text'}> => el.kind === 'text').sort((a, b) => a.x - b.x);
    const numberEl = texts.find(t => NUMBER.test(plainText(t).trim()) && isWhite(t.spans[0].color));
    const badge = numberEl && header.find(el => el.kind === 'path' && el.fill && !isWhite(el.fill.color) && el !== band.el && contains(boxes.get(el.id)!, [numberEl.x, numberEl.y, numberEl.x + 1, numberEl.y + 1], 0));
    const audioEl = texts.find(t => AUDIO.test(plainText(t).trim()));
    const instrEl = texts.find(t => t !== numberEl && t !== audioEl && !isWhite(t.spans[0].color) && plainText(t).trim().length > 2);
    // The headphones: line drawings left of the instruction.
    const icon = new Set(header.filter(el => el.kind === 'path' && el.stroke && !el.fill && boxes.get(el.id)![2] <= (instrEl?.x ?? Infinity) + 1).map(el => el.id));
    const els = s.els.map(el => {
      if (el === band.el) return role(el, 'ex-band');
      if (el === badge) return role(el, 'ex-badge');
      if (el === numberEl) return role(el, 'ex-number');
      if (el === audioEl) return role(el, 'ex-audio');
      if (el === instrEl) return role(el, 'ex-instruction');
      if (icon.has(el.id)) return role(el, 'ex-icon');
      return el;
    });
    const parts = [numberEl ? 'Ejercicio ' + plainText(numberEl).trim() : '', audioEl ? plainText(audioEl).trim() : '', instrEl ? shorten(plainText(instrEl).trim(), 60) : ''].filter(Boolean);
    block('section', parts.join(' · ') || 'Sección', els);
  });

  // Painting order stays the page's: blocks are listed top to bottom, elements keep their z.
  const rank = (b: Block) => b.kind === 'background' ? -1 : b.kind === 'footer' ? 2 : b.kind === 'side' ? 3 : 0;
  blocks.sort((a, b) => rank(a) - rank(b));
  return {blocks, report: {index: page.index, blocks: blocks.length, hidden, covers, clips, warnings: page.warnings}};
}

export type ImportMeta = {id: string; title: string; number?: string; now: number; source: NonNullable<Unit['source']>};

/** A unit made from a PDF: every page in blocks, the template taken from its own pages, the PDF kept as source. */
export function unitFromPdf(fonts: EditorFonts, read: ReadResult, meta: ImportMeta): {unit: Unit; report: ImportReport} {
  const pages: Page[] = [];
  const reports: PageReport[] = [];
  for (const p of read.pages) {
    const id = 'pg' + p.index;
    if (p.unsupported) {
      pages.push({id, width: p.width, height: p.height, blocks: [], conserved: {sourcePage: p.index, reason: p.unsupported}, sourcePage: p.index});
      reports.push({index: p.index, blocks: 0, hidden: 0, covers: 0, clips: 0, unsupported: p.unsupported, warnings: p.warnings});
      continue;
    }
    const {blocks, report} = segmentPage(fonts, p, id);
    pages.push({id, width: p.width, height: p.height, blocks, sourcePage: p.index});
    reports.push(report);
  }
  const assets: Unit['assets'] = {[meta.source.asset]: 'application/pdf'};
  for (const key of read.assets.keys()) assets[key] = 'application/octet-stream';
  const template = extractTemplate(fonts, pages);
  const number = meta.number ?? guessUnitNumber(pages);
  const unit: Unit = {
    schemaVersion: 1, id: meta.id, title: meta.title, ...(number ? {number} : {}), createdAt: meta.now, updatedAt: meta.now,
    pages, template, source: meta.source, assets,
  };
  return {
    unit,
    report: {
      pages: reports, editablePages: pages.filter(p => !p.conserved).length, conservedPages: pages.filter(p => p.conserved).length,
      elements: pages.reduce((n, p) => n + p.blocks.reduce((m, b) => m + b.elements.length, 0), 0),
    },
  };
}

/** The unit number from its audio codes (1.04 → 1) or its side tab. */
export function guessUnitNumber(pages: Page[]) {
  const counts = new Map<string, number>();
  for (const p of pages) for (const b of p.blocks) for (const el of b.elements) {
    if (el.role === 'ex-audio' || el.role === 'unit-tab') {
      const t = plainText(el).trim();
      const k = el.role === 'ex-audio' ? t.split('.')[0] : t;
      if (/^\d{1,2}$/.test(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}
