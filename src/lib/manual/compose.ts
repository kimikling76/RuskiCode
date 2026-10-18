import {spanWidth, type EditorFonts} from './fonts';
import {blockBox, elementBox, plainText, roundedRect, translate} from './elements';
import {aspectValue, type Block, type Color, type Component, type Element, type ImageData, type Page, type PathOp, type Span, type Template, type Unit} from './model';

// Builds the elements of new content from the unit's template: an exercise with its header as it is drawn in the
// manual, a paragraph, a heading, a photo, a gallery of pictures or a comic strip with speech bubbles.
// Written text may mark **bold** and ==highlighted== words. A picture that does not exist yet is a pending frame.

type Run = {text: string; bold: boolean; highlight: boolean};

/** `Это **тоже** ==Маша==` → runs with their marks. Unclosed marks are kept as written. */
export function parseMarkup(src: string): Run[] {
  const out: Run[] = [];
  let bold = false, highlight = false, buf = '';
  const flush = () => { if (buf) { out.push({text: buf, bold, highlight}); buf = ''; } };
  const closes = (mark: string, from: number) => src.indexOf(mark, from) >= 0;
  for (let i = 0; i < src.length; i++) {
    const two = src.slice(i, i + 2);
    if (two === '**' && (bold || closes('**', i + 2))) { flush(); bold = !bold; i++; continue; }
    if (two === '==' && (highlight || closes('==', i + 2))) { flush(); highlight = !highlight; i++; continue; }
    buf += src[i];
  }
  flush();
  return out;
}

export type Styles = {base: Span; highlight?: Span};
export function runsToSpans(runs: Run[], {base, highlight}: Styles): Span[] {
  const spans: Span[] = [];
  for (const r of runs) {
    const color = r.highlight ? (highlight?.color ?? {space: 'rgb' as const, c: [0, 0.28, 0.8]}) : base.color;
    const span: Span = {...base, text: r.text, font: r.bold ? 'bold' : base.font, color};
    const last = spans[spans.length - 1];
    if (last && last.font === span.font && JSON.stringify(last.color) === JSON.stringify(span.color) && last.size === span.size) last.text += span.text;
    else spans.push(span);
  }
  return spans;
}

/** Breaks styled text into lines that fit `width`, at spaces. A word longer than the line stays whole. */
export function wrapSpans(fonts: EditorFonts, spans: Span[], width: number): Span[][] {
  const words: Span[][] = [];
  let word: Span[] = [];
  for (const s of spans) {
    for (const part of s.text.split(/( )/)) {
      if (!part) continue;
      word.push({...s, text: part});
      if (part === ' ') { words.push(word); word = []; }
    }
  }
  if (word.length) words.push(word);
  const lines: Span[][] = [];
  let line: Span[] = [];
  let w = 0;
  const widthOf = (ss: Span[]) => ss.reduce((n, s) => n + spanWidth(fonts, s), 0);
  for (const wd of words) {
    const visible = wd.filter(s => s.text !== ' ');
    const ww = widthOf(visible);
    if (line.length && w + ww > width) {
      while (line.length && line[line.length - 1].text === ' ') line.pop();
      lines.push(line);
      line = []; w = 0;
    }
    line.push(...wd);
    w += widthOf(wd);
  }
  while (line.length && line[line.length - 1].text === ' ') line.pop();
  if (line.length) lines.push(line);
  return lines.map(merge);
}

function merge(spans: Span[]): Span[] {
  const out: Span[] = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (last && last.font === s.font && last.size === s.size && JSON.stringify(last.color) === JSON.stringify(s.color)) last.text += s.text;
    else out.push({...s});
  }
  return out;
}

const fallbackText: Span = {text: '', font: 'regular', size: 10.5, color: {space: 'rgb', c: [0.086, 0.149, 0.149]}};
const white: Color = {space: 'gray', c: [1]};
const ink: Color = {space: 'gray', c: [0.13]};
const frame: Color = {space: 'gray', c: [0.25]};
const pendingFill: Color = {space: 'gray', c: [0.94]};
const pendingLine: Color = {space: 'gray', c: [0.62]};
const r2 = (n: number) => Math.round(n * 100) / 100;
const lineWidth = (fonts: EditorFonts, spans: Span[]) => spans.reduce((n, sp) => n + spanWidth(fonts, sp), 0);

