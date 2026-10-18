import {lineLayout, noShaping, type EditorFonts} from './fonts';
import type {Block, Clip, Color, Element, Matrix, PathOp, Span} from './model';

// Geometry of elements: boxes, clips, moving and scaling. Boxes are [x0, y0, x1, y1] in PDF points.

export type Box = [number, number, number, number];

const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

export function opsBox(ops: PathOp[]): Box | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const op of ops) for (let k = 1; k + 1 < op.length; k += 2) {
    const x = op[k] as number, y = op[k + 1] as number;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : null;
}

export function matrixBox(m: Matrix): Box {
  const [a, b, c, d, e, f] = m;
  const xs = [e, a + e, c + e, a + c + e], ys = [f, b + f, d + f, b + d + f];
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Box of an element as the editor shows it (text from descender to ascender). */
export function elementBox(fonts: EditorFonts, el: Element): Box {
  if (el.kind === 'image') return matrixBox(el.matrix);
  if (el.kind === 'path') {
    const b = opsBox(el.ops) || [0, 0, 0, 0];
    const pad = (el.stroke?.width ?? 0) / 2;
    return [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad];
  }
  const {end} = lineLayout(fonts, el);
  let top = el.y, bottom = el.y;
  for (const span of el.spans) {
    const f = fonts[span.font].font;
    top = Math.max(top, el.y + f.ascent / f.unitsPerEm * span.size);
    bottom = Math.min(bottom, el.y + f.descent / f.unitsPerEm * span.size);
  }
  return [el.x, bottom, end, top];
}

/**
 * A box that surely holds all the ink of the element: for text, the font's full glyph box (stress marks over
 * capitals, descenders) and a point of margin. Used to decide that something is hidden or covers nothing.
 */
export function inkBox(fonts: EditorFonts, el: Element): Box {
  if (el.kind === 'image') return elementBox(fonts, el);
  if (el.kind === 'path') {
    const b = opsBox(el.ops) || [0, 0, 0, 0];
    const pad = el.stroke ? strokeReach(el.ops, el.stroke) : 0;
    return [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad];
  }
  // The outline of every letter where it is drawn, plus half a point.
  const {starts} = lineLayout(fonts, el);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  el.spans.forEach((span, i) => {
    const f = fonts[span.font].font;
    const s = span.size / f.unitsPerEm;
    const h = (span.scale ?? 100) / 100;
    const run = f.layout(span.text, noShaping);
    let x = starts[i];
    run.glyphs.forEach((g, k) => {
      const b = g.bbox;
      if (b.maxX > b.minX || b.maxY > b.minY) {
        x0 = Math.min(x0, x + b.minX * s * h); x1 = Math.max(x1, x + b.maxX * s * h);
        y0 = Math.min(y0, el.y + b.minY * s); y1 = Math.max(y1, el.y + b.maxY * s);
      }
      x += (run.positions[k].xAdvance * s + (span.charSpacing ?? 0) + (g.codePoints.includes(32) ? span.wordSpacing ?? 0 : 0)) * h;
    });
  });
  if (!Number.isFinite(x0)) return [el.x, el.y, el.x, el.y];
  return [x0 - 0.5, y0 - 0.5, x1 + 0.5, y1 + 0.5];
}

/**
 * How far a stroke can reach beyond its path: half the width, more at sharp mitred corners (up to the mitre
 * limit) and at square caps.
 */
export function strokeReach(ops: PathOp[], stroke: {width: number; cap?: number; join?: number; miter?: number}) {
  const half = stroke.width / 2;
  let ratio = 1;
  if ((stroke.join ?? 0) === 0) {
    const limit = stroke.miter ?? 10;
    let start: [number, number] | null = null, prev: [number, number] | null = null, inDir: [number, number] | null = null, firstDir: [number, number] | null = null;
    const corner = (a: [number, number], b: [number, number]) => {
      const la = Math.hypot(...a), lb = Math.hypot(...b);
      if (la < 1e-9 || lb < 1e-9) return;
      const cos = Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1]) / (la * lb)));
      const theta = Math.PI - Math.acos(cos); // angle between the two sides at the corner
      const r = 1 / Math.max(1e-9, Math.sin(theta / 2));
      if (r <= limit) ratio = Math.max(ratio, r);
    };
    const seg = (p0: [number, number], c1: [number, number], c2: [number, number], p3: [number, number]) => {
      const d0: [number, number] = c1[0] !== p0[0] || c1[1] !== p0[1] ? [c1[0] - p0[0], c1[1] - p0[1]] : [c2[0] - p0[0], c2[1] - p0[1]];
      const d1: [number, number] = p3[0] !== c2[0] || p3[1] !== c2[1] ? [p3[0] - c2[0], p3[1] - c2[1]] : [p3[0] - c1[0], p3[1] - c1[1]];
      if (inDir) corner(inDir, d0); else firstDir = d0;
      inDir = d1;
    };
    for (const op of ops) {
      if (op[0] === 'M') { start = prev = [op[1], op[2]]; inDir = null; firstDir = null; }
      else if (op[0] === 'L' && prev) { const p: [number, number] = [op[1], op[2]]; seg(prev, p, prev, p); prev = p; }
      else if (op[0] === 'C' && prev) { const p: [number, number] = [op[5], op[6]]; seg(prev, [op[1], op[2]], [op[3], op[4]], p); prev = p; }
      else if (op[0] === 'Z' && prev && start) {
        if (prev[0] !== start[0] || prev[1] !== start[1]) seg(prev, start, prev, start);
        if (inDir && firstDir) corner(inDir, firstDir);
        prev = start; inDir = null;
      }
    }
  }
  return half * Math.max(ratio, stroke.cap === 2 ? Math.SQRT2 : 1);
}

