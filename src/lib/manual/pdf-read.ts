import {PDFArray, PDFBool, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFStream, PDFString, decodePDFRawStream, type PDFObject} from 'pdf-lib';
import type {Clip, Color, Element, FontId, ImageData, Matrix, PathOp, Span} from './model';

// Reads a PDF into the editor's elements without guessing: every text show, image and shape of each page becomes
// an element with its exact position, style and painting order. The PDF content stream is interpreted here
// (a small, strict interpreter): when a page uses something it does not understand (a font the editor cannot draw,
// a shading, an inline image…), the page is reported as unsupported and is kept as it is, never approximated.

export type StoredAsset = {bytes: Uint8Array; mime: 'application/octet-stream'};
export type ReadPage = {index: number; width: number; height: number; elements: Element[]; unsupported?: string; warnings: string[]};
export type ReadResult = {pages: ReadPage[]; assets: Map<string, StoredAsset>};

class Unsupported extends Error {}

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------- Matrices ----------

export const identity: Matrix = [1, 0, 0, 1, 0, 0];
/** m × n: first m, then n (PDF convention, row vectors). */
export const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
];
export const apply = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const round = (n: number) => Math.round(n * 1e4) / 1e4;

// ---------- Content stream lexer ----------

type Token =
  | {t: 'num'; v: number} | {t: 'name'; v: string} | {t: 'str'; v: Uint8Array} | {t: 'bool'; v: boolean} | {t: 'null'}
  | {t: 'arr'; v: Token[]} | {t: 'dict'; v: Map<string, Token>} | {t: 'op'; v: string};

const WS = new Set([0, 9, 10, 12, 13, 32]);
const DELIM = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37]);

function* lex(src: Uint8Array): Generator<Token | {t: 'end'; v: string}> {
  let i = 0;
  const n = src.length;
  const stack: {kind: 'arr' | 'dict'; items: Token[]}[] = [];
  const emit = function* (tok: Token): Generator<Token> {
    if (stack.length) stack[stack.length - 1].items.push(tok);
    else yield tok;
  };
  while (i < n) {
    const c = src[i];
    if (WS.has(c)) { i++; continue; }
    if (c === 37) { while (i < n && src[i] !== 10 && src[i] !== 13) i++; continue; } // % comment
    if (c === 47) { // /Name
      let j = i + 1;
      while (j < n && !WS.has(src[j]) && !DELIM.has(src[j])) j++;
      let name = new TextDecoder('latin1').decode(src.subarray(i + 1, j));
      name = name.replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
      i = j;
      yield* emit({t: 'name', v: name});
      continue;
    }
    if (c === 40) { // (string)
      const out: number[] = [];
      let depth = 1;
      i++;
      while (i < n && depth > 0) {
        const ch = src[i];
        if (ch === 92) { // backslash
          const e = src[i + 1];
          i += 2;
          if (e === 110) out.push(10); else if (e === 114) out.push(13); else if (e === 116) out.push(9);
          else if (e === 98) out.push(8); else if (e === 102) out.push(12);
          else if (e === 13) { if (src[i] === 10) i++; } else if (e === 10) { /* line continuation */ }
          else if (e >= 48 && e <= 55) {
            let v = e - 48;
            for (let k = 0; k < 2 && src[i] >= 48 && src[i] <= 55; k++) v = v * 8 + (src[i++] - 48);
            out.push(v & 255);
          } else out.push(e);
          continue;
        }
        if (ch === 40) depth++;
        if (ch === 41) { depth--; if (depth === 0) { i++; break; } }
        out.push(ch);
        i++;
      }
      yield* emit({t: 'str', v: new Uint8Array(out)});
      continue;
    }
    if (c === 60 && src[i + 1] === 60) { stack.push({kind: 'dict', items: []}); i += 2; continue; }
    if (c === 62 && src[i + 1] === 62) {
      const top = stack.pop();
      i += 2;
      if (!top || top.kind !== 'dict') throw new Unsupported('BAD_SYNTAX');
      const map = new Map<string, Token>();
      for (let k = 0; k + 1 < top.items.length; k += 2) { const key = top.items[k]; if (key.t === 'name') map.set(key.v, top.items[k + 1]); }
      yield* emit({t: 'dict', v: map});
      continue;
    }
    if (c === 60) { // <hex>
      let j = i + 1;
      let hex = '';
      while (j < n && src[j] !== 62) { if (!WS.has(src[j])) hex += String.fromCharCode(src[j]); j++; }
      i = j + 1;
      if (hex.length % 2) hex += '0';
      const bytes = new Uint8Array(hex.length / 2);
      for (let k = 0; k < bytes.length; k++) bytes[k] = parseInt(hex.slice(k * 2, k * 2 + 2), 16);
      yield* emit({t: 'str', v: bytes});
      continue;
    }
    if (c === 91) { stack.push({kind: 'arr', items: []}); i++; continue; }
    if (c === 93) {
      const top = stack.pop();
      i++;
      if (!top || top.kind !== 'arr') throw new Unsupported('BAD_SYNTAX');
      yield* emit({t: 'arr', v: top.items});
      continue;
    }
    // number or keyword
    let j = i;
    while (j < n && !WS.has(src[j]) && !DELIM.has(src[j])) j++;
    if (j === i) { i++; continue; }
    const word = new TextDecoder('latin1').decode(src.subarray(i, j));
    i = j;
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) { yield* emit({t: 'num', v: parseFloat(word)}); continue; }
    if (word === 'true' || word === 'false') { yield* emit({t: 'bool', v: word === 'true'}); continue; }
    if (word === 'null') { yield* emit({t: 'null'}); continue; }
    if (stack.length) throw new Unsupported('BAD_SYNTAX');
    if (word === 'BI') throw new Unsupported('Imagen incrustada en el texto de la página (inline image).');
    yield {t: 'end', v: word};
  }
}

