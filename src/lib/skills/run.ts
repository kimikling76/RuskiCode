'use client';
import {usePersonal, type PersonalMessage} from '@/store/personal-chat';
import {startGeneration} from '@/lib/cinema/client';
import {textAnswer} from '@/lib/ai/text-request';
import {fetchEditorFonts, type EditorFonts} from '@/lib/manual/fonts';
import {listUnits, saveUnit, saveVersion} from '@/lib/manual/store';
import {contentWidth, nextExercise} from '@/lib/manual/compose';
import {blankUnitFrom, layOut} from '@/lib/manual/units';
import {imageFromFile} from '@/lib/manual/browser';
import {getAsset} from '@/lib/manual/store';
import {imageModels} from '@/lib/ai/models';
import type {Unit} from '@/lib/manual/model';
import type {CinemaJob} from '@/store/cinema';
import type {ChatAttachment} from '@/lib/personal-chat/attachments';
import {
  autoChecks, draftComponents, keptPictures, nearestAspect, newWords, parseDraft, parseReview, pdfContext, pictureSlots, picturePrompt, refValue,
  reviewRequest, skillSummary, unitPagesText, unitVocabulary,
  type ImageRun, type MediaRef, type PdfRun, type PdfTarget, type PictureSlot, type ReviewRun, type SkillRun, type VideoRun,
} from './chat';

// What the Chat's skills do. Each change to a skill's record goes through `updateRun`, which also keeps the
// message's text summary up to date for the conversation's history.

const running = new Set<string>();
/** True while this browser is writing or reviewing for that message (after a reload it is not). */
export const isRunning = (messageId: string) => running.has(messageId);

function findMessage(chatId: string, messageId: string) {
  return usePersonal.getState().data.chats.find(c => c.id === chatId)?.messages.find(m => m.id === messageId);
}

/** Fields of one kind of run (or of any, by default). */
export type RunPatch<T> = T extends unknown ? Partial<Omit<T, 'skill'>> : never;

export function updateRun<T extends SkillRun = SkillRun>(chatId: string, messageId: string, patch: NoInfer<RunPatch<T>>) {
  const chat = usePersonal.getState().data.chats.find(c => c.id === chatId);
  if (!chat) return false;
  return usePersonal.getState().patch(chatId, {messages: chat.messages.map(m => {
    if (m.id !== messageId || !m.skill) return m;
    const skill = {...m.skill, ...patch} as SkillRun;
    return {...m, skill, content: skillSummary(skill)};
  })});
}

/** A new skill card (and the user line that asks for it) at the end of a chat: «Animar», «Generar otra vez»… */
export function addSkillCard(chatId: string, run: SkillRun, userText: string, attachments?: ChatAttachment[]) {
  const chat = usePersonal.getState().data.chats.find(c => c.id === chatId);
  if (!chat) return null;
  const now = new Date().toISOString();
  const user: PersonalMessage = {id: crypto.randomUUID(), role: 'user', content: userText, command: run.skill, createdAt: now, ...(attachments?.length ? {attachments} : {})};
  const card: PersonalMessage = {id: crypto.randomUUID(), role: 'assistant', content: skillSummary(run), skill: run, status: 'done', createdAt: now};
  return usePersonal.getState().patch(chatId, {messages: [...chat.messages, user, card]}) ? card.id : null;
}

// ---------- Images and videos ----------

export async function sendMedia(chatId: string, messageId: string, run: ImageRun | VideoRun) {
  const batchId = crypto.randomUUID();
  updateRun(chatId, messageId, {batchId, sentAt: Date.now()});
  if (run.skill === 'image-generation') {
    await startGeneration({mode: 'create', model: run.model, prompt: run.prompt, aspect: run.aspect, resolution: run.resolution, references: run.refs.map(refValue), count: run.count, batchId});
  } else {
    await startGeneration({mode: 'video', model: run.model, prompt: run.prompt, aspect: run.aspect, resolution: run.resolution, duration: run.duration || undefined, references: run.start ? [refValue(run.start)] : [], count: 1, batchId});
  }
}

// ---------- /pdf-generator ----------

/** The units whose design can be used: those with an exercise header in their template. */
export async function designUnits() {
  const units = await listUnits();
  return {units, models: units.filter(u => u.template.exerciseHeader)};
}

export const unitNumberOf = (u: Unit) => Number(u.number) || 0;

