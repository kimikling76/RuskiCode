import {z} from 'zod';
import {aspectValue, pictureAspects, type Component, type ImageData, type PictureAspect, type Unit} from '@/lib/manual/model';
import {plainText} from '@/lib/manual/elements';
import type {Source} from '@/lib/ai/types';

// Skills of the Chat: called with «/» in the composer. Each one does something concrete with the studio's own
// tools, with a preview and a confirmation before anything is charged or changed. Without a skill the Chat stays
// neutral. What a skill leaves in the conversation is a record (`SkillRun`) on the assistant message, synced with
// the chat; its `content` is a short text, so later messages to the model know what happened.

export const chatSkills = [
  {
    id: 'image-generation', command: '/image-generation', name: 'Generar imágenes',
    description: 'Elegís el modelo y sus opciones reales; confirmás antes de que Kie cobre. Las imágenes quedan guardadas en el estudio.',
    placeholder: 'Describí la imagen. Podés adjuntar imágenes de referencia.',
  },
  {
    id: 'video-generation', command: '/video-generation', name: 'Generar videos',
    description: 'Desde un texto o desde una imagen (adjunta o generada en el chat), con los modelos de video de Kie.',
    placeholder: 'Describí qué pasa en el video. Adjuntá una imagen si querés que el video parta de ella.',
  },
  {
    id: 'pdf-generator', command: '/pdf-generator', name: 'Crear páginas del manual',
    description: 'La IA escribe ejercicios y textos; el estudio los arma con el diseño de tu unidad. Ves las páginas antes de guardar.',
    placeholder: 'Qué querés crear: por ejemplo, ejercicios de «Это мой брат» para la unidad 2.',
  },
  {
    id: 'revisar-ruso', command: '/revisar-ruso', name: 'Revisar el ruso',
    description: 'Ortografía, gramática, tildes de acento, letras latinas mezcladas y palabras fuera de nivel. No cambia nada solo.',
    placeholder: 'Pegá el texto a revisar o adjuntalo. Sin texto, elegís una unidad del manual.',
  },
] as const;

export type SkillId = (typeof chatSkills)[number]['id'];
export const skillById = (id: string) => chatSkills.find(s => s.id === id);