// ---------- Fonts ----------

type FontInfo = {
  id: FontId | null;
  baseName: string;
  bytesPerCode: 1 | 2;
  toUnicode: Map<number, string>;
  widths: Map<number, number>;
  defaultWidth: number;
  type3: boolean;
};

const nameOf = (o: PDFObject | undefined) => o instanceof PDFName ? o.decodeText() : undefined;
const numOf = (o: PDFObject | undefined) => o instanceof PDFNumber ? o.asNumber() : undefined;

function streamBytes(doc: PDFDocument, o: PDFObject | undefined): Uint8Array | null {
  const s = o instanceof PDFRef ? doc.context.lookup(o) : o;
  if (s instanceof PDFRawStream) return decodePDFRawStream(s).decode();
  if (s instanceof PDFStream) return s.getContents();
  return null;
}

function parseCMap(bytes: Uint8Array): {map: Map<number, string>; bytes: 1 | 2} {
  const text = new TextDecoder('latin1').decode(bytes);
  const map = new Map<number, string>();
  const hexText = (h: string) => {
    const b = new Uint8Array(h.length / 2);
    for (let i = 0; i < b.length; i++) b[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
    let s = '';
    for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode((b[i] << 8) | b[i + 1]);
    return s;
  };
  let codeBytes: 1 | 2 = 1;
  const space = /begincodespacerange\s*<([0-9A-Fa-f]+)>/.exec(text);
  if (space && space[1].length >= 4) codeBytes = 2;
  for (const sec of text.match(/beginbfchar[\s\S]*?endbfchar/g) || []) {
    for (const m of sec.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)) map.set(parseInt(m[1], 16), hexText(m[2]));
  }
  for (const sec of text.match(/beginbfrange[\s\S]*?endbfrange/g) || []) {
    for (const m of sec.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]*>|\[[^\]]*\])/g)) {
      const lo = parseInt(m[1], 16), hi = parseInt(m[2], 16);
      if (hi - lo > 65535) continue;
      if (m[3].startsWith('[')) {
        const items = [...m[3].matchAll(/<([0-9A-Fa-f]*)>/g)].map(x => hexText(x[1]));
        for (let c = lo; c <= hi && c - lo < items.length; c++) map.set(c, items[c - lo]);
      } else {
        const first = hexText(m[3].slice(1, -1));
        const lastCode = first.charCodeAt(first.length - 1);
        for (let c = lo; c <= hi; c++) map.set(c, first.slice(0, -1) + String.fromCharCode(lastCode + (c - lo)));
      }
    }
  }
  return {map, bytes: codeBytes};
}

/** The PDF font names the editor can draw with its own copy of the same font. */
export function editorFont(baseName: string): FontId | null {
  const name = baseName.replace(/^[A-Z]{6}\+/, '');
  if (name === 'DejaVuSans' || name === 'DejaVuSans-Book') return 'regular';
  if (name === 'DejaVuSans-Bold') return 'bold';
  return null;
}