type Box = {x: number; y: number; w: number; h: number};
/**
 * A picture that fills its box, cut to it (as photos are cropped in the manual), with rounded corners.
 * Without an image yet: a light frame that says so, replaced when the image arrives.
 */
function picture(fonts: EditorFonts, push: (el: Element) => void, b: Box, image: ImageData | undefined, radius: number, style: Span) {
  if (image) {
    const scale = Math.max(b.w / image.width, b.h / image.height);
    const iw = image.width * scale, ih = image.height * scale;
    // The same shape needs no cut unless the corners are rounded.
    const exact = Math.abs(iw - b.w) < 0.01 * b.w && Math.abs(ih - b.h) < 0.01 * b.h;
    push({
      id: '', z: 0, kind: 'image', image, matrix: [r2(iw), 0, 0, r2(ih), r2(b.x + (b.w - iw) / 2), r2(b.y + (b.h - ih) / 2)],
      ...(radius > 0 || !exact ? {clips: [{path: roundedRect(b.x, b.y, b.w, b.h, radius), evenOdd: false}]} : {}),
    });
    return;
  }
  push({id: '', z: 0, kind: 'path', ops: roundedRect(b.x, b.y, b.w, b.h, radius), fill: {color: pendingFill, evenOdd: false}, stroke: {color: pendingLine, width: 0.6, dash: [[3, 2], 0]}, role: 'picture-pending'});
  const span: Span = {...style, text: 'Imagen pendiente', font: 'regular', size: Math.min(8, style.size), color: pendingLine};
  const w = spanWidth(fonts, span);
  if (w < b.w - 6) push({id: '', z: 0, kind: 'text', x: r2(b.x + (b.w - w) / 2), y: r2(b.y + b.h / 2 - span.size * 0.35), spans: [span], role: 'picture-pending'});
}

/** A speech bubble with its tail at the bottom, pointing a little to one side (`lean`), as one closed shape. */
function bubble(x: number, y: number, w: number, h: number, r: number, tailX: number, lean: number): PathOp[] {
  const k = 0.5523 * r, t = Math.max(x + r + 4, Math.min(x + w - r - 4, tailX));
  return [
    ['M', r2(x + r), r2(y + h)], ['L', r2(x + w - r), r2(y + h)], ['C', r2(x + w - r + k), r2(y + h), r2(x + w), r2(y + h - r + k), r2(x + w), r2(y + h - r)],
    ['L', r2(x + w), r2(y + r)], ['C', r2(x + w), r2(y + r - k), r2(x + w - r + k), r2(y), r2(x + w - r), r2(y)],
    ['L', r2(t + 4), r2(y)], ['L', r2(t + lean), r2(y - 7)], ['L', r2(t - 4), r2(y)],
    ['L', r2(x + r), r2(y)], ['C', r2(x + r - k), r2(y), r2(x), r2(y + r - k), r2(x), r2(y + r)],
    ['L', r2(x), r2(y + h - r)], ['C', r2(x), r2(y + h - r + k), r2(x + r - k), r2(y + h), r2(x + r), r2(y + h)], ['Z'],
  ];
}
const ascentOf = (size: number) => size * 0.93;
const descentOf = (size: number) => size * 0.24;

export type ComposeContext = {fonts: EditorFonts; template: Template; page: {width: number; height: number}; idPrefix: string; z: number};
export type Composed = {elements: Element[]; height: number; width: number};

export function contentWidth(t: Template, page: {width: number}) {
  return page.width - t.margins.left - t.margins.right;
}