export const clipBox = (clip: Clip): Box => opsBox(clip.path) || [0, 0, 0, 0];

export function intersect(a: Box, b: Box): Box | null {
  const box: Box = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return box[0] < box[2] && box[1] < box[3] ? box : null;
}
export const contains = (outer: Box, inner: Box, tol = 0.01) =>
  inner[0] >= outer[0] - tol && inner[1] >= outer[1] - tol && inner[2] <= outer[2] + tol && inner[3] <= outer[3] + tol;
export const union = (a: Box, b: Box): Box => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];

/** The part of the element that can be seen through its clips (null when nothing can be seen). */
export function visibleBox(fonts: EditorFonts, el: Element, ink = false): Box | null {
  let box: Box | null = ink ? inkBox(fonts, el) : elementBox(fonts, el);
  for (const c of el.clips || []) { if (!box) break; box = intersect(box, clipBox(c)); }
  return box;
}

/** The box the author sees and handles: the visible part (a photo cut out of a larger picture is its cut-out). */
export function shownBox(fonts: EditorFonts, el: Element): Box {
  return visibleBox(fonts, el) ?? elementBox(fonts, el);
}

export function blockBox(fonts: EditorFonts, block: Block): Box | null {
  let box: Box | null = null;
  for (const el of block.elements) {
    const b = visibleBox(fonts, el);
    if (b) box = box ? union(box, b) : b;
  }
  return box;
}

/** A closed path that is a rectangle with sides along the page (as `re` draws it). */
export function rectOf(ops: PathOp[]): Box | null {
  const pts = ops.filter(o => o[0] !== 'Z');
  if (pts.some(o => o[0] === 'C') || pts.length < 4 || pts.length > 5 || pts[0][0] !== 'M' || ops[ops.length - 1][0] !== 'Z') return null;
  const xy = pts.map(o => [o[1] as number, o[2] as number]);
  if (xy.length === 5 && (Math.abs(xy[4][0] - xy[0][0]) > 0.01 || Math.abs(xy[4][1] - xy[0][1]) > 0.01)) return null;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = xy[i], [bx, by] = xy[(i + 1) % 4];
    if (Math.abs(ax - bx) > 0.01 && Math.abs(ay - by) > 0.01) return null;
  }
  return opsBox(ops);
}

export function isWhite(c: Color) {
  if (c.space === 'cmyk') return c.c.every(v => v < 0.002);
  return c.c.every(v => v > 0.998);
}

export function luminance(c: Color) {
  if (c.space === 'gray') return c.c[0];
  if (c.space === 'cmyk') return (1 - c.c[0]) * (1 - c.c[3]) * 0.3 + (1 - c.c[1]) * (1 - c.c[3]) * 0.59 + (1 - c.c[2]) * (1 - c.c[3]) * 0.11;
  return 0.3 * c.c[0] + 0.59 * c.c[1] + 0.11 * c.c[2];
}