function readFont(doc: PDFDocument, dict: PDFDict): FontInfo {
  const subtype = nameOf(dict.get(PDFName.of('Subtype')));
  const baseName = nameOf(dict.get(PDFName.of('BaseFont'))) || '';
  const tu = streamBytes(doc, dict.get(PDFName.of('ToUnicode')));
  const cmap = tu ? parseCMap(tu) : {map: new Map<number, string>(), bytes: 1 as const};
  const widths = new Map<number, number>();
  if (subtype === 'Type0') {
    const desc = dict.lookup(PDFName.of('DescendantFonts'), PDFArray).lookup(0, PDFDict);
    const dw = numOf(desc.get(PDFName.of('DW'))) ?? 1000;
    const w = desc.lookupMaybe(PDFName.of('W'), PDFArray);
    if (w) {
      const items = w.asArray().map(x => x instanceof PDFRef ? doc.context.lookup(x) : x);
      for (let i = 0; i < items.length;) {
        const first = numOf(items[i]);
        const next = items[i + 1];
        if (first === undefined) break;
        if (next instanceof PDFArray) {
          next.asArray().forEach((v, k) => widths.set(first + k, numOf(v) ?? dw));
          i += 2;
        } else {
          const last = numOf(next), width = numOf(items[i + 2]);
          if (last === undefined || width === undefined) break;
          for (let c = first; c <= last && c - first < 65536; c++) widths.set(c, width);
          i += 3;
        }
      }
    }
    const encoding = nameOf(dict.get(PDFName.of('Encoding')));
    if (encoding !== 'Identity-H') throw new Unsupported('Fuente compuesta con una codificación que el editor no lee (' + (encoding || 'propia') + ').');
    return {id: editorFont(baseName), baseName, bytesPerCode: 2, toUnicode: cmap.map, widths, defaultWidth: dw, type3: false};
  }
  const first = numOf(dict.get(PDFName.of('FirstChar'))) ?? 0;
  const list = dict.lookupMaybe(PDFName.of('Widths'), PDFArray);
  list?.asArray().forEach((v, k) => widths.set(first + k, numOf(v instanceof PDFRef ? doc.context.lookup(v) : v) ?? 0));
  const descriptor = dict.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict);
  const missing = numOf(descriptor?.get(PDFName.of('MissingWidth'))) ?? 0;
  return {id: editorFont(baseName), baseName, bytesPerCode: 1, toUnicode: cmap.map, widths, defaultWidth: missing, type3: subtype === 'Type3'};
}

// ---------- Interpreter ----------

type GState = {
  ctm: Matrix;
  fill: Color; stroke: Color;
  lineWidth: number; cap: number; join: number; miter: number; dash: [number[], number] | null;
  clips: Clip[];
  fillAlpha: number; strokeAlpha: number;
};

const gray0: Color = {space: 'gray', c: [0]};
const clamp = (v: number) => Math.max(0, Math.min(1, v));

function colorFrom(space: string, args: number[]): Color {
  if (space === 'DeviceRGB' && args.length === 3) return {space: 'rgb', c: args.map(clamp)};
  if (space === 'DeviceGray' && args.length === 1) return {space: 'gray', c: args.map(clamp)};
  if (space === 'DeviceCMYK' && args.length === 4) return {space: 'cmyk', c: args.map(clamp)};
  throw new Unsupported('Color en un espacio que el editor no reproduce (' + space + ').');
}

type Ctx = {
  doc: PDFDocument;
  assets: Map<string, StoredAsset>;
  elements: Element[];
  warnings: Set<string>;
  pageIndex: number;
  counter: number;
  /** By font object: the same resource name can mean another font inside a group (Form XObject). */
  fonts: Map<PDFDict, FontInfo>;
  /** Image stream → stored data, so a picture used eight times is stored once. */
  images: Map<PDFObject, Promise<ImageData>>;
  /** Where each text show ends, to join only the pieces of a line that touch. */
  ends: WeakMap<Element, number>;
};

const nextId = (ctx: Ctx) => 'p' + ctx.pageIndex + '-e' + (ctx.counter++);