export function composeComponent(ctx: ComposeContext, c: Component, at: [number, number]): Composed {
  const {fonts, template: t} = ctx;
  const [x, top] = at;
  let n = 0, z = ctx.z;
  const id = () => ctx.idPrefix + '-e' + (n++);
  const els: Element[] = [];
  const push = (el: Element) => { els.push({...el, id: id(), z: z++}); };
  const width = contentWidth(t, ctx.page);
  const textStyle = t.text ?? t.item ?? fallbackText;
  const highlight = t.highlight;

  if (c.type === 'heading') {
    const style = t.heading ?? {...textStyle, font: 'bold' as const, size: 20};
    const spans = runsToSpans(parseMarkup(c.text), {base: style, highlight});
    push({id: '', z: 0, kind: 'text', x, y: top - ascentOf(style.size), spans, maxWidth: width});
    return {elements: els, height: style.size * 1.2, width};
  }

  if (c.type === 'text') {
    const leading = t.textLeading ?? textStyle.size * 1.45;
    const ix = x + (t.itemIndent ?? 0);
    let y = top - ascentOf(textStyle.size);
    let lines = 0;
    for (const para of c.text.split('\n')) {
      const wrapped = para.trim() ? wrapSpans(fonts, runsToSpans(parseMarkup(para), {base: textStyle, highlight}), width - (t.itemIndent ?? 0)) : [];
      for (const spans of wrapped) {
        push({id: '', z: 0, kind: 'text', x: ix, y, spans, maxWidth: width - (t.itemIndent ?? 0)});
        y -= leading; lines++;
      }
      if (!wrapped.length) { y -= leading; lines++; }
    }
    const height = lines ? ascentOf(textStyle.size) + (lines - 1) * leading + descentOf(textStyle.size) : 0;
    return {elements: els, height, width};
  }

  if (c.type === 'image') {
    const radius = c.rounded ? t.photoRadius ?? 4 : 0;
    picture(fonts, push, {x, y: top - c.height, w: c.width, h: c.height}, c.image, radius, textStyle);
    let height = c.height;
    if (c.caption?.trim()) {
      const style = {...textStyle, size: Math.round(textStyle.size * 0.9 * 10) / 10};
      const lines = wrapSpans(fonts, runsToSpans(parseMarkup(c.caption), {base: style, highlight}), c.width);
      lines.forEach((spans, i) => {
        const w = lineWidth(fonts, spans);
        push({id: '', z: 0, kind: 'text', x: r2(x + Math.max(0, (c.width - w) / 2)), y: r2(top - c.height - 4 - ascentOf(style.size) - i * style.size * 1.3), spans, maxWidth: c.width, role: 'picture-caption'});
      });
      height += 4 + ascentOf(style.size) + (lines.length - 1) * style.size * 1.3 + descentOf(style.size);
    }
    return {elements: els, height, width: c.width};
  }

  if (c.type === 'gallery') {
    const gap = 8, cols = c.columns;
    const cw = (width - gap * (cols - 1)) / cols, ch = cw / aspectValue(c.aspect);
    const labelStyle = t.item ?? textStyle;
    const labelled = c.cells.some(cell => cell.label.trim());
    const labelH = labelled ? labelStyle.size * 1.7 : 0;
    const rows = Math.ceil(c.cells.length / cols);
    c.cells.forEach((cell, i) => {
      const cx = x + (i % cols) * (cw + gap), cy = top - Math.floor(i / cols) * (ch + labelH + gap) - ch;
      picture(fonts, push, {x: cx, y: cy, w: cw, h: ch}, cell.image, t.photoRadius ?? 4, textStyle);
      if (c.numbered) {
        const span: Span = {...labelStyle, text: String((c.first ?? 1) + i), font: 'bold', size: Math.min(8, labelStyle.size)};
        const bw = Math.max(13, spanWidth(fonts, span) + 6), bh = 13;
        push({id: '', z: 0, kind: 'path', ops: roundedRect(cx + 3, cy + ch - 3 - bh, bw, bh, 2.5), fill: {color: white, evenOdd: false}, role: 'picture-number'});
        push({id: '', z: 0, kind: 'text', x: r2(cx + 3 + (bw - spanWidth(fonts, span)) / 2), y: r2(cy + ch - 3 - bh + 3.8), spans: [span], role: 'picture-number'});
      }
      if (cell.label.trim()) {
        let spans = runsToSpans(parseMarkup(cell.label), {base: labelStyle, highlight: highlight ? {...highlight, size: labelStyle.size} : undefined});
        const w = lineWidth(fonts, spans);
        // A label wider than its picture gets smaller, down to 70 %.
        if (w > cw) { const k = Math.max(0.7, cw / w); spans = spans.map(sp => ({...sp, size: Math.round(sp.size * k * 10) / 10})); }
        const lw = lineWidth(fonts, spans);
        push({id: '', z: 0, kind: 'text', x: r2(cx + Math.max(0, (cw - lw) / 2)), y: r2(cy - labelStyle.size * 1.25), spans, maxWidth: cw, role: 'picture-label'});
      }
    });
    return {elements: els, height: rows * (ch + labelH) + (rows - 1) * gap, width};
  }

  if (c.type === 'comic') {
    const gap = 6, cols = c.columns;
    const pw = (width - gap * (cols - 1)) / cols, ph = pw / aspectValue(c.aspect);
    const rows = Math.ceil(c.panels.length / cols);
    const size = Math.max(6.5, Math.min(9, pw / 24));
    const style: Span = {...textStyle, font: 'regular', size, color: ink};
    c.panels.forEach((panel, i) => {
      const px = x + (i % cols) * (pw + gap), py = top - Math.floor(i / cols) * (ph + gap) - ph;
      picture(fonts, push, {x: px, y: py, w: pw, h: ph}, panel.image, 2, textStyle);
      push({id: '', z: 0, kind: 'path', ops: roundedRect(px, py, pw, ph, 2), stroke: {color: frame, width: 0.8}, role: 'comic-frame'});
      // Bubbles go along the top, left and right in turn; each side stacks downwards.
      const stack = [py + ph - 5, py + ph - 5];
      panel.bubbles.forEach((text, k) => {
        if (!text.trim()) return;
        const side = k % 2;
        const pad = 3.5, leading = size * 1.2;
        const lines = wrapSpans(fonts, runsToSpans(parseMarkup(text), {base: style, highlight}), pw * 0.56 - pad * 2);
        const tw = Math.max(...lines.map(l => lineWidth(fonts, l)));
        const bw = tw + pad * 2, bh = pad * 2 + ascentOf(size) + (lines.length - 1) * leading + descentOf(size);
        const bx = side ? px + pw - 5 - bw : px + 5;
        const btop = stack[side];
        stack[side] = btop - bh - 10;
        const tail = side ? bx + bw * 0.68 : bx + bw * 0.32;
        push({id: '', z: 0, kind: 'path', ops: bubble(bx, btop - bh, bw, bh, Math.min(6, bh / 2), tail, side ? 3 : -3), fill: {color: white, evenOdd: false}, stroke: {color: frame, width: 0.6}, role: 'comic-bubble'});
        lines.forEach((spans, j) => {
          const lw = lineWidth(fonts, spans);
          push({id: '', z: 0, kind: 'text', x: r2(bx + (bw - lw) / 2), y: r2(btop - pad - ascentOf(size) - j * leading), spans, maxWidth: bw, role: 'comic-text'});
        });
      });
    });
    return {elements: els, height: rows * ph + (rows - 1) * gap, width};
  }

  // Exercise: the header exactly as the template draws it, then example lines and items.
  const header = t.exerciseHeader;
  let bottom = top;
  if (header) {
    const placed = header.elements.map(el => translate(el, x, top));
    const badge = placed.find(el => el.role === 'ex-badge');
    const audio = placed.find(el => el.role === 'ex-audio');
    for (const el of placed) {
      if (el.kind !== 'text' || !el.role) { push(el); continue; }
      if (el.role === 'ex-number') {
        const style = el.spans[0];
        let span: Span = {...style, text: c.number};
        if (badge) {
          const bb = elementBox(fonts, badge);
          const room = bb[2] - bb[0] - 3;
          const w = spanWidth(fonts, span);
          if (w > room) span = {...span, size: Math.round(span.size * room / w * 10) / 10};
          const cx = (bb[0] + bb[2]) / 2;
          push({...el, spans: [span], x: cx - spanWidth(fonts, span) / 2, spanX: undefined});
        } else push({...el, spans: [span], spanX: undefined});
      } else if (el.role === 'ex-audio') {
        push({...el, spans: [{...el.spans[0], text: c.audio}], spanX: undefined});
      } else if (el.role === 'ex-instruction') {
        const base = el.spans[0];
        const hl = el.spans.find(s => JSON.stringify(s.color) !== JSON.stringify(base.color)) ?? (highlight ? {...highlight, size: base.size, font: base.font} : undefined);
        const spans = runsToSpans(parseMarkup(c.instruction), {base, highlight: hl});
        const right = audio && audio.kind === 'text' && audio.x > el.x ? audio.x - 8 : x + header.width - 6;
        push({...el, spans: spans.length ? spans : [{...base, text: ''}], spanX: undefined, maxWidth: Math.max(10, right - el.x)});
      } else push(el);
    }
    bottom = top - header.height;
  }
  const indent = t.itemIndent ?? 7;
  const ix = x + indent;
  const exampleStyle = t.example ?? {...textStyle, font: 'bold' as const};
  const itemStyle = t.item ?? textStyle;
  const examplePitch = t.examplePitch ?? t.itemPitch ?? 22;
  const itemPitch = t.itemPitch ?? 22;
  let y = bottom - (t.afterHeader ?? 19);
  let last = bottom;
  let lastSize = itemStyle.size;
  c.example.forEach((line, i) => {
    if (i) y -= examplePitch;
    push({id: '', z: 0, kind: 'text', x: ix, y, spans: runsToSpans(parseMarkup(line), {base: exampleStyle, highlight}), maxWidth: width - indent, role: 'ex-example'});
    last = y; lastSize = exampleStyle.size;
  });
  if (c.items.length) {
    if (c.example.length) y -= t.afterExample ?? 28;
    const cols = c.columns;
    const rows = cols === 2 ? Math.ceil(c.items.length / 2) : c.items.length;
    const colOffset = t.columnOffset ?? (width - indent) / 2;
    c.items.forEach((item, i) => {
      const col = cols === 2 && i >= rows ? 1 : 0;
      const row = col ? i - rows : i;
      const numbered = /^\s*\d+[.)]\s/.test(item) ? item : (i + 1) + '. ' + item;
      const iy = y - row * itemPitch;
      push({
        id: '', z: 0, kind: 'text', x: ix + col * colOffset, y: iy, role: 'ex-item',
        spans: runsToSpans(parseMarkup(numbered), {base: itemStyle, highlight: highlight ? {...highlight, size: itemStyle.size} : undefined}),
        maxWidth: cols === 2 ? colOffset - 12 : width - indent,
      });
      last = Math.min(last, iy); lastSize = itemStyle.size;
    });
  }
  const height = top - (last === bottom ? bottom : last - descentOf(lastSize));
  return {elements: els, height, width};
}