const moveOps = (ops: PathOp[], dx: number, dy: number): PathOp[] => ops.map(op => {
  if (op[0] === 'Z') return op;
  const out = [...op] as (string | number)[];
  for (let k = 1; k + 1 < out.length; k += 2) { out[k] = r4((out[k] as number) + dx); out[k + 1] = r4((out[k + 1] as number) + dy); }
  return out as PathOp;
});

export function translate<T extends Element>(el: T, dx: number, dy: number): T {
  const clips = el.clips?.map(c => ({...c, path: moveOps(c.path, dx, dy)}));
  const base = {...el, ...(clips ? {clips} : {})};
  if (el.kind === 'text') return {...base, x: r4(el.x + dx), y: r4(el.y + dy), ...(el.spanX ? {spanX: el.spanX.map(x => r4(x + dx))} : {})} as T;
  if (el.kind === 'image') { const m = el.matrix; return {...base, matrix: [m[0], m[1], m[2], m[3], r4(m[4] + dx), r4(m[5] + dy)]} as T; }
  return {...base, ops: moveOps(el.ops, dx, dy)} as T;
}

/** Scales an element around a point: images keep their picture, clips follow; text changes its size. */
export function scaleAbout<T extends Element>(el: T, sx: number, sy: number, ox: number, oy: number): T {
  const sc = (ops: PathOp[]): PathOp[] => ops.map(op => {
    if (op[0] === 'Z') return op;
    const out = [...op] as (string | number)[];
    for (let k = 1; k + 1 < out.length; k += 2) { out[k] = r4(ox + ((out[k] as number) - ox) * sx); out[k + 1] = r4(oy + ((out[k + 1] as number) - oy) * sy); }
    return out as PathOp;
  });
  const clips = el.clips?.map(c => ({...c, path: sc(c.path)}));
  const base = {...el, ...(clips ? {clips} : {})};
  if (el.kind === 'image') {
    const [a, b, c, d, e, f] = el.matrix;
    return {...base, matrix: [r4(a * sx), r4(b * sy), r4(c * sx), r4(d * sy), r4(ox + (e - ox) * sx), r4(oy + (f - oy) * sy)]} as T;
  }
  if (el.kind === 'path') {
    const k = Math.sqrt(Math.abs(sx * sy));
    return {...base, ops: sc(el.ops), ...(el.stroke ? {stroke: {...el.stroke, width: r4(el.stroke.width * k)}} : {})} as T;
  }
  const k = sy;
  const spans: Span[] = el.spans.map(s => ({...s, size: r4(s.size * k)}));
  return {
    ...base, spans, x: r4(ox + (el.x - ox) * sx), y: r4(oy + (el.y - oy) * sy),
    ...(el.spanX ? {spanX: el.spanX.map(x => r4(ox + (x - ox) * sx))} : {}),
    ...(el.maxWidth !== undefined ? {maxWidth: r4(el.maxWidth * sx)} : {}),
  } as T;
}

/** A rectangle with rounded corners, as path operations (used to clip photos). */
export function roundedRect(x: number, y: number, w: number, h: number, r: number): PathOp[] {
  r = Math.min(r, w / 2, h / 2);
  const k = 0.5523 * r;
  return [
    ['M', r4(x + r), r4(y)], ['L', r4(x + w - r), r4(y)], ['C', r4(x + w - r + k), r4(y), r4(x + w), r4(y + r - k), r4(x + w), r4(y + r)],
    ['L', r4(x + w), r4(y + h - r)], ['C', r4(x + w), r4(y + h - r + k), r4(x + w - r + k), r4(y + h), r4(x + w - r), r4(y + h)],
    ['L', r4(x + r), r4(y + h)], ['C', r4(x + r - k), r4(y + h), r4(x), r4(y + h - r + k), r4(x), r4(y + h - r)],
    ['L', r4(x), r4(y + r)], ['C', r4(x), r4(y + r - k), r4(x + r - k), r4(y), r4(x + r), r4(y)], ['Z'],
  ];
}

export const plainText = (el: Element) => el.kind === 'text' ? el.spans.map(s => s.text).join('') : '';