async function imageData(ctx: Ctx, stream: PDFRawStream, isMask = false): Promise<ImageData> {
  const known = ctx.images.get(stream);
  if (known) return known;
  const task = (async () => {
    const d = stream.dict;
    if (d.get(PDFName.of('ImageMask')) instanceof PDFBool && (d.get(PDFName.of('ImageMask')) as PDFBool).asBoolean()) throw new Unsupported('Imagen de máscara (stencil).');
    if (d.has(PDFName.of('Mask'))) throw new Unsupported('Imagen con máscara de color.');
    const width = numOf(d.lookup(PDFName.of('Width'))), height = numOf(d.lookup(PDFName.of('Height')));
    if (!width || !height) throw new Unsupported('Imagen sin tamaño.');
    const csObj = d.lookup(PDFName.of('ColorSpace'));
    let colorSpace = nameOf(csObj);
    if (!colorSpace && csObj instanceof PDFArray && nameOf(csObj.get(0)) === 'ICCBased') {
      const n = numOf(csObj.lookup(1, PDFStream).dict.lookup(PDFName.of('N')));
      colorSpace = n === 1 ? 'DeviceGray' : n === 4 ? 'DeviceCMYK' : 'DeviceRGB';
      ctx.warnings.add('Una imagen usa un perfil de color: se conserva su contenido, el perfil no.');
    }
    if (!isMask && colorSpace !== 'DeviceRGB' && colorSpace !== 'DeviceGray' && colorSpace !== 'DeviceCMYK') throw new Unsupported('Imagen en un espacio de color que el editor no reproduce.');
    const filterObj = d.lookup(PDFName.of('Filter'));
    const filters = filterObj instanceof PDFArray ? filterObj.asArray().map(nameOf).filter((x): x is string => Boolean(x)) : nameOf(filterObj) ? [nameOf(filterObj)!] : [];
    const parmsObj = d.lookup(PDFName.of('DecodeParms'));
    const parmsOf = (p: PDFObject | undefined) => {
      const dict = p instanceof PDFRef ? ctx.doc.context.lookup(p) : p;
      if (!(dict instanceof PDFDict)) return null;
      const out: Record<string, number | boolean | string> = {};
      for (const [k, v] of dict.entries()) {
        const key = k.decodeText();
        if (v instanceof PDFNumber) out[key] = v.asNumber(); else if (v instanceof PDFBool) out[key] = v.asBoolean(); else if (v instanceof PDFName) out[key] = '/' + v.decodeText();
      }
      return out;
    };
    const decodeParms = parmsObj instanceof PDFArray ? parmsObj.asArray().map(parmsOf) : parmsObj ? [parmsOf(parmsObj)] : undefined;
    const decodeArr = d.lookupMaybe(PDFName.of('Decode'), PDFArray)?.asArray().map(v => numOf(v) ?? 0);
    const interpolate = d.get(PDFName.of('Interpolate')) instanceof PDFBool ? (d.get(PDFName.of('Interpolate')) as PDFBool).asBoolean() : undefined;
    const bytes = stream.contents;
    const asset = await sha256(bytes);
    ctx.assets.set(asset, {bytes, mime: 'application/octet-stream'});
    return {
      asset, format: 'raw', width, height,
      ...(colorSpace ? {colorSpace: colorSpace as ImageData['colorSpace']} : {}),
      bitsPerComponent: numOf(d.lookup(PDFName.of('BitsPerComponent'))) ?? 8,
      ...(filters.length ? {filters} : {}),
      ...(decodeParms ? {decodeParms} : {}),
      ...(decodeArr ? {decode: decodeArr} : {}),
      ...(interpolate !== undefined ? {interpolate} : {}),
    } as ImageData;
  })();
  ctx.images.set(stream, task);
  return task;
}

const scaleOf = (m: Matrix) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

