import {spanWidth, type EditorFonts} from './fonts';
import {blockBox, elementBox, plainText, roundedRect, translate} from './elements';
import type {Block, Component, Element, Page, Span, Template, Unit} from './model';

// Builds the elements of new content from the unit's template: an exercise with its header as it is drawn in the
// manual, a paragraph, a heading or a photo. Written text may mark **bold** and ==highlighted== words.

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
    const m: [number, number, number, number, number, number] = [c.width, 0, 0, c.height, x, top - c.height];
    push({
      id: '', z: 0, kind: 'image', matrix: m, image: c.image,
      ...(c.rounded ? {clips: [{path: roundedRect(x, top - c.height, c.width, c.height, t.photoRadius ?? 4), evenOdd: false}]} : {}),
    });
    return {elements: els, height: c.height, width: c.width};
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
  return 'Imagen';
}