/** Skills whose command or name starts with what follows «/». */
export function matchSkills(query: string) {
  const q = query.toLowerCase().replace(/^\//, '');
  return chatSkills.filter(s => s.id.startsWith(q) || s.name.toLowerCase().includes(q) || s.id.split('-').some(w => w.startsWith(q)));
}

/** «/image-generation un gato» → the skill and the rest of the text. */
export function splitCommand(text: string): {skill?: SkillId; rest: string} {
  const m = /^\/([a-z-]+)(?:\s+|$)([\s\S]*)$/.exec(text.trimStart());
  const skill = m ? chatSkills.find(s => s.id === m[1])?.id : undefined;
  return skill ? {skill, rest: m![2].trim()} : {rest: text};
}

// ---------- What a skill leaves in the chat ----------

/** An image given to a skill: a file stored in the studio (an attachment) or a Kie result link. */
export type MediaRef = {kind: 'asset'; hash: string; mime: string; name: string} | {kind: 'url'; url: string; hash?: string};
export const refValue = (r: MediaRef) => r.kind === 'asset' ? 'asset:' + r.hash : r.url;
export const refSrc = (r: MediaRef) => r.kind === 'asset' ? '/api/sync/assets?hash=' + r.hash : r.url;

export type ImageRun = {skill: 'image-generation'; prompt: string; model: string; aspect: string; resolution: string; count: number; refs: MediaRef[]; batchId?: string; sentAt?: number};
export type VideoRun = {skill: 'video-generation'; prompt: string; model: string; aspect: string; resolution: string; duration: string; start?: MediaRef; batchId?: string; sentAt?: number};
export type PdfTarget = {mode: 'new' | 'append'; unitId: string};
export type PdfRun = {
  skill: 'pdf-generator'; request: string; state: 'writing' | 'ready' | 'error' | 'saved';
  draft?: PdfDraft; target?: PdfTarget; error?: string; model?: string; credits?: number;
  /** After saving: the unit and its first new page. */
  saved?: {unitId: string; title: string; page: number};
  /** Asked with web search (the chat had it on and the model documents it), and the pages the API reported. */
  webSearch?: boolean; sources?: Source[];
  /**
   * The draft's pictures, generated with a Kie image model from their prompts (never searched on the web), by slot
   * (see pictureSlots). `prompt` is the one the image was made from: a slot whose prompt changed is pending again.
   */
  pictures?: Record<string, PictureState>;
  /** Image model and options for the pictures, the batch of their jobs in Cinema, and the style for all of them. */
  pictureModel?: string; pictureResolution?: string; pictureBatch?: string; imageStyle?: string;
};
export type PictureState = {prompt: string; image?: ImageData; job?: string};
export type ReviewRun = {
  skill: 'revisar-ruso'; state: 'choose' | 'reviewing' | 'ready' | 'error';
  source: {kind: 'text'; text: string; documents?: number} | {kind: 'unit'; unitId: string; title: string; from: number; to: number};
  result?: Review; auto?: AutoIssue[]; error?: string; model?: string; credits?: number;
  webSearch?: boolean; sources?: Source[];
};
export type SkillRun = ImageRun | VideoRun | PdfRun | ReviewRun;

// ---------- /pdf-generator: the draft the model writes ----------

const line = z.string().trim().min(1).max(300);
const picturePromptSchema = z.string().trim().min(1).max(1200);
const aspectSchema = z.enum(pictureAspects).catch('4:3');
/** Most pictures one draft may ask for: each one is a paid task in Kie. */
export const MAX_PICTURES = 24;
export const draftBlockSchema = z.discriminatedUnion('type', [
  z.object({type: z.literal('heading'), text: z.string().trim().min(1).max(200)}),
  z.object({type: z.literal('text'), text: z.string().trim().min(1).max(4000)}),
  z.object({
    type: z.literal('exercise'),
    instruction: z.string().trim().min(1).max(300),
    example: z.array(line).max(3).default([]),
    items: z.array(line).min(1).max(16),
    answers: z.array(z.string().trim().max(300)).max(16).default([]),
    columns: z.union([z.literal(1), z.literal(2)]).default(2),
  }),
  z.object({
    type: z.literal('image'), prompt: picturePromptSchema, caption: z.string().trim().max(200).optional(),
    size: z.enum(['small', 'medium', 'large', 'full']).catch('medium'), aspect: aspectSchema,
  }),
  z.object({
    type: z.literal('gallery'), columns: z.number().int().min(2).max(6).catch(3), aspect: z.enum(pictureAspects).catch('1:1'), numbered: z.boolean().catch(false),
    items: z.array(z.object({prompt: picturePromptSchema, label: z.string().trim().max(80).catch('')})).min(1).max(18),
  }),
  z.object({
    type: z.literal('comic'), columns: z.union([z.literal(2), z.literal(3)]).catch(2), aspect: aspectSchema,
    panels: z.array(z.object({
      prompt: picturePromptSchema,
      bubbles: z.array(z.union([z.string(), z.object({text: z.string()})]).transform(b => (typeof b === 'string' ? b : b.text).trim().slice(0, 160))).max(3).catch([]),
    })).min(1).max(9),
  }),
]);
export const draftSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(400).optional(),
  imageStyle: z.string().trim().max(400).optional(),
  blocks: z.array(draftBlockSchema).min(1).max(30),
}).refine(d => pictureSlots(d).length <= MAX_PICTURES);
export type PdfDraft = z.infer<typeof draftSchema>;

/** The JSON object in a model's answer (with or without ```json fences); null when there is none. */
export function jsonAnswer(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{'), end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(body.slice(start, end + 1)); } catch { return null; }
}

export function parseDraft(text: string): PdfDraft | null {
  const r = draftSchema.safeParse(jsonAnswer(text));
  if (!r.success) return null;
  // Items written with their own numbers lose them: the studio numbers them.
  return {...r.data, blocks: r.data.blocks.map(b => b.type === 'exercise' ? {...b, items: b.items.map(i => i.replace(/^\s*\d+[.)]\s+/, ''))} : b)};
}

// ---------- /pdf-generator: pictures ----------

type DraftBlock = z.infer<typeof draftBlockSchema>;
export type PictureSlot = {key: string; prompt: string; aspect: PictureAspect; kind: 'image' | 'gallery' | 'comic'; label: string};

/** Every picture of a draft, in reading order: `3` is the image block 3, `5.2` the third picture of block 5. */
export function pictureSlots(draft: {blocks: DraftBlock[]}): PictureSlot[] {
  const out: PictureSlot[] = [];
  draft.blocks.forEach((b, i) => {
    if (b.type === 'image') out.push({key: String(i), prompt: b.prompt, aspect: b.aspect, kind: 'image', label: b.caption?.replace(/\*\*|==/g, '') || 'Imagen'});
    if (b.type === 'gallery') b.items.forEach((it, k) => out.push({key: i + '.' + k, prompt: it.prompt, aspect: b.aspect, kind: 'gallery', label: it.label.replace(/\*\*|==/g, '') || (b.numbered ? String(k + 1) : 'Galería ' + (k + 1))}));
    if (b.type === 'comic') b.panels.forEach((p, k) => out.push({key: i + '.' + k, prompt: p.prompt, aspect: b.aspect, kind: 'comic', label: 'Viñeta ' + (k + 1)}));
  });
  return out;
}