async function run(ctx: Ctx, content: Uint8Array, resources: PDFDict | undefined, start: GState, depth: number) {
  if (depth > 6) throw new Unsupported('Grupos anidados demasiado profundos.');
  let gs: GState = {...start, clips: [...start.clips]};
  const stack: {gs: GState; text: [FontInfo | null, number, number, number, number, number, number, number]}[] = [];
  let path: PathOp[] = [];
  let pendingClip: boolean | null = null; // evenOdd when set
  let cur: [number, number] = [0, 0];
  let subStart: [number, number] = [0, 0];
  // Text state
  let tm: Matrix = identity, tlm: Matrix = identity;
  let font: FontInfo | null = null;
  let fontSize = 0, tc = 0, tw = 0, th = 100, tl = 0, ts = 0, tr = 0;
  let inText = false;
  const operands: Token[] = [];

  const res = (cat: string) => resources?.lookupMaybe(PDFName.of(cat), PDFDict);
  const n = (k: number) => { const t = operands[k]; if (!t || t.t !== 'num') throw new Unsupported('BAD_OPERANDS'); return t.v; };
  const nums = () => operands.map(t => { if (t.t !== 'num') throw new Unsupported('BAD_OPERANDS'); return t.v; });

  const point = (x: number, y: number): [number, number] => { const p = apply(gs.ctm, x, y); return [round(p[0]), round(p[1])]; };

  const finishPath = (fill: 'nz' | 'eo' | null, stroke: boolean) => {
    if (path.length && (fill || stroke)) {
      const scale = scaleOf(gs.ctm);
      const el: Element = {
        id: nextId(ctx), kind: 'path', z: ctx.elements.length, ops: path,
        ...(fill ? {fill: {color: gs.fill, evenOdd: fill === 'eo'}} : {}),
        ...(stroke ? {stroke: {
          color: gs.stroke, width: round(gs.lineWidth * scale),
          ...(gs.cap ? {cap: gs.cap} : {}), ...(gs.join ? {join: gs.join} : {}), ...(gs.miter !== 10 ? {miter: gs.miter} : {}),
          ...(gs.dash && gs.dash[0].length ? {dash: [gs.dash[0].map(v => round(v * scale)), round(gs.dash[1] * scale)] as [number[], number]} : {}),
        }} : {}),
        ...(gs.clips.length ? {clips: gs.clips} : {}),
        ...((fill ? gs.fillAlpha : gs.strokeAlpha) < 1 ? {opacity: fill ? gs.fillAlpha : gs.strokeAlpha} : {}),
      };
      ctx.elements.push(el);
    }
    if (pendingClip !== null && path.length) gs.clips = [...gs.clips, {path, evenOdd: pendingClip}];
    pendingClip = null;
    path = [];
  };

  const showText = (bytes: Uint8Array) => {
    if (!font) throw new Unsupported('Texto sin fuente.');
    if (font.type3) throw new Unsupported('Fuente dibujada a mano (Type 3).');
    if (!inText) throw new Unsupported('Texto fuera de un bloque de texto.');
    let text = '';
    let advance = 0; // in text space, before Th
    const codes: number[] = [];
    for (let i = 0; i < bytes.length; i += font.bytesPerCode) codes.push(font.bytesPerCode === 2 ? (bytes[i] << 8) | (bytes[i + 1] ?? 0) : bytes[i]);
    for (const code of codes) {
      const uni = font.toUnicode.get(code);
      if (uni === undefined) {
        if (font.bytesPerCode === 1 && code >= 32 && code < 127) text += String.fromCharCode(code);
        else throw new Unsupported('Letras sin equivalencia Unicode en la fuente ' + font.baseName + '.');
      } else text += uni;
      const w = (font.widths.get(code) ?? font.defaultWidth) / 1000;
      advance += w * fontSize + tc + (font.bytesPerCode === 1 && code === 32 ? tw : 0);
    }
    if (tr !== 0 && tr !== 3) throw new Unsupported('Texto con contorno o recorte (modo ' + tr + ').');
    const trm = multiply([fontSize * th / 100, 0, 0, fontSize, 0, ts], multiply(tm, gs.ctm));
    const m = multiply(tm, gs.ctm);
    if (Math.abs(m[1]) > 1e-6 || Math.abs(m[2]) > 1e-6 || m[0] <= 0 || Math.abs(m[0] - m[3]) > 1e-4) throw new Unsupported('Texto girado o deformado.');
    if (text.length && font.id === null) throw new Unsupported('Usa la fuente «' + font.baseName.replace(/^[A-Z]{6}\+/, '') + '», que el editor todavía no tiene.');
    const s = m[0];
    const endX = round(apply(multiply([1, 0, 0, 1, advance * th / 100, ts], m), 0, 0)[0]);
    if (text.length) {
      const span: Span = {
        text, font: font.id!, size: round(fontSize * s), color: gs.fill,
        ...(tc ? {charSpacing: round(tc * s)} : {}), ...(tw ? {wordSpacing: round(tw * s)} : {}), ...(th !== 100 ? {scale: th} : {}),
      };
      const el: Element = {
        id: nextId(ctx), kind: 'text', z: ctx.elements.length, x: round(trm[4]), y: round(trm[5]), spans: [span],
        ...(tr === 3 ? {mode: 3} : {}),
        ...(gs.clips.length ? {clips: gs.clips} : {}),
        ...(gs.fillAlpha < 1 ? {opacity: gs.fillAlpha} : {}),
      };
      ctx.elements.push(el);
      ctx.ends.set(el, endX);
    }
    tm = multiply([1, 0, 0, 1, advance * th / 100, 0], tm);
  };

  for (const tok of lex(content)) {
    if (tok.t !== 'end') { operands.push(tok as Token); continue; }
    const op = tok.v;
    switch (op) {
      // The text state (font, spacing, leading…) is part of the graphics state that q/Q save and restore.
      case 'q': stack.push({gs: {...gs, clips: [...gs.clips]}, text: [font, fontSize, tc, tw, th, tl, ts, tr]}); break;
      case 'Q': {
        const saved = stack.pop();
        if (saved) { gs = saved.gs; [font, fontSize, tc, tw, th, tl, ts, tr] = saved.text; }
        break;
      }
      case 'cm': gs = {...gs, ctm: multiply(nums() as Matrix, gs.ctm)}; break;
      case 'w': gs.lineWidth = n(0); break;
      case 'J': gs.cap = n(0); break;
      case 'j': gs.join = n(0); break;
      case 'M': gs.miter = n(0); break;
      case 'd': {
        const arr = operands[0];
        gs.dash = arr?.t === 'arr' ? [arr.v.map(v => v.t === 'num' ? v.v : 0), n(1)] : null;
        break;
      }
      case 'ri': case 'i': break;
      case 'gs': {
        const name = operands[0]?.t === 'name' ? operands[0].v : '';
        const g = res('ExtGState')?.lookupMaybe(PDFName.of(name), PDFDict);
        if (!g) break;
        for (const [k, v] of g.entries()) {
          const key = k.decodeText();
          const value = v instanceof PDFRef ? ctx.doc.context.lookup(v) : v;
          if (key === 'Type' || key === 'OP' || key === 'op' || key === 'OPM' || key === 'SA' || key === 'FL' || key === 'SM' || key === 'RI' || key === 'AIS' && !(value instanceof PDFBool && value.asBoolean())) continue;
          if (key === 'LW') gs.lineWidth = numOf(value) ?? gs.lineWidth;
          else if (key === 'LC') gs.cap = numOf(value) ?? gs.cap;
          else if (key === 'LJ') gs.join = numOf(value) ?? gs.join;
          else if (key === 'ML') gs.miter = numOf(value) ?? gs.miter;
          else if (key === 'CA') gs.strokeAlpha = numOf(value) ?? 1;
          else if (key === 'ca') gs.fillAlpha = numOf(value) ?? 1;
          else if (key === 'BM' && (nameOf(value) === 'Normal' || nameOf(value) === 'Compatible')) continue;
          else if (key === 'SMask' && nameOf(value) === 'None') continue;
          else throw new Unsupported('Efecto gráfico que el editor no reproduce (' + key + ').');
        }
        break;
      }
      // colours
      case 'g': gs.fill = colorFrom('DeviceGray', nums()); break;
      case 'G': gs.stroke = colorFrom('DeviceGray', nums()); break;
      case 'rg': gs.fill = colorFrom('DeviceRGB', nums()); break;
      case 'RG': gs.stroke = colorFrom('DeviceRGB', nums()); break;
      case 'k': gs.fill = colorFrom('DeviceCMYK', nums()); break;
      case 'K': gs.stroke = colorFrom('DeviceCMYK', nums()); break;
      case 'cs': case 'CS': {
        const name = operands[0]?.t === 'name' ? operands[0].v : '';
        const space = name.startsWith('Device') ? name : (() => {
          const cs = res('ColorSpace')?.lookup(PDFName.of(name));
          if (cs instanceof PDFArray && nameOf(cs.get(0)) === 'ICCBased') {
            const k = numOf(cs.lookup(1, PDFStream).dict.lookup(PDFName.of('N')));
            ctx.warnings.add('Un color usa un perfil de color: se conserva su valor, el perfil no.');
            return k === 1 ? 'DeviceGray' : k === 4 ? 'DeviceCMYK' : 'DeviceRGB';
          }
          throw new Unsupported('Espacio de color que el editor no reproduce (' + name + ').');
        })();
        const initial = space === 'DeviceGray' ? [0] : space === 'DeviceCMYK' ? [0, 0, 0, 1] : [0, 0, 0];
        if (op === 'cs') { gs.fill = colorFrom(space, initial); (gs as GState & {fillSpace?: string}).fillSpace = space; }
        else { gs.stroke = colorFrom(space, initial); (gs as GState & {strokeSpace?: string}).strokeSpace = space; }
        break;
      }
      case 'sc': case 'scn': case 'SC': case 'SCN': {
        if (operands.some(t => t.t === 'name')) throw new Unsupported('Relleno con trama o patrón.');
        const fill = op === 'sc' || op === 'scn';
        const space = (gs as GState & {fillSpace?: string; strokeSpace?: string})[fill ? 'fillSpace' : 'strokeSpace'] || (operands.length === 1 ? 'DeviceGray' : operands.length === 4 ? 'DeviceCMYK' : 'DeviceRGB');
        const color = colorFrom(space, nums());
        if (fill) gs.fill = color; else gs.stroke = color;
        break;
      }
      // paths
      case 'm': cur = point(n(0), n(1)); subStart = cur; path.push(['M', ...cur]); break;
      case 'l': cur = point(n(0), n(1)); path.push(['L', ...cur]); break;
      case 'c': { const a = point(n(0), n(1)), b = point(n(2), n(3)); cur = point(n(4), n(5)); path.push(['C', ...a, ...b, ...cur]); break; }
      case 'v': { const b = point(n(0), n(1)); const a = cur; cur = point(n(2), n(3)); path.push(['C', ...a, ...b, ...cur]); break; }
      case 'y': { const a = point(n(0), n(1)); cur = point(n(2), n(3)); path.push(['C', ...a, ...cur, ...cur]); break; }
      case 'h': path.push(['Z']); cur = subStart; break;
      case 're': {
        const [x, y, w, h] = nums();
        const p1 = point(x, y), p2 = point(x + w, y), p3 = point(x + w, y + h), p4 = point(x, y + h);
        path.push(['M', ...p1], ['L', ...p2], ['L', ...p3], ['L', ...p4], ['Z']);
        cur = p1; subStart = p1;
        break;
      }
      case 'S': finishPath(null, true); break;
      case 's': path.push(['Z']); finishPath(null, true); break;
      case 'f': case 'F': finishPath('nz', false); break;
      case 'f*': finishPath('eo', false); break;
      case 'B': finishPath('nz', true); break;
      case 'B*': finishPath('eo', true); break;
      case 'b': path.push(['Z']); finishPath('nz', true); break;
      case 'b*': path.push(['Z']); finishPath('eo', true); break;
      case 'n': finishPath(null, false); break;
      case 'W': pendingClip = false; break;
      case 'W*': pendingClip = true; break;
      // text
      case 'BT': inText = true; tm = identity; tlm = identity; break;
      case 'ET': inText = false; break;
      case 'Tf': {
        const name = operands[0]?.t === 'name' ? operands[0].v : '';
        fontSize = n(1);
        const dict = res('Font')?.lookupMaybe(PDFName.of(name), PDFDict);
        if (!dict) throw new Unsupported('Fuente que falta en el PDF.');
        if (!ctx.fonts.has(dict)) ctx.fonts.set(dict, readFont(ctx.doc, dict));
        font = ctx.fonts.get(dict)!;
        break;
      }
      case 'Tc': tc = n(0); break;
      case 'Tw': tw = n(0); break;
      case 'Tz': th = n(0); break;
      case 'TL': tl = n(0); break;
      case 'Ts': ts = n(0); break;
      case 'Tr': tr = n(0); break;
      case 'Td': tlm = multiply([1, 0, 0, 1, n(0), n(1)], tlm); tm = tlm; break;
      case 'TD': tl = -n(1); tlm = multiply([1, 0, 0, 1, n(0), n(1)], tlm); tm = tlm; break;
      case 'Tm': tlm = nums() as Matrix; tm = tlm; break;
      case 'T*': tlm = multiply([1, 0, 0, 1, 0, -tl], tlm); tm = tlm; break;
      case 'Tj': { const s = operands[0]; if (s?.t === 'str') showText(s.v); break; }
      case "'": { tlm = multiply([1, 0, 0, 1, 0, -tl], tlm); tm = tlm; const s = operands[0]; if (s?.t === 'str') showText(s.v); break; }
      case '"': { tw = n(0); tc = n(1); tlm = multiply([1, 0, 0, 1, 0, -tl], tlm); tm = tlm; const s = operands[2]; if (s?.t === 'str') showText(s.v); break; }
      case 'TJ': {
        const arr = operands[0];
        if (arr?.t !== 'arr') break;
        for (const item of arr.v) {
          if (item.t === 'str') showText(item.v);
          else if (item.t === 'num') tm = multiply([1, 0, 0, 1, (-item.v / 1000) * fontSize * th / 100, 0], tm);
        }
        break;
      }
      // XObjects
      case 'Do': {
        const name = operands[0]?.t === 'name' ? operands[0].v : '';
        const ref = res('XObject')?.get(PDFName.of(name));
        const xo = ref instanceof PDFRef ? ctx.doc.context.lookup(ref) : ref;
        if (!(xo instanceof PDFRawStream)) throw new Unsupported('Objeto gráfico que falta.');
        const sub = nameOf(xo.dict.get(PDFName.of('Subtype')));
        if (sub === 'Image') {
          const image = await imageData(ctx, xo);
          const smaskRef = xo.dict.get(PDFName.of('SMask'));
          const smask = smaskRef ? ctx.doc.context.lookup(smaskRef) : undefined;
          const smaskData = smask instanceof PDFRawStream ? await imageData(ctx, smask, true) : undefined;
          ctx.elements.push({
            id: nextId(ctx), kind: 'image', z: ctx.elements.length, matrix: gs.ctm.map(round) as Matrix, image,
            ...(smaskData ? {smask: smaskData} : {}),
            ...(gs.clips.length ? {clips: gs.clips} : {}),
            ...(gs.fillAlpha < 1 ? {opacity: gs.fillAlpha} : {}),
          });
        } else if (sub === 'Form') {
          if (xo.dict.has(PDFName.of('Group'))) {
            const group = xo.dict.lookup(PDFName.of('Group'), PDFDict);
            if (nameOf(group.get(PDFName.of('S'))) === 'Transparency') ctx.warnings.add('Un grupo transparente se dibuja con sus objetos uno por uno.');
          }
          const m = xo.dict.lookupMaybe(PDFName.of('Matrix'), PDFArray)?.asArray().map(v => numOf(v) ?? 0) as Matrix | undefined;
          const inner: GState = {...gs, ctm: multiply(m || identity, gs.ctm), clips: [...gs.clips]};
          const bbox = xo.dict.lookupMaybe(PDFName.of('BBox'), PDFArray)?.asArray().map(v => numOf(v) ?? 0);
          if (bbox) {
            const [x0, y0, x1, y1] = bbox;
            const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => { const p = apply(inner.ctm, x, y); return [round(p[0]), round(p[1])] as [number, number]; });
            inner.clips.push({path: [['M', ...pts[0]], ['L', ...pts[1]], ['L', ...pts[2]], ['L', ...pts[3]], ['Z']], evenOdd: false});
          }
          const formRes = xo.dict.lookupMaybe(PDFName.of('Resources'), PDFDict) || resources;
          await run(ctx, decodePDFRawStream(xo).decode(), formRes, inner, depth + 1);
        } else throw new Unsupported('Objeto gráfico desconocido.');
        break;
      }
      // marked content and compatibility sections: no drawing
      case 'BMC': case 'BDC': case 'EMC': case 'MP': case 'DP': case 'BX': case 'EX': break;
      case 'sh': throw new Unsupported('Degradado (shading).');
      case 'd0': case 'd1': throw new Unsupported('Fuente Type 3.');
      default: throw new Unsupported('Instrucción de dibujo desconocida (' + op + ').');
    }
    operands.length = 0;
  }
}

