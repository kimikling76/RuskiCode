import {z} from 'zod';
import {editable, editText, mapElement, updateComponent} from './edit';
import {plainText} from './elements';
import {lineLayout, missingChars, type EditorFonts} from './fonts';
import type {Block, Component, Element, Page, Unit} from './model';

// «Revisar con IA» in the manual editor: a text model reads one page (its texts, each with a short id, and a picture
// of the page when the model sees images) and reports problems in the Russian and the English translations. Each
// finding names the text it is about and the exact words to change; the studio checks that against the page, and
// a correction is applied only by the author, only on blocks that are not approved, letter by letter.

type Text = Extract<Element, {kind: 'text'}>;

/** Where a text of the page lives: a line of the imported PDF, or a field of content made in the editor. */
export type ReviewTarget =
  | {kind: 'element'; blockId: string; elementId: string}
  | {kind: 'field'; blockId: string; path: string};

/** One text the model is shown, with the short id it answers with. */
export type ReviewText = {id: string; text: string; block: string; target: ReviewTarget; locked: boolean};

/** The strings of content made in the editor that the author wrote: each one can be corrected. */
function componentFields(c: Component): [string, string][] {
  const list = (name: string, values: string[] | undefined) => (values || []).map((v, i): [string, string] => [name + '.' + i, v]);
  if (c.type === 'exercise') return [['instruction', c.instruction], ...list('example', c.example), ...list('items', c.items), ...list('answers', c.answers)];
  if (c.type === 'text' || c.type === 'heading') return [['text', c.text]];
  if (c.type === 'image') return c.caption ? [['caption', c.caption]] : [];
  if (c.type === 'gallery') return c.cells.map((cell, i): [string, string] => ['cells.' + i + '.label', cell.label]);
  return c.panels.flatMap((p, i) => list('panels.' + i + '.bubbles', p.bubbles));
}

function setField(c: Component, path: string, value: string): Component {
  const next = structuredClone(c) as Record<string, unknown>;
  const keys = path.split('.');
  let at: Record<string, unknown> | unknown[] = next;
  for (const k of keys.slice(0, -1)) at = (at as Record<string, unknown>)[k] as Record<string, unknown>;
  (at as Record<string, unknown>)[keys[keys.length - 1]] = value;
  return next as Component;
}

function getField(c: Component, path: string) {
  return componentFields(c).find(([p]) => p === path)?.[1];
}

/** The page's texts in reading order (top to bottom, then left to right), each with its id and whether it is approved. */
export function reviewTexts(page: Page): ReviewText[] {
  const out: Omit<ReviewText, 'id'>[] = [];
  const order: {y: number; x: number; items: Omit<ReviewText, 'id'>[]}[] = [];
  for (const b of page.blocks) {
    const locked = !editable(page, b);
    if (b.component) {
      const fields = componentFields(b.component).filter(([, v]) => v.trim());
      if (!fields.length) continue;
      const top = b.at ? {y: b.at[1], x: b.at[0]} : {y: 0, x: 0};
      order.push({...top, items: fields.map(([path, text]) => ({text, block: b.label, locked, target: {kind: 'field', blockId: b.id, path}}))});
      continue;
    }
    for (const e of b.elements) {
      if (e.kind !== 'text' || !plainText(e).trim()) continue;
      order.push({y: e.y, x: e.x, items: [{text: plainText(e), block: b.label, locked, target: {kind: 'element', blockId: b.id, elementId: e.id}}]});
    }
  }
  order.sort((a, b) => b.y - a.y || a.x - b.x);
  for (const o of order) out.push(...o.items);
  return out.map((t, i) => ({...t, id: 't' + (i + 1)}));
}

/** The request for one page: the texts with their ids, and what they are. The picture travels as an attachment. */
export function reviewRequest(texts: ReviewText[], where: {unit: string; page: number; pages: number; picture: boolean}) {
  return [
    'UNIDAD: «' + where.unit + '» · página ' + where.page + ' de ' + where.pages + '.',
    where.picture ? 'Va adjunta una imagen de la página tal como se imprime.' : 'Sin imagen de la página: revisá solo los textos.',
    '',
    'TEXTOS DE LA PÁGINA (id · bloque · texto exacto):',
    ...texts.map(t => '[' + t.id + '] (' + t.block + ') ' + t.text),
  ].join('\n').slice(0, 19000);
}

export const reviewKinds = ['ortografía', 'gramática', 'tilde', 'letra latina', 'traducción', 'inglés', 'otro'] as const;
const findingSchema = z.object({
  id: z.string().max(20),
  lang: z.enum(['ru', 'en']).catch('ru'),
  kind: z.enum(reviewKinds).catch('otro'),
  quote: z.string().max(600),
  fix: z.string().max(600).default(''),
  problem: z.string().max(1200),
});
const answerSchema = z.object({summary: z.string().max(2000).default(''), findings: z.array(z.unknown()).max(60).default([])});