/**
 * The draft laid out with the template of its destination, in memory: a new unit (number after the highest one)
 * or new pages after the last one. The studio numbers exercises and audio codes.
 */
export function buildPdf(fonts: EditorFonts, units: Unit[], run: PdfRun) {
  const target = run.target;
  const unit = units.find(u => u.id === target?.unitId);
  if (!run.draft || !target || !unit) return null;
  const draft = {...run.draft, imageStyle: run.imageStyle ?? run.draft.imageStyle};
  const page = unit.pages[unit.pages.length - 1];
  const area = {width: contentWidth(unit.template, page), height: page.height - unit.template.margins.top - unit.template.margins.bottom};
  if (target.mode === 'new') {
    const number = String(Math.max(0, ...units.map(unitNumberOf)) + 1);
    const base = blankUnitFrom(fonts, unit, {id: crypto.randomUUID(), title: run.draft.title, number, now: Date.now()});
    const components = draftComponents(draft, {number: 1, unit: number, audio: 1}, area, run.pictures);
    return {...layOut(fonts, base, components, false), isNew: true, from: unit};
  }
  const next = nextExercise(unit);
  const [unitNo, audio] = next.audio.split('.');
  const components = draftComponents(draft, {number: Number(next.number), unit: unitNo, audio: Number(audio)}, area, run.pictures);
  return {...layOut(fonts, unit, components, true), isNew: false, from: unit};
}

function previousRun(chatId: string, messageId: string) {
  const messages = usePersonal.getState().data.chats.find(c => c.id === chatId)?.messages || [];
  const before = messages.slice(0, messages.findIndex(m => m.id === messageId));
  for (let i = before.length - 1; i >= 0; i--) {
    const s = before[i].skill;
    if (s?.skill === 'pdf-generator' && s.draft) return s;
  }
  return undefined;
}

export async function writePdf(chatId: string, messageId: string, model: string) {
  if (running.has(messageId)) return;
  running.add(messageId);
  updateRun<PdfRun>(chatId, messageId, {state: 'writing', error: undefined});
  try {
    const run = findMessage(chatId, messageId)?.skill as PdfRun | undefined;
    if (!run) return;
    const {units, models} = await designUnits();
    if (!models.length) { updateRun<PdfRun>(chatId, messageId, {state: 'error', error: 'NO_MANUAL'}); return; }
    const target: PdfTarget = run.target && models.some(u => u.id === run.target!.unitId) ? run.target : {mode: 'new', unitId: models[0].id};
    const unit = models.find(u => u.id === target.unitId)!;
    const previous = previousRun(chatId, messageId);
    const answer = await textAnswer('pdf-generator', pdfContext(unit, target, run.request, unitVocabulary(units), previous?.draft), {model, webSearch: run.webSearch});
    const draft = parseDraft(answer.text);
    if (!draft) { updateRun<PdfRun>(chatId, messageId, {state: 'error', error: 'INVALID_DRAFT', model: answer.model, credits: answer.credits}); return; }
    // Pictures already made for the same prompt (in this card or the draft it changes) are kept: they are not paid twice.
    const fresh = findMessage(chatId, messageId)?.skill as PdfRun | undefined;
    const pictures = keptPictures(draft, fresh?.pictures, previous?.pictures);
    updateRun<PdfRun>(chatId, messageId, {
      state: 'ready', draft, target, model: answer.model, credits: answer.credits, sources: answer.sources, pictures, imageStyle: undefined,
      ...(previous?.pictureModel && !fresh?.pictureModel ? {pictureModel: previous.pictureModel, pictureResolution: previous.pictureResolution} : {}),
    });
  } catch (e) {
    updateRun<PdfRun>(chatId, messageId, {state: 'error', error: e instanceof Error ? e.message : 'PROVIDER_UNAVAILABLE'});
  } finally {
    running.delete(messageId);
  }
}