/** What the image model gets for one slot: its prompt, the common style, and no text inside the picture. */
export function picturePrompt(slot: PictureSlot, style?: string) {
  return [
    slot.prompt.trim().replace(/\.?$/, '.'),
    style?.trim() ? 'Style: ' + style.trim().replace(/\.?$/, '.') : '',
    slot.kind === 'comic' ? 'Comic panel: keep the upper part of the frame calm and uncluttered, because speech bubbles are added on top later.' : '',
    'Do not draw any text, letters, numbers, captions, speech bubbles, logos or watermarks.',
  ].filter(Boolean).join(' ');
}

/** The image ratio closest to `aspect` among those a model offers ('' when it offers none). */
export function nearestAspect(aspect: PictureAspect, offered: readonly string[]) {
  const target = aspectValue(aspect);
  let best = '', diff = Infinity;
  for (const o of offered) {
    const m = /^(\d+):(\d+)$/.exec(o);
    if (!m) continue;
    const d = Math.abs(Math.log(Number(m[1]) / Number(m[2]) / target));
    if (d < diff) { diff = d; best = o; }
  }
  return best;
}

/** Pictures still valid for a draft: the same prompt in the same slot. Images made for another prompt are dropped. */
export function keptPictures(draft: PdfDraft, pictures: PdfRun['pictures'], previous?: PdfRun['pictures']) {
  const out: Record<string, PictureState> = {};
  const byPrompt = new Map<string, PictureState>();
  for (const p of Object.values(previous || {})) if (p.image) byPrompt.set(p.prompt, p);
  for (const slot of pictureSlots(draft)) {
    const own = pictures?.[slot.key];
    const found = own?.prompt === slot.prompt ? own : byPrompt.get(slot.prompt);
    if (found) out[slot.key] = found;
  }
  return out;
}

const sizes = {small: 0.38, medium: 0.55, large: 0.78, full: 1};

/**
 * The draft as the template's components, numbered after `start` (exercise number and audio code).
 * `area` is the page's writing area, for the size of pictures; `pictures` are the images made so far.
 */
export function draftComponents(draft: PdfDraft, start: {number: number; unit: string; audio: number}, area: {width: number; height: number} = {width: 515, height: 740}, pictures: PdfRun['pictures'] = {}): Component[] {
  let n = start.number, a = start.audio;
  const picture = (key: string, prompt: string) => {
    const p = pictures[key];
    return p?.image && p.prompt === prompt ? {image: p.image} : {};
  };
  return draft.blocks.map((b, i): Component => {
    if (b.type === 'image') {
      let w = area.width * sizes[b.size], h = w / aspectValue(b.aspect);
      if (h > area.height * 0.62) { h = area.height * 0.62; w = h * aspectValue(b.aspect); }
      return {type: 'image', width: Math.round(w * 100) / 100, height: Math.round(h * 100) / 100, rounded: true, prompt: b.prompt, ...(b.caption ? {caption: b.caption} : {}), ...picture(String(i), b.prompt)};
    }
    if (b.type === 'gallery') return {type: 'gallery', columns: b.columns, aspect: b.aspect, numbered: b.numbered, cells: b.items.map((it, k) => ({label: it.label, prompt: it.prompt, ...picture(i + '.' + k, it.prompt)}))};
    if (b.type === 'comic') return {type: 'comic', columns: b.columns, aspect: b.aspect, panels: b.panels.map((p, k) => ({prompt: p.prompt, bubbles: p.bubbles.filter(Boolean), ...picture(i + '.' + k, p.prompt)}))};
    if (b.type !== 'exercise') return b.type === 'heading' ? {type: 'heading', text: b.text} : {type: 'text', text: b.text};
    const c: Component = {
      type: 'exercise', number: String(n++), audio: start.unit + '.' + String(a++).padStart(2, '0'),
      instruction: b.instruction, example: b.example, items: b.items, columns: b.columns,
      ...(b.answers.length ? {answers: b.answers} : {}),
    };
    return c;
  });
}

// ---------- Vocabulary ----------

const STRESS = /́/g;
/** Russian words of a text, lowercase and without stress marks (ё stays ё). */
export function wordsOf(text: string) {
  return (text.replace(STRESS, '').toLowerCase().match(/[а-яё]+(?:-[а-яё]+)*/g) || []).filter(w => w.length > 1);
}