/** Where a new block of `height` fits on the page: under the last block, or null when the page is full. */
export function placeOnPage(fonts: EditorFonts, t: Template, page: Page, height: number): [number, number] | null {
  let lowest: number | null = null;
  for (const b of page.blocks) {
    if (b.kind === 'footer' || b.kind === 'side' || b.kind === 'background') continue;
    const box = blockBox(fonts, b);
    if (box) lowest = lowest === null ? box[1] : Math.min(lowest, box[1]);
  }
  const top = lowest === null ? page.height - t.margins.top : lowest - t.gap;
  if (top - height < t.margins.bottom) return null;
  return [t.margins.left, top];
}

/** The next exercise number and audio code after the last ones in the unit (6 → 7, 1.07 → 1.08). */
export function nextExercise(unit: Unit) {
  let number = 0, audio = 0;
  for (const p of unit.pages) for (const b of p.blocks) for (const el of b.elements) {
    if (el.role === 'ex-number') { const m = /^(\d+)/.exec(plainText(el).trim()); if (m) number = Math.max(number, Number(m[1])); }
    if (el.role === 'ex-audio') { const m = /^(\d+)\.(\d{2})$/.exec(plainText(el).trim()); if (m) audio = Math.max(audio, Number(m[2])); }
  }
  const unitNo = unit.number ?? '1';
  return {number: String(number + 1), audio: unitNo + '.' + String(audio + 1).padStart(2, '0')};
}

