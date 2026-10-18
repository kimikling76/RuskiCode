import type {EditorFonts} from './fonts';
import {clipBox, rectOf, translate, visibleBox} from './elements';
import type {Block, Element, Page, Span, Template} from './model';

// The template of a unit is read from its own pages: the exercise header as it is drawn (band, number badge,
// headphones, audio code, instruction), the styles of example lines, highlights and items, and the spacing between
// them. New exercises and pages are built from it, so they look like the rest of the manual.

type Text = Extract<Element, {kind: 'text'}>;
const styleKey = (s: Span) => [s.font, s.size, s.color.space, ...s.color.c].join('|');
const styleOf = (s: Span): Span => ({...s, text: ''});

function mode(values: number[], step = 0.5) {
  const counts = new Map<number, number>();
  for (const v of values) { const k = Math.round(v / step) * step; counts.set(k, (counts.get(k) ?? 0) + 1); }
  let best: number | undefined, n = 0;
  for (const [k, c] of counts) if (c > n || (c === n && best !== undefined && k < best)) { best = k; n = c; }
  return best;
}
function median(values: number[]) {
  if (!values.length) return undefined;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function mostCommon<T>(items: T[], key: (t: T) => string): T | undefined {
  const counts = new Map<string, {item: T; n: number}>();
  for (const it of items) { const k = key(it); const c = counts.get(k); if (c) c.n++; else counts.set(k, {item: it, n: 1}); }
  return [...counts.values()].sort((a, b) => b.n - a.n)[0]?.item;
}

const byRole = (b: Block, role: string) => b.elements.find(el => el.role === role);
const headerRoles = new Set(['ex-band', 'ex-badge', 'ex-number', 'ex-icon', 'ex-audio', 'ex-instruction']);

export function extractTemplate(fonts: EditorFonts, pages: Page[]): Template {
  const sections = pages.flatMap(page => page.blocks.filter(b => b.kind === 'section').map(block => ({page, block})));
  const box = (el: Element) => visibleBox(fonts, el) || [0, 0, 0, 0];

  // Exercise header: the most common layout among complete headers.
  const complete = sections.filter(s => ['ex-band', 'ex-number', 'ex-audio', 'ex-instruction'].every(r => byRole(s.block, r)));
  const signature = (s: typeof complete[number]) => {
    const band = box(byRole(s.block, 'ex-band')!);
    const a = byRole(s.block, 'ex-audio') as Text, i = byRole(s.block, 'ex-instruction') as Text;
    return [Math.round((a.x - band[0]) / 5), Math.round((i.x - band[0]) / 5), Math.round((band[3] - band[1]) / 2)].join('|');
  };
  const chosen = mostCommon(complete, signature);
  let exerciseHeader: Template['exerciseHeader'];
  let bandBox: [number, number, number, number] | undefined;
  if (chosen) {
    bandBox = box(byRole(chosen.block, 'ex-band')!);
    const [x0, , x1, y1] = bandBox;
    const els = chosen.block.elements.filter(el => el.role && headerRoles.has(el.role)).map(el => translate(el, -x0, -y1));
    exerciseHeader = {elements: els, width: x1 - x0, height: bandBox[3] - bandBox[1]};
  }

  // Styles of the body of exercises (everything in a section that is not in its header).
  const body = sections.flatMap(s => {
    const band = byRole(s.block, 'ex-band');
    const bb = band ? box(band) : null;
    return s.block.elements.filter((el): el is Text => el.kind === 'text' && !el.role && !(bb && el.y >= bb[1] && el.y <= bb[3])).map(el => ({el, s}));
  });
  const regular = body.flatMap(({el}) => el.spans.filter(sp => sp.font === 'regular' && sp.text.trim()));
  const item = mostCommon(regular, styleKey);
  const itemKey = item ? styleKey(item) : '';
  const itemLines = body.filter(({el}) => styleKey(el.spans[0]) === itemKey);
  // Example lines: bold lines between the header and the first item of an exercise.
  const firstItemY = new Map<string, number>();
  for (const {el, s} of itemLines) firstItemY.set(s.block.id, Math.max(firstItemY.get(s.block.id) ?? -Infinity, el.y));
  const candidates = body.filter(({el, s}) => {
    const top = firstItemY.get(s.block.id);
    const sp = el.spans[0];
    const words = el.spans.map(x => x.text).join('');
    return top !== undefined && el.y > top + 0.5 && sp.font === 'bold' && !sp.color.c.every(v => v > 0.99) && words.trim().length >= 6 && /\p{L}{2}/u.test(words);
  });
  const example = mostCommon(candidates.map(l => l.el.spans[0]), styleKey);
  const exampleKey = example ? styleKey(example) : '';
  const exampleLines = candidates.filter(({el}) => styleKey(el.spans[0]) === exampleKey);
  const highlight = mostCommon(exampleLines.flatMap(({el}) => el.spans.filter(sp => sp.text.trim() && JSON.stringify(sp.color) !== JSON.stringify(example!.color))), styleKey);

  const pitches = (lines: typeof body) => {
    const out: number[] = [];
    const groups = new Map<string, number[]>();
    for (const {el, s} of lines) { const k = s.block.id + '|' + Math.round(el.x); groups.set(k, [...(groups.get(k) || []), el.y]); }
    for (const ys of groups.values()) {
      ys.sort((a, b) => b - a);
      for (let i = 1; i < ys.length; i++) { const d = ys[i - 1] - ys[i]; if (d > 6 && d < 40) out.push(d); }
    }
    return out;
  };
  const itemPitch = mode(pitches(itemLines));
  const examplePitch = mode(pitches(exampleLines));

  const afterHeader: number[] = [], afterExample: number[] = [], indent: number[] = [], columns: number[] = [], gaps: number[] = [];
  for (const s of sections) {
    const band = byRole(s.block, 'ex-band');
    if (!band) continue;
    const bb = box(band);
    const ex = exampleLines.filter(l => l.s === s).map(l => l.el.y).sort((a, b) => b - a);
    const it = itemLines.filter(l => l.s === s).map(l => l.el);
    const firstItem = Math.max(...it.map(e => e.y));
    if (ex.length) { afterHeader.push(bb[1] - ex[0]); if (it.length) afterExample.push(ex[ex.length - 1] - firstItem); }
    else if (it.length) afterHeader.push(bb[1] - firstItem);
    if (it.length) {
      const xs = [...new Set(it.map(e => Math.round(e.x)))].sort((a, b) => a - b);
      indent.push(xs[0] - bb[0]);
      if (xs.length > 1 && xs[xs.length - 1] - xs[0] > 100) columns.push(xs[xs.length - 1] - xs[0]);
    }
  }
  for (const page of pages) {
    const secs = page.blocks.filter(b => b.kind === 'section');
    for (let i = 1; i < secs.length; i++) {
      const upper = secs[i - 1].elements.filter(el => el.role !== 'ex-band').map(box);
      const lower = byRole(secs[i], 'ex-band');
      if (!upper.length || !lower) continue;
      const g = Math.min(...upper.map(b => b[1])) - box(lower)[3];
      if (g > 2 && g < 60) gaps.push(g);
    }
  }

  // Running text: lines of the item style that fill most of the width.
  const wide = bandBox ? itemLines.filter(({el}) => box(el)[2] - el.x > (bandBox![2] - bandBox![0]) * 0.6) : [];
  const textLeading = mode(pitches(wide));

  // Headings: the largest bold text of title blocks.
  const titles = pages.flatMap(p => p.blocks.filter(b => b.kind === 'title').flatMap(b => b.elements)).filter((el): el is Text => el.kind === 'text');
  const heading = titles.flatMap(el => el.spans).filter(sp => sp.font === 'bold').sort((a, b) => b.size - a.size)[0];

  // Page furniture from the page of the chosen header, or the first page that has it.
  const furniture = (kind: 'footer' | 'side', role: string) => {
    const pick = (p?: Page) => p?.blocks.find(b => b.kind === kind && b.elements.some(el => el.role === role));
    const b = pick(chosen?.page) || pages.map(pick).find(Boolean);
    return b?.elements.map(el => ({...el}));
  };
  const footer = furniture('footer', 'page-number');
  const side = furniture('side', 'unit-tab');

  // Rounded corners of photos.
  const radii: number[] = [];
  for (const s of sections) for (const el of s.block.elements) {
    if (el.kind !== 'image' || el.clips?.length !== 1 || rectOf(el.clips[0].path)) continue;
    const ops = el.clips[0].path;
    const cb = clipBox(el.clips[0]);
    const line = ops.findIndex((op, k) => op[0] === 'L' && k > 0 && ops[k - 1][0] !== 'Z' && Math.abs((ops[k - 1].at(-1) as number) - (op[2] as number)) < 0.01);
    if (line > 0) {
      const prev = ops[line - 1], op = ops[line];
      const len = Math.abs((op[1] as number) - (prev.at(-2) as number));
      const r = ((cb[2] - cb[0]) - len) / 2;
      if (r > 0.5 && r < 40) radii.push(r);
    }
  }

  const W = pages[0]?.width ?? 595.28, H = pages[0]?.height ?? 841.89;
  const bands = sections.map(s => byRole(s.block, 'ex-band')).filter((x): x is Element => Boolean(x)).map(box);
  const tops = pages.map(p => p.blocks.find(b => b.kind === 'section' || b.kind === 'title' || b.kind === 'content'))
    .filter((b): b is Block => b?.kind === 'section').map(b => H - box(byRole(b, 'ex-band')!)[3]);
  const footerTop = footer?.length ? Math.max(...footer.map(el => box(el)[3])) : undefined;
  const margins = {
    left: median(bands.map(b => b[0])) ?? 28,
    right: bands.length ? W - median(bands.map(b => b[2]))! : 31,
    top: median(tops) ?? 36,
    bottom: footerTop !== undefined ? footerTop + 14 : 56,
  };
  const r = (n: number | undefined) => n === undefined ? undefined : Math.round(n * 100) / 100;
  const t: Template = {
    ...(exerciseHeader ? {exerciseHeader} : {}),
    ...(item ? {item: styleOf(item), text: styleOf(item)} : {}),
    ...(example ? {example: styleOf(example)} : {}),
    ...(highlight ? {highlight: styleOf(highlight)} : {}),
    ...(heading ? {heading: styleOf(heading)} : {}),
    ...(itemPitch ? {itemPitch} : {}),
    ...(examplePitch ? {examplePitch} : {}),
    ...(textLeading || itemPitch ? {textLeading: textLeading ?? r(itemPitch! * 0.75)} : {}),
    ...(afterHeader.length ? {afterHeader: r(median(afterHeader))} : {}),
    ...(afterExample.length ? {afterExample: r(median(afterExample))} : {}),
    ...(indent.length ? {itemIndent: r(median(indent))} : {}),
    ...(columns.length ? {columnOffset: r(median(columns))} : {}),
    ...(footer?.length ? {footer} : {}),
    ...(side?.length ? {side} : {}),
    margins: {left: r(margins.left)!, right: r(margins.right)!, top: r(margins.top)!, bottom: r(margins.bottom)!},
    gap: r(median(gaps)) ?? 14,
    ...(radii.length ? {photoRadius: r(median(radii))} : {}),
  };
  return t;
}

/** What the template has and what is missing, in words, for the editor. */
export function describeTemplate(t: Template) {
  const has: string[] = [], missing: string[] = [];
  (t.exerciseHeader ? has : missing).push('encabezado de ejercicio');
  (t.item ? has : missing).push('estilo de los ítems');
  (t.example ? has : missing).push('estilo de los ejemplos');
  (t.highlight ? has : missing).push('color de resaltado');
  (t.heading ? has : missing).push('estilo de títulos');
  (t.footer ? has : missing).push('pie de página');
  (t.side ? has : missing).push('pestaña lateral');
  return {has, missing};
}