/**
 * Consecutive text shows that continue each other on the same baseline become one line with several spans
 * (a bold word, a highlight). Pieces with a gap between them (two columns, a code at the end of a band) stay apart.
 */
function joinLines(elements: Element[], ends: WeakMap<Element, number>) {
  const out: Element[] = [];
  let lastEnd = 0;
  for (const el of elements) {
    const prev = out[out.length - 1];
    if (el.kind === 'text' && prev?.kind === 'text' && Math.abs(prev.y - el.y) < 0.01 && prev.mode === el.mode
      && JSON.stringify(prev.clips || []) === JSON.stringify(el.clips || []) && (prev.opacity ?? 1) === (el.opacity ?? 1)
      && el.x >= lastEnd - 0.5 && el.x - lastEnd < Math.max(1.5, 0.3 * el.spans[0].size)) {
      const xs = prev.spanX || [prev.x];
      out[out.length - 1] = {...prev, spans: [...prev.spans, ...el.spans], spanX: [...xs, el.x]};
      lastEnd = ends.get(el) ?? el.x;
      continue;
    }
    out.push(el);
    lastEnd = ends.get(el) ?? (el.kind === 'text' ? el.x : 0);
  }
  return out.map((el, z) => ({...el, z}));
}

export async function readPdf(bytes: Uint8Array, opts: {maxPages?: number} = {}): Promise<ReadResult> {
  const doc = await PDFDocument.load(bytes, {updateMetadata: false});
  const assets = new Map<string, StoredAsset>();
  const images = new Map<PDFObject, Promise<ImageData>>();
  const fonts = new Map<PDFDict, FontInfo>();
  const ends = new WeakMap<Element, number>();
  const pages: ReadPage[] = [];
  const list = doc.getPages().slice(0, opts.maxPages ?? 300);
  for (let index = 0; index < list.length; index++) {
    const page = list[index];
    const box = page.getMediaBox();
    const warnings = new Set<string>();
    const ctx: Ctx = {doc, assets, elements: [], warnings, pageIndex: index, counter: 0, fonts, images, ends};
    let unsupported: string | undefined;
    try {
      if (page.getRotation().angle % 360 !== 0) throw new Unsupported('Página girada.');
      const contents = page.node.Contents();
      const streams = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
      const parts = streams.map(s => streamBytes(doc, s) || new Uint8Array());
      const total = parts.reduce((n, p) => n + p.length + 1, 0);
      const content = new Uint8Array(total);
      let at = 0;
      for (const p of parts) { content.set(p, at); at += p.length; content[at++] = 10; }
      const start: GState = {
        ctm: [1, 0, 0, 1, -box.x, -box.y], fill: gray0, stroke: gray0, lineWidth: 1, cap: 0, join: 0, miter: 10, dash: null,
        clips: [], fillAlpha: 1, strokeAlpha: 1,
      };
      await run(ctx, content, page.node.Resources(), start, 0);
      const annots = page.node.Annots();
      if (annots && annots.size()) warnings.add('La página tiene ' + annots.size() + ' anotaciones (enlaces o comentarios) que no se conservan.');
    } catch (e) {
      if (!(e instanceof Unsupported)) throw e;
      unsupported = e.message === 'BAD_SYNTAX' || e.message === 'BAD_OPERANDS' ? 'El contenido de la página no se pudo leer.' : e.message;
    }
    pages.push({index, width: box.width, height: box.height, elements: unsupported ? [] : joinLines(ctx.elements, ends), ...(unsupported ? {unsupported} : {}), warnings: [...warnings]});
  }
  return {pages, assets};
}

export {PDFHexString, PDFString};