/** Every Russian word that appears in the manual's units. */
export function unitVocabulary(units: Unit[]) {
  const words = new Set<string>();
  for (const u of units) for (const p of u.pages) for (const b of p.blocks) {
    for (const el of b.elements) if (el.kind === 'text') for (const w of wordsOf(plainText(el))) words.add(w);
    if (b.component?.type === 'exercise') for (const w of wordsOf([b.component.instruction, ...b.component.example, ...b.component.items].join(' '))) words.add(w);
    if (b.component?.type === 'text' || b.component?.type === 'heading') for (const w of wordsOf(b.component.text)) words.add(w);
    if (b.component?.type === 'gallery') for (const w of wordsOf(b.component.cells.map(x => x.label).join(' '))) words.add(w);
    if (b.component?.type === 'comic') for (const w of wordsOf(b.component.panels.flatMap(x => x.bubbles).join(' '))) words.add(w);
  }
  return words;
}

const draftText = (d: PdfDraft) => d.blocks.map(b =>
  b.type === 'exercise' ? [b.instruction, ...b.example, ...b.items].join(' ')
    : b.type === 'image' ? b.caption || '' : b.type === 'gallery' ? b.items.map(x => x.label).join(' ')
      : b.type === 'comic' ? b.panels.flatMap(p => p.bubbles).join(' ') : b.text).join(' ');

/** Words of the draft that do not appear anywhere in the manual (a new form of a known word is listed too). */
export function newWords(draft: PdfDraft, known: Set<string>) {
  return [...new Set(wordsOf(draftText(draft)))].filter(w => !known.has(w)).sort((a, b) => a.localeCompare(b, 'ru'));
}

/** What the model gets to write in the manual's style: the destination, its numbering and its words. */
export function pdfContext(unit: Unit, target: PdfTarget, request: string, known: Set<string>, previous?: PdfDraft) {
  const instructions: string[] = [], examples: string[] = [];
  for (const p of unit.pages) for (const b of p.blocks) for (const el of b.elements) {
    if (el.role === 'ex-instruction' && instructions.length < 12) instructions.push(plainText(el).trim());
    if ((el.role === 'ex-example') && examples.length < 8) examples.push(plainText(el).trim());
  }
  const level = /[AА]1/.test(unit.pages.flatMap(p => p.blocks.flatMap(b => b.elements.map(plainText))).join(' ')) ? 'A1' : 'no indicado (usá A1 si el pedido no dice otro)';
  const vocab = [...known].slice(0, 700).join(', ');
  return [
    'UNIT CONTEXT',
    'Manual: «' + unit.title + '». Nivel: ' + level + '.',
    'Destino: ' + (target.mode === 'new' ? 'una unidad nueva con el diseño de esta.' : 'páginas nuevas al final de esta unidad.'),
    instructions.length ? 'Consignas que ya usa el manual (copiá su estilo, no las repitas):\n- ' + instructions.join('\n- ') : '',
    examples.length ? 'Líneas de ejemplo del manual:\n- ' + examples.join('\n- ') : '',
    vocab ? 'Vocabulario que ya aparece en el manual (preferí estas palabras):\n' + vocab : '',
    previous ? 'BORRADOR ANTERIOR (el autor pide cambios sobre él):\n' + JSON.stringify(previous) : '',
    'PEDIDO DEL AUTOR:\n' + request,
  ].filter(Boolean).join('\n\n');
}

// ---------- /revisar-ruso ----------

export const reviewKinds = ['ortografía', 'gramática', 'tilde', 'letra latina', 'nivel', 'consigna', 'otro'] as const;
export const reviewSchema = z.object({
  summary: z.string().trim().max(1000),
  issues: z.array(z.object({
    page: z.number().int().min(1).max(999).nullable().optional(),
    quote: z.string().trim().max(400),
    problem: z.string().trim().min(1).max(600),
    suggestion: z.string().trim().max(600).default(''),
    kind: z.string().max(20).transform(k => (reviewKinds as readonly string[]).includes(k) ? k as (typeof reviewKinds)[number] : 'otro'),
  })).max(30),
});
export type Review = z.infer<typeof reviewSchema>;
export const parseReview = (text: string): Review | null => { const r = reviewSchema.safeParse(jsonAnswer(text)); return r.success ? r.data : null; };