/** Saves the draft with the latest version of its destination. A unit that receives pages gets a version first. */
export async function savePdf(chatId: string, messageId: string) {
  const run = findMessage(chatId, messageId)?.skill as PdfRun | undefined;
  if (!run?.draft || !run.target) throw Error('NOTHING_TO_SAVE');
  const fonts = await fetchEditorFonts();
  const {units} = await designUnits();
  const built = buildPdf(fonts, units, run);
  if (!built) throw Error('TARGET_MISSING');
  if (!built.isNew) await saveVersion(built.from, 'Antes de /pdf-generator: «' + run.draft.title + '»');
  const unit = await saveUnit(built.unit);
  await saveVersion(unit, (built.isNew ? 'Creada con /pdf-generator' : '/pdf-generator: «' + run.draft.title + '»'));
  const saved = {unitId: unit.id, title: unit.title, page: built.pages[0] + 1};
  updateRun<PdfRun>(chatId, messageId, {state: 'saved', saved});
  return saved;
}

export const draftNewWords = (run: PdfRun, units: Unit[]) => run.draft ? newWords(run.draft, unitVocabulary(units)) : [];

// ---------- /pdf-generator: pictures made with an image model ----------

/** A short fingerprint of a slot's prompt, in the job's tag: a job made for an older prompt is not used. */
function promptMark(prompt: string) {
  let h = 5381;
  for (let i = 0; i < prompt.length; i++) h = (h * 33 + prompt.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
export const pictureTag = (slot: Pick<PictureSlot, 'key' | 'prompt'>) => slot.key + '#' + promptMark(slot.prompt);

/** Pictures that still need an image for their current prompt. */
export function missingPictures(run: PdfRun) {
  return run.draft ? pictureSlots(run.draft).filter(s => !(run.pictures?.[s.key]?.image && run.pictures[s.key].prompt === s.prompt)) : [];
}

const sending = new Map<string, Set<string>>();
/** Slots of a card waiting in this browser to be sent to Kie (they go a little apart). */
export const waitingPictures = (messageId: string) => sending.get(messageId) || new Set<string>();

/**
 * Asks Kie for pictures of the draft, one task per picture, with the prompt the text model wrote, the common style
 * and the author's reference images. Nothing is searched on the web. `slots` defaults to the missing ones.
 */
export async function generatePictures(chatId: string, messageId: string, opts: {model: string; resolution: string; refs: MediaRef[]; slots?: string[]}) {
  const run = findMessage(chatId, messageId)?.skill as PdfRun | undefined;
  const model = imageModels.find(m => m.id === opts.model);
  if (!run?.draft || !model) return;
  const all = pictureSlots(run.draft);
  const slots = opts.slots ? all.filter(s => opts.slots!.includes(s.key)) : missingPictures(run);
  if (!slots.length) return;
  const batchId = run.pictureBatch || crypto.randomUUID();
  updateRun<PdfRun>(chatId, messageId, {pictureBatch: batchId, pictureModel: model.id, pictureResolution: opts.resolution});
  const queue = sending.get(messageId) || new Set<string>();
  sending.set(messageId, queue);
  for (const s of slots) queue.add(s.key);
  const style = run.imageStyle ?? run.draft.imageStyle;
  const references = model.options.maxReferences ? opts.refs.slice(0, model.options.maxReferences).map(refValue) : [];
  for (const [i, slot] of slots.entries()) {
    // The studio accepts up to 8 new Kie tasks every 10 seconds.
    if (i) await new Promise(r => setTimeout(r, 1400));
    queue.delete(slot.key);
    await startGeneration({
      mode: 'create', model: model.id, prompt: picturePrompt(slot, style), aspect: nearestAspect(slot.aspect, model.options.aspectRatios),
      resolution: model.options.resolutions.includes(opts.resolution) ? opts.resolution : model.options.resolutions[0] || '',
      references, count: 1, batchId, tag: pictureTag(slot),
    });
  }
  if (!queue.size) sending.delete(messageId);
}

/** The newest job of each slot for its current prompt. */
export function pictureJobs(run: PdfRun, jobs: CinemaJob[]) {
  const out = new Map<string, CinemaJob>();
  if (!run.draft || !run.pictureBatch) return out;
  const tags = new Map(pictureSlots(run.draft).map(s => [pictureTag(s), s.key]));
  for (const job of jobs) {
    const key = job.batchId === run.pictureBatch && job.tag ? tags.get(job.tag) : undefined;
    if (key && (!out.has(key) || out.get(key)!.createdAt < job.createdAt)) out.set(key, job);
  }
  return out;
}

const importing = new Set<string>();
/**
 * Brings a finished picture into the draft: the studio's saved copy (see cinema/keep.ts) becomes an image of the
 * manual, stored in this browser and in the account, so the preview and the other computers have it.
 */
export async function importPicture(chatId: string, messageId: string, slot: PictureSlot, job: CinemaJob) {
  const saved = job.saved?.[0];
  if (!saved || importing.has(job.id)) return;
  importing.add(job.id);
  try {
    const r = await fetch('/api/sync/assets?hash=' + saved.hash);
    if (!r.ok) throw Error();
    const image = await imageFromFile(new File([await r.blob()], 'imagen', {type: saved.mime}));
    if (image.asset !== saved.hash) {
      const bytes = await getAsset(image.asset);
      if (!bytes) throw Error();
      const up = await fetch('/api/sync/assets', {method: 'POST', headers: {'Content-Type': image.format === 'png' ? 'image/png' : 'image/jpeg'}, body: bytes as BodyInit});
      if (!up.ok) throw Error();
    }
    const run = findMessage(chatId, messageId)?.skill as PdfRun | undefined;
    if (!run?.draft || !pictureSlots(run.draft).some(s => s.key === slot.key && s.prompt === slot.prompt)) return;
    updateRun<PdfRun>(chatId, messageId, {pictures: {...run.pictures, [slot.key]: {prompt: slot.prompt, image, job: job.id}}});
  } catch {
    // Tried again the next time the card is shown.
    importing.delete(job.id);
  }
}

/** The draft with another prompt for one picture (its image is made again when asked). */
export function withPicturePrompt(run: PdfRun, key: string, prompt: string): PdfRun['draft'] {
  if (!run.draft) return run.draft;
  const [block, cell] = key.split('.').map(Number);
  return {...run.draft, blocks: run.draft.blocks.map((b, i) => {
    if (i !== block) return b;
    if (b.type === 'image') return {...b, prompt};
    if (b.type === 'gallery') return {...b, items: b.items.map((it, k) => k === cell ? {...it, prompt} : it)};
    if (b.type === 'comic') return {...b, panels: b.panels.map((p, k) => k === cell ? {...p, prompt} : p)};
    return b;
  })};
}

// ---------- /revisar-ruso ----------

export async function reviewText(chatId: string, messageId: string, model: string, attachments: ChatAttachment[]) {
  if (running.has(messageId)) return;
  running.add(messageId);
  updateRun<ReviewRun>(chatId, messageId, {state: 'reviewing', error: undefined});
  try {
    const run = findMessage(chatId, messageId)?.skill as ReviewRun | undefined;
    if (!run) return;
    let pages: {page: number | null; text: string}[];
    let note: string;
    if (run.source.kind === 'unit') {
      const unit = (await listUnits()).find(u => u.id === (run.source as {unitId: string}).unitId);
      if (!unit) { updateRun<ReviewRun>(chatId, messageId, {state: 'error', error: 'UNIT_MISSING'}); return; }
      pages = unitPagesText(unit, run.source.from, run.source.to);
      note = 'páginas ' + run.source.from + ' a ' + run.source.to + ' de la unidad «' + unit.title + '» del manual';
    } else {
      pages = [{page: null, text: run.source.text}];
      note = 'texto que pegó o adjuntó el autor';
    }
    const docs = run.source.kind === 'text' ? attachments.filter(a => a.kind === 'document') : [];
    // The automatic checks also read the attached documents (their text is stored in the studio).
    const docTexts = await Promise.all(docs.map(d => fetch('/api/sync/assets?hash=' + d.hash).then(r => r.ok ? r.text() : '').catch(() => '')));
    const auto = autoChecks([...pages, ...docTexts.map(text => ({page: null, text}))]);
    updateRun<ReviewRun>(chatId, messageId, {auto});
    const answer = await textAnswer('russian-review', reviewRequest(pages.filter(p => p.text.trim()), note), {model, attachments: docs, webSearch: run.webSearch});
    const result = parseReview(answer.text);
    if (!result) { updateRun<ReviewRun>(chatId, messageId, {state: 'error', error: 'INVALID_REVIEW', model: answer.model, credits: answer.credits}); return; }
    updateRun<ReviewRun>(chatId, messageId, {state: 'ready', result, model: answer.model, credits: answer.credits, sources: answer.sources});
  } catch (e) {
    updateRun<ReviewRun>(chatId, messageId, {state: 'error', error: e instanceof Error ? e.message : 'PROVIDER_UNAVAILABLE'});
  } finally {
    running.delete(messageId);
  }
}
