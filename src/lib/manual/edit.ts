import type {EditorFonts} from './fonts';
import {composeComponent, componentLabel, newId, newPage, renumberPages} from './compose';
import {elementBox, matrixBox, opsBox, scaleAbout, translate, type Box} from './elements';
import type {Block, Clip, Component, Element, ImageData, Page, Span, Template, Unit} from './model';

// Changes to a unit. Every function returns a new unit and leaves the one it got unchanged, so the editor can
// keep the previous states for undo.

type Text = Extract<Element, {kind: 'text'}>;
type Style = Omit<Span, 'text'>;
const sameStyle = (a: Style, b: Style) => a.font === b.font && a.size === b.size && JSON.stringify(a.color) === JSON.stringify(b.color)
  && (a.charSpacing ?? 0) === (b.charSpacing ?? 0) && (a.wordSpacing ?? 0) === (b.wordSpacing ?? 0) && (a.scale ?? 100) === (b.scale ?? 100);
const styleOf = (s: Span): Style => { const {text: _t, ...rest} = s; void _t; return rest; };

/** Each character with its style (characters as the user sees them: a stress mark is its own character). */
export function charStyles(el: Text) {
  const out: {ch: string; style: Style}[] = [];
  for (const s of el.spans) for (const ch of s.text) out.push({ch, style: styleOf(s)});
  return out;
}

function fromChars(chars: {ch: string; style: Style}[], fallback: Style): Span[] {
  const spans: Span[] = [];
  for (const {ch, style} of chars) {
    const last = spans[spans.length - 1];
    if (last && sameStyle(styleOf(last), style)) last.text += ch;
    else spans.push({...style, text: ch});
  }
  return spans.length ? spans : [{...fallback, text: ''}];
}

/**
 * New text for a line, keeping the style of every character that did not change. Typed characters take the style
 * of the character before them (of the next one at the start).
 */
export function editText(el: Text, next: string): Text {
  const chars = charStyles(el);
  const old = chars.map(c => c.ch);
  const neu = [...next];
  if (old.join('') === next) return el;
  let a = 0;
  while (a < old.length && a < neu.length && old[a] === neu[a]) a++;
  let b = 0;
  while (b < old.length - a && b < neu.length - a && old[old.length - 1 - b] === neu[neu.length - 1 - b]) b++;
  const fallback = chars[a - 1]?.style ?? chars[old.length - b]?.style ?? styleOf(el.spans[0]);
  const inserted = neu.slice(a, neu.length - b).map(ch => ({ch, style: fallback}));
  const result = [...chars.slice(0, a), ...inserted, ...chars.slice(old.length - b)];
  const {spanX: _x, ...rest} = el;
  void _x;
  return {...rest, spans: fromChars(result, styleOf(el.spans[0]))};
}