/** Problems found without a model, for free: Latin letters inside Russian words, and «A1» written two ways. */
export type AutoIssue = {page: number | null; quote: string; problem: string; suggestion: string};
const latinToCyrillic: Record<string, string> = {A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', a: 'а', c: 'с', e: 'е', o: 'о', p: 'р', x: 'х', y: 'у'};
const cyrillicToLatin = Object.fromEntries(Object.entries(latinToCyrillic).map(([l, c]) => [c, l]));

export function autoChecks(pages: {page: number | null; text: string}[]): AutoIssue[] {
  const out: AutoIssue[] = [];
  const seen = new Set<string>();
  const forms = new Map<string, Set<string>>();
  for (const {page, text} of pages) {
    for (const token of text.match(/[\p{L}\d́]+/gu) || []) {
      const hasCyr = /[а-яё]/i.test(token), hasLat = /[a-z]/i.test(token);
      if (hasCyr && hasLat) {
        const fixed = [...token].map(ch => /[a-z]/i.test(ch) ? latinToCyrillic[ch] ?? ch : ch).join('');
        const key = 'mix:' + token;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({page, quote: token, problem: 'Mezcla letras latinas con letras rusas: se ve igual, pero la búsqueda, el corrector y la voz la leen mal.', suggestion: [...fixed].some(ch => /[a-z]/i.test(ch)) ? 'Reescribila con letras rusas.' : fixed});
        }
      }
      // Short codes like «A1» written once with a Latin and once with a Cyrillic letter.
      if (/^[\p{L}]\d{1,2}$/u.test(token)) {
        const norm = [...token].map(ch => cyrillicToLatin[ch] ?? ch).join('');
        const set = forms.get(norm) ?? new Set<string>();
        set.add(token);
        forms.set(norm, set);
      }
    }
  }
  for (const [norm, set] of forms) {
    if (set.size < 2) continue;
    const [latin, cyrillic] = [[...set].find(t => /[a-z]/i.test(t)), [...set].find(t => /[а-яё]/i.test(t))];
    if (latin && cyrillic) {
      const pagesWith = (form: string) => [...new Set(pages.filter(p => new RegExp('(^|[^\\p{L}])' + form + '(?!\\d)', 'u').test(p.text)).map(p => p.page).filter((n): n is number => n !== null))];
      out.push({page: null, quote: latin + ' / ' + cyrillic, problem: '«' + norm + '» está escrito de dos formas: con letra latina (páginas ' + (pagesWith(latin).join(', ') || '—') + ') y con letra rusa (páginas ' + (pagesWith(cyrillic).join(', ') || '—') + ').', suggestion: 'Elegí una sola forma para todo el libro.'});
    }
  }
  return out;
}

/** The text of some pages of a unit, page by page, as the model and the checks read it. */
export function unitPagesText(unit: Unit, from: number, to: number) {
  const out: {page: number; text: string}[] = [];
  for (let i = Math.max(1, from); i <= Math.min(unit.pages.length, to); i++) {
    const p = unit.pages[i - 1];
    const lines = p.blocks.flatMap(b => b.elements.filter(e => e.kind === 'text').map(e => plainText(e).trim())).filter(Boolean);
    out.push({page: i, text: lines.join('\n')});
  }
  return out;
}

export const reviewRequest = (pages: {page: number | null; text: string}[], note: string) =>
  'TEXT CONTEXT: ' + (note || 'texto pegado por el autor') + '\n\n' + pages.map(p => (p.page ? '=== Página ' + p.page + ' ===\n' : '') + '<text>\n' + p.text + '\n</text>').join('\n\n');

// ---------- A line for the conversation's history ----------

export function skillSummary(run: SkillRun): string {
  switch (run.skill) {
    case 'image-generation': return '[/image-generation · ' + (run.batchId ? 'pedido a Kie' : 'borrador') + ' · modelo ' + run.model + ' · prompt: «' + run.prompt.slice(0, 400) + '»]';
    case 'video-generation': return '[/video-generation · ' + (run.batchId ? 'pedido a Kie' : 'borrador') + ' · modelo ' + run.model + ' · prompt: «' + run.prompt.slice(0, 400) + '»]';
    case 'pdf-generator': return run.draft ? '[/pdf-generator · borrador «' + run.draft.title + '» con ' + run.draft.blocks.length + ' bloques' + (pictureSlots(run.draft).length ? ' y ' + pictureSlots(run.draft).length + ' imágenes' : '') + (run.saved ? ', guardado en PDF Studio' : '') + ']' : '[/pdf-generator · ' + (run.state === 'error' ? 'no se pudo escribir' : 'escribiendo') + ']';
    case 'revisar-ruso': return run.result ? '[/revisar-ruso · ' + run.result.issues.length + ' observaciones: ' + run.result.summary.slice(0, 300) + ']' : '[/revisar-ruso]';
  }
}