let counter = 0;
export const newId = (prefix: string) => prefix + Date.now().toString(36) + (counter++).toString(36) + Math.random().toString(36).slice(2, 6);

/** Copies of furniture elements with fresh ids. */
export function cloneElements(els: Element[], prefix: string): Element[] {
  return els.map((el, i) => ({...structuredClone(el), id: prefix + '-e' + i}));
}

/** The text of a page number element set to `value`, kept centred where it was. */
export function setCentredText(fonts: EditorFonts, el: Element, value: string): Element {
  if (el.kind !== 'text') return el;
  const old = elementBox(fonts, el);
  const span = {...el.spans[0], text: value};
  const w = spanWidth(fonts, span);
  const cx = (old[0] + old[2]) / 2;
  return {...el, spans: [span], spanX: undefined, x: Math.round((cx - w / 2) * 1e4) / 1e4};
}

/** Page numbers in order: the first numbered page keeps its number, the following ones count from it. */
export function renumberPages(fonts: EditorFonts, unit: Unit): Unit {
  let next: number | null = null;
  const pages = unit.pages.map(p => {
    if (p.conserved) return p;
    let changed = false;
    const blocks = p.blocks.map(b => {
      if (!b.elements.some(el => el.role === 'page-number')) return b;
      return {...b, elements: b.elements.map(el => {
        if (el.role !== 'page-number') return el;
        const current = Number(plainText(el).trim());
        if (next === null) { next = (Number.isFinite(current) ? current : 1) + 1; return el; }
        const value = String(next++);
        if (plainText(el).trim() === value) return el;
        changed = true;
        return setCentredText(fonts, el, value);
      })};
    });
    return changed ? {...p, blocks} : p;
  });
  return {...unit, pages};
}