export type StyleChange = 'bold' | 'regular' | 'highlight' | 'plain';
/** Bold, regular, highlighted or plain colour for characters [start, end). */
export function restyle(el: Text, start: number, end: number, change: StyleChange, template: Template): Text {
  const chars = charStyles(el);
  // The plain colour: the most used colour of the line.
  const counts = new Map<string, number>();
  for (const c of chars) { const k = JSON.stringify(c.style.color); counts.set(k, (counts.get(k) ?? 0) + 1); }
  const plain = JSON.parse([...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? JSON.stringify(el.spans[0].color));
  const highlight = template.highlight?.color ?? {space: 'rgb', c: [0, 0.28, 0.8]};
  const out = chars.map((c, i) => {
    if (i < start || i >= end) return c;
    const s = {...c.style};
    if (change === 'bold') s.font = 'bold';
    else if (change === 'regular') s.font = 'regular';
    else if (change === 'highlight') s.color = highlight;
    else s.color = plain;
    return {ch: c.ch, style: s};
  });
  const {spanX: _x, ...rest} = el;
  void _x;
  return {...rest, spans: fromChars(out, styleOf(el.spans[0]))};
}

// ---------- Unit helpers ----------

export function touch(unit: Unit, now = Date.now()): Unit { return {...unit, updatedAt: now}; }

export function mapPage(unit: Unit, pageId: string, fn: (p: Page) => Page): Unit {
  return {...unit, pages: unit.pages.map(p => (p.id === pageId ? fn(p) : p))};
}
export function mapBlock(unit: Unit, pageId: string, blockId: string, fn: (b: Block) => Block | null): Unit {
  return mapPage(unit, pageId, p => ({...p, blocks: p.blocks.flatMap(b => (b.id === blockId ? (fn(b) ?? []) : [b]))}));
}
export function mapElement(unit: Unit, pageId: string, elementId: string, fn: (el: Element) => Element | null): Unit {
  return mapPage(unit, pageId, p => ({...p, blocks: p.blocks.map(b => b.elements.some(e => e.id === elementId)
    ? {...b, elements: b.elements.flatMap(e => (e.id === elementId ? (fn(e) ?? []) : [e]))} : b)}));
}
export function findElement(unit: Unit, pageId: string, elementId: string) {
  const page = unit.pages.find(p => p.id === pageId);
  for (const block of page?.blocks || []) {
    const el = block.elements.find(e => e.id === elementId);
    if (el) return {page: page!, block, el};
  }
  return null;
}

export const maxZ = (page: Page) => page.blocks.reduce((z, b) => b.elements.reduce((m, e) => Math.max(m, e.z), z), -1);

/** A locked block, or one on a page kept from the original, cannot be changed. */
export function editable(page: Page, block: Block) { return !page.conserved && !block.locked; }

export function moveBlock(unit: Unit, pageId: string, blockId: string, dx: number, dy: number) {
  return mapBlock(unit, pageId, blockId, b => ({...b, elements: b.elements.map(e => translate(e, dx, dy)), ...(b.at ? {at: [b.at[0] + dx, b.at[1] + dy] as [number, number]} : {})}));
}
export function moveElement(unit: Unit, pageId: string, elementId: string, dx: number, dy: number) {
  return mapElement(unit, pageId, elementId, e => translate(e, dx, dy));
}

/** Resizes an element so its box becomes `to` (images and shapes stretch; text changes its size with the height). */
export function resizeElement(fonts: EditorFonts, unit: Unit, pageId: string, elementId: string, to: Box) {
  return mapElement(unit, pageId, elementId, e => {
    const from = elementBox(fonts, e);
    const sx = (to[2] - to[0]) / Math.max(0.01, from[2] - from[0]);
    const sy = (to[3] - to[1]) / Math.max(0.01, from[3] - from[1]);
    if (e.kind === 'text') {
      const k = sy;
      const scaled = scaleAbout(e, k, k, from[0], from[1]);
      return translate(scaled, to[0] - from[0], to[1] - from[1]);
    }
    return translate(scaleAbout(e, sx, sy, from[0], from[1]), to[0] - from[0], to[1] - from[1]);
  });
}

/**
 * A new picture in the place of an image: it fills the same box without being deformed (the extra is cut off by
 * the same clip, or by the box) and keeps the rounded corners.
 */
export function replaceImage(unit: Unit, pageId: string, elementId: string, image: ImageData) {
  return mapElement(unit, pageId, elementId, e => {
    if (e.kind !== 'image') return e;
    const box = matrixBox(e.matrix);
    const bw = box[2] - box[0], bh = box[3] - box[1];
    const scale = Math.max(bw / image.width, bh / image.height);
    const w = image.width * scale, h = image.height * scale;
    const x = box[0] + (bw - w) / 2, y = box[1] + (bh - h) / 2;
    const r = (n: number) => Math.round(n * 1e4) / 1e4;
    const needsCut = w > bw + 0.01 || h > bh + 0.01;
    const cut: Clip = {path: [['M', box[0], box[1]], ['L', box[2], box[1]], ['L', box[2], box[3]], ['L', box[0], box[3]], ['Z']], evenOdd: false};
    const clips = e.clips?.length ? e.clips : needsCut ? [cut] : undefined;
    const {smask: _s, ...rest} = e;
    void _s;
    return {...rest, image, matrix: [r(w), 0, 0, r(h), r(x), r(y)], ...(clips ? {clips} : {})};
  });
}

export function setLocked(unit: Unit, pageId: string, blockId: string, locked: boolean) {
  return mapBlock(unit, pageId, blockId, b => {
    const {locked: _l, ...rest} = b;
    void _l;
    return locked ? {...rest, locked: true} : rest;
  });
}

export function deleteBlock(unit: Unit, pageId: string, blockId: string) { return mapBlock(unit, pageId, blockId, () => null); }
export function deleteElement(unit: Unit, pageId: string, elementId: string) { return mapElement(unit, pageId, elementId, () => null); }

/** Adds new content built from the template at `at` (top-left corner). */
export function addComponent(fonts: EditorFonts, unit: Unit, pageId: string, component: Component, at: [number, number]) {
  const page = unit.pages.find(p => p.id === pageId);
  if (!page) return {unit, block: null as Block | null, overflow: false};
  const id = newId('blk');
  const composed = composeComponent({fonts, template: unit.template, page, idPrefix: id, z: maxZ(page) + 1}, component, at);
  const block: Block = {id, kind: 'section', label: componentLabel(component), elements: composed.elements, component, at};
  return {unit: mapPage(unit, pageId, p => ({...p, blocks: insertBeforeFurniture(p.blocks, block)})), block, overflow: at[1] - composed.height < unit.template.margins.bottom};
}

/** Rebuilds a block made from a component after its source changed, at the same place. */
export function updateComponent(fonts: EditorFonts, unit: Unit, pageId: string, blockId: string, component: Component) {
  const page = unit.pages.find(p => p.id === pageId);
  const block = page?.blocks.find(b => b.id === blockId);
  if (!page || !block?.at) return unit;
  const z = block.elements.length ? Math.min(...block.elements.map(e => e.z)) : maxZ(page) + 1;
  const composed = composeComponent({fonts, template: unit.template, page, idPrefix: block.id, z}, component, block.at);
  return mapBlock(unit, pageId, blockId, b => ({...b, component, label: componentLabel(component), elements: composed.elements}));
}

function insertBeforeFurniture(blocks: Block[], block: Block) {
  const i = blocks.findIndex(b => b.kind === 'footer' || b.kind === 'side');
  return i < 0 ? [...blocks, block] : [...blocks.slice(0, i), block, ...blocks.slice(i)];
}

// ---------- Pages ----------

export function addPage(fonts: EditorFonts, unit: Unit, after: number) {
  const page = newPage(unit, after);
  const pages = [...unit.pages.slice(0, after + 1), page, ...unit.pages.slice(after + 1)];
  return {unit: renumberPages(fonts, {...unit, pages}), page};
}

export function duplicatePage(fonts: EditorFonts, unit: Unit, index: number) {
  const src = unit.pages[index];
  if (!src) return unit;
  const id = newId('pg');
  const copy: Page = {
    ...structuredClone(src), id,
    blocks: src.blocks.map((b, k) => {
      const bid = id + '-b' + k;
      return {...structuredClone(b), id: bid, elements: b.elements.map((e, i) => ({...structuredClone(e), id: bid + '-e' + i}))};
    }),
  };
  const pages = [...unit.pages.slice(0, index + 1), copy, ...unit.pages.slice(index + 1)];
  return renumberPages(fonts, {...unit, pages});
}

export function deletePage(fonts: EditorFonts, unit: Unit, index: number) {
  if (unit.pages.length <= 1) return unit;
  return renumberPages(fonts, {...unit, pages: unit.pages.filter((_, i) => i !== index)});
}

export function movePage(fonts: EditorFonts, unit: Unit, from: number, to: number) {
  const pages = [...unit.pages];
  const [p] = pages.splice(from, 1);
  if (!p) return unit;
  pages.splice(Math.max(0, Math.min(pages.length, to)), 0, p);
  return renumberPages(fonts, {...unit, pages});
}

/** Uses a block of the unit as the model for new exercises' headers. */
export function useAsExerciseModel(unit: Unit, pageId: string, blockId: string): Unit {
  const block = unit.pages.find(p => p.id === pageId)?.blocks.find(b => b.id === blockId);
  const band = block?.elements.find(e => e.role === 'ex-band');
  if (!block || !band || band.kind !== 'path') return unit;
  const box = opsBox(band.ops);
  if (!box) return unit;
  const roles = new Set(['ex-band', 'ex-badge', 'ex-number', 'ex-icon', 'ex-audio', 'ex-instruction']);
  const elements = block.elements.filter(e => e.role && roles.has(e.role)).map(e => translate(e, -box[0], -box[3]));
  return {...unit, template: {...unit.template, exerciseHeader: {elements, width: box[2] - box[0], height: box[3] - box[1]}}};
}