/** A finding checked against the page. `apply` is set only when the correction can really be made. */
export type ReviewFinding = z.infer<typeof findingSchema> & {
  key: string;
  /** The text it is about; absent for text inside a picture of the page. */
  text?: ReviewText;
  /** Why it is shown as a note only (approved block, text inside a picture, words not found…). */
  note?: string;
  apply?: {target: ReviewTarget; before: string; after: string; quote: string; fix: string};
};

/** Reads the model's answer: the JSON object, its findings checked one by one against the texts sent. */
export function parseReview(answer: string, texts: ReviewText[], pageId: string): {summary: string; findings: ReviewFinding[]} | null {
  const start = answer.indexOf('{');
  const end = answer.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let raw: z.infer<typeof answerSchema>;
  try { raw = answerSchema.parse(JSON.parse(answer.slice(start, end + 1))); } catch { return null; }
  const findings: ReviewFinding[] = [];
  raw.findings.forEach((item, i) => {
    const parsed = findingSchema.safeParse(item);
    if (!parsed.success || !parsed.data.quote.trim() || !parsed.data.problem.trim()) return;
    const f = parsed.data;
    const key = pageId + ':' + i;
    if (f.id === 'image') { findings.push({...f, key, note: 'Está dentro de una imagen: para corregirlo hay que cambiar la imagen.'}); return; }
    const text = texts.find(t => t.id === f.id);
    if (!text) return;
    const quote = f.quote.normalize('NFC');
    const source = text.text.normalize('NFC');
    const at = source.indexOf(quote);
    const once = at >= 0 && source.indexOf(quote, at + 1) < 0;
    const fix = f.fix.normalize('NFC');
    const note = text.locked ? 'El bloque está aprobado: no se cambia desde la revisión.'
      : at < 0 ? 'Las palabras citadas no están tal cual en el texto: revisalo a mano.'
        : !once ? 'Las palabras citadas aparecen más de una vez en esta línea: corregilo a mano.'
          : undefined;
    // Without a fix (or with the same words) it is advice: shown, with nothing to apply.
    const after = at >= 0 && once && fix && fix !== quote ? source.slice(0, at) + fix + source.slice(at + quote.length) : null;
    findings.push({...f, key, text, ...(note ? {note} : {}), ...(!note && after !== null ? {apply: {target: text.target, before: source, after, quote, fix}} : {})});
  });
  return {summary: raw.summary, findings};
}

export type ApplyResult = {unit: Unit} | {error: string};

/**
 * The text after the correction. Another correction may have changed the same line since the review: the quoted
 * words are then looked for again, and used only when they still appear exactly once.
 */
function corrected(now: string, apply: NonNullable<ReviewFinding['apply']>) {
  if (now === apply.before) return apply.after;
  const at = now.indexOf(apply.quote);
  if (at < 0 || now.indexOf(apply.quote, at + 1) >= 0) return null;
  return now.slice(0, at) + apply.fix + now.slice(at + apply.quote.length);
}

/**
 * Makes one correction: the line keeps the style of every letter that does not change; a field of editor content is
 * laid out again with the template. Refused when the block is approved, the text changed since the review, a letter
 * is missing from the font or the line no longer fits.
 */
export function applyFinding(fonts: EditorFonts, unit: Unit, pageId: string, apply: NonNullable<ReviewFinding['apply']>): ApplyResult {
  const page = unit.pages.find(p => p.id === pageId);
  const block: Block | undefined = page?.blocks.find(b => b.id === apply.target.blockId);
  if (!page || !block) return {error: 'El bloque ya no está en esta página.'};
  if (!editable(page, block)) return {error: 'El bloque está aprobado: desbloquealo para cambiarlo.'};
  const t = apply.target;
  if (t.kind === 'field') {
    const now = block.component ? getField(block.component, t.path)?.normalize('NFC') : undefined;
    const after = now === undefined ? null : corrected(now, apply);
    if (!block.component || after === null) return {error: 'El texto cambió desde la revisión: revisá de nuevo.'};
    return {unit: updateComponent(fonts, unit, pageId, block.id, setField(block.component, t.path, after))};
  }
  const el = block.elements.find((e): e is Text => e.id === t.elementId && e.kind === 'text');
  const after = el ? corrected(plainText(el).normalize('NFC'), apply) : null;
  if (!el || after === null) return {error: 'El texto cambió desde la revisión: revisá de nuevo.'};
  const next = editText(el, after);
  const missing = next.spans.flatMap(s => missingChars(fonts, s.font, s.text));
  if (missing.length) return {error: 'La fuente no tiene ' + [...new Set(missing)].map(c => '«' + c + '»').join(', ') + ': no se aplicó.'};
  if (el.maxWidth !== undefined && lineLayout(fonts, next).end - next.x > el.maxWidth + 0.5) return {error: 'El texto corregido ya no entra en su línea: corregilo a mano en «Selección».'};
  return {unit: mapElement(unit, pageId, el.id, () => next)};
}
