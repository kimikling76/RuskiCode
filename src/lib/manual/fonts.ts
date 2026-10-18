import fontkit from '@pdf-lib/fontkit';
import type {Font, TypeFeatures} from 'pdf-lib/cjs/types/fontkit';
import {fontFiles, fontIds, type FontId, type Span, type TextElement} from './model';

// The editor draws text with its own copy of DejaVu Sans, the font of the manual. Letters are placed one by one,
// exactly as the original PDF placed them: no ligatures ("fi"), no kerning and no repositioning of the stress
// mark. With shaping on, the same text would come out slightly different from the imported page.

export const noShaping: TypeFeatures = {
  liga: false, kern: false, calt: false, clig: false, ccmp: false, locl: false, mark: false, mkmk: false, rlig: false, dlig: false,
};

export type EditorFont = {bytes: Uint8Array; font: Font};
export type EditorFonts = Record<FontId, EditorFont>;

export function editorFonts(bytes: Record<FontId, Uint8Array>): EditorFonts {
  const out = {} as EditorFonts;
  for (const id of fontIds) out[id] = {bytes: bytes[id], font: (fontkit as unknown as {create(b: Uint8Array): Font}).create(bytes[id])};
  return out;
}

let loading: Promise<EditorFonts> | null = null;
/** In the browser: the fonts from /fonts/dejavu, fetched once. */
export function fetchEditorFonts(): Promise<EditorFonts> {
  loading ??= (async () => {
    const entries = await Promise.all(fontIds.map(async id => {
      const res = await fetch(fontFiles[id]);
      if (!res.ok) throw new Error('No se pudo cargar la fuente del editor (' + fontFiles[id] + ').');
      return [id, new Uint8Array(await res.arrayBuffer())] as const;
    }));
    return editorFonts(Object.fromEntries(entries) as Record<FontId, Uint8Array>);
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

/** Letters the font cannot draw (they would come out as empty boxes). */
export function missingChars(fonts: EditorFonts, id: FontId, text: string) {
  const out = new Set<string>();
  for (const ch of text) if (!/\s/.test(ch) && !fonts[id].font.hasGlyphForCodePoint(ch.codePointAt(0)!)) out.add(ch);
  return [...out];
}

/** Advance of a span in points, with the PDF's character and word spacing and horizontal scaling. */
export function spanWidth(fonts: EditorFonts, span: Span) {
  const font = fonts[span.font].font;
  const run = font.layout(span.text, noShaping);
  let w = run.advanceWidth / font.unitsPerEm * span.size;
  const chars = run.glyphs.length;
  if (span.charSpacing) w += span.charSpacing * chars;
  if (span.wordSpacing) w += span.wordSpacing * (span.text.match(/ /g)?.length ?? 0);
  return w * (span.scale ?? 100) / 100;
}

/** Where each span starts (x) and where the line ends. */
export function lineLayout(fonts: EditorFonts, el: TextElement) {
  const starts: number[] = [];
  let x = el.x;
  let end = el.x;
  el.spans.forEach((span, i) => {
    const at = el.spanX?.[i] ?? x;
    starts.push(at);
    x = at + spanWidth(fonts, span);
    end = Math.max(end, x);
  });
  return {starts, end};
}