/** A new empty page with the frame (footer, side tab) of the page it follows. */
export function newPage(unit: Unit, after: number): Page {
  const ref = unit.pages[after] ?? unit.pages[unit.pages.length - 1];
  const id = newId('pg');
  const blocks: Block[] = [];
  const footer = ref?.blocks.find(b => b.kind === 'footer') ?? (unit.template.footer ? {elements: unit.template.footer} : null);
  const side = ref?.blocks.find(b => b.kind === 'side');
  if (footer) blocks.push({id: id + '-foot', kind: 'footer', label: 'Pie de página', locked: true, elements: cloneElements(footer.elements, id + '-foot')});
  if (side) blocks.push({id: id + '-side', kind: 'side', label: 'Pestaña de la unidad', locked: true, elements: cloneElements(side.elements, id + '-side')});
  return {id, width: ref?.width ?? 595.28, height: ref?.height ?? 841.89, blocks};
}

/** Label of a block made from a component, for the list of blocks. */
export function componentLabel(c: Component) {
  const cut = (s: string) => (s.length > 60 ? s.slice(0, 59) + '…' : s).replace(/\*\*|==/g, '');
  if (c.type === 'exercise') return ['Ejercicio ' + c.number, c.audio, cut(c.instruction)].filter(Boolean).join(' · ');
  if (c.type === 'heading') return 'Título · ' + cut(c.text);
  if (c.type === 'text') return 'Texto · ' + cut(c.text.split('\n')[0]);
  if (c.type === 'gallery') return 'Galería · ' + c.cells.length + ' imágenes';
  if (c.type === 'comic') return 'Historieta · ' + c.panels.length + (c.panels.length === 1 ? ' viñeta' : ' viñetas');
  return 'Imagen' + (c.caption ? ' · ' + cut(c.caption) : '');
}

