'use client';
import {useSyncExternalStore} from 'react';
import {usePersonal, type PersonalMessage} from '@/store/personal-chat';
import {startGeneration} from '@/lib/cinema/client';
import {textAnswer} from '@/lib/ai/text-request';
import {bookForProject, bookForUnit, usedOf} from '@/lib/kb/context';
import {bookLook} from '@/lib/kb/characters';
import {getEntry, getProject, listEntries} from '@/lib/kb/store';
import {uploadEntryFiles} from '@/lib/kb/files';
import {castOfBook} from '@/lib/kb/picture';
import {fetchEditorFonts, type EditorFonts} from '@/lib/manual/fonts';
import {getUnit, listUnits, saveUnit, saveVersion} from '@/lib/manual/store';
import {applyFinding, parseReview as parsePageReview, reviewRequest as pageReviewRequest, reviewTexts, type ReviewFinding} from '@/lib/manual/review';
import {pagePicture} from '@/lib/manual/page-picture';
import {contentWidth, nextExercise} from '@/lib/manual/compose';
import {blankUnitFrom, layOut} from '@/lib/manual/units';
import {imageFromFile} from '@/lib/manual/browser';
import {getAsset} from '@/lib/manual/store';
import {imageModels, textModels} from '@/lib/ai/models';
import type {Unit} from '@/lib/manual/model';
import {useCinema, type CinemaJob} from '@/store/cinema';
import type {ChatAttachment} from '@/lib/personal-chat/attachments';
import {
  autoChecks, draftComponents, madeFor, slotBubbles, keptCast, keptPictures, nearestAspect, newWords, parseDraft, parseReview, pdfContext, pictureSlots, picturePrompt, portraitPrompt,
  refValue, reviewRequest, skillSummary, slotCharacters, unitPagesText, unitVocabulary,
  type Character, type ImageRun, type MediaRef, type PdfRun, type PdfTarget, type PictureSlot, type PictureState, type ReviewRun, type SkillRun, type VideoRun,
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
    await startGeneration({mode: 'video', model: run.model, prompt: run.prompt, aspect: run.aspect, resolution: run.resolution, duration: run.duration || undefined, references: run.start ? [refValue(run.start)] : [], ...(run.videos?.length ? {videos: run.videos, ...(run.clips ? {clips: run.videos.map(v => run.clips![v]).filter(Boolean)} : {})} : {}), count: 1, batchId});
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

/** The book the person turned on for this chat with «Contexto del libro», if any. */
const chatProjectOf = (chatId: string) => usePersonal.getState().data.chats.find(c => c.id === chatId)?.book?.project;

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
    if (!models.length) { updateRun<PdfRun>(chatId, messageId, {state: 'error', error: units.length ? 'NO_DESIGN' : 'NO_MANUAL'}); return; }
    // «Contexto del libro» turned on in this chat brings that book; otherwise a unit linked to a book brings its own.
    const chatBook = chatProjectOf(chatId);
    const project = chatBook ? await getProject(chatBook).catch(() => undefined) : undefined;
    const ownUnit = project ? models.find(u => u.id in project.units) : undefined;
    const target: PdfTarget = run.target && models.some(u => u.id === run.target!.unitId) ? run.target : {mode: 'new', unitId: (ownUnit || models[0]).id};
    const unit = models.find(u => u.id === target.unitId)!;
    const previous = previousRun(chatId, messageId);
    const task = {query: run.request, cast: true, ...(project?.units[unit.id] ? {unit: project.units[unit.id]} : {})};
    const book = await (chatBook ? bookForProject(chatBook, task) : bookForUnit(unit.id, task)).catch(() => null);
    if (book) updateRun<PdfRun>(chatId, messageId, {book: usedOf(book)});
    const answer = await textAnswer('pdf-generator', pdfContext(unit, target, run.request, unitVocabulary(units), previous?.draft), {model, webSearch: run.webSearch, book: book?.payload});
    const draft = parseDraft(answer.text);
    if (!draft) { updateRun<PdfRun>(chatId, messageId, {state: 'error', error: 'INVALID_DRAFT', model: answer.model, credits: answer.credits}); return; }
    const bookCast = book ? castOfBook(draft.characters.map(c => c.name), await listEntries(book.project.id)) : undefined;
    // A character of the book keeps its confirmed look and its age in every picture, whatever the text model wrote.
    if (bookCast) draft.characters = draft.characters.map(c => bookCast[c.name] ? {...c, look: bookLook(c.look, bookCast[c.name])} : c);
    // Pictures already made for the same prompt (in this card or the draft it changes) are kept: they are not paid twice.
    const fresh = findMessage(chatId, messageId)?.skill as PdfRun | undefined;
    const pictures = keptPictures(draft, fresh?.pictures, previous?.pictures);
    const cast = keptCast(draft, fresh?.cast, previous?.cast);
    updateRun<PdfRun>(chatId, messageId, {
      state: 'ready', draft, target, model: answer.model, credits: answer.credits, sources: answer.sources, pictures, cast, imageStyle: undefined, setting: undefined,
      ...(book ? {bookCast, bookProject: {id: book.project.id, name: book.project.name}} : {bookCast: undefined, bookProject: undefined}),
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

/** A short fingerprint of a prompt, in the job's tag: a job made for an older prompt is not used. */
function promptMark(prompt: string) {
  let h = 5381;
  for (let i = 0; i < prompt.length; i++) h = (h * 33 + prompt.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
export const pictureTag = (slot: Pick<PictureSlot, 'key' | 'prompt' | 'bubbles'>) => slot.key + '#' + promptMark(slot.prompt + slotBubbles(slot));
export const portraitTag = (c: Character) => 'cast:' + c.name + '#' + promptMark(c.look);

const hasImage = (p: PictureState | undefined, prompt: string) => Boolean(p?.image && p.prompt === prompt);
const failed = (j?: CinemaJob) => j?.state === 'error' || j?.state === 'fail';

/** Pictures that still need an image for their current prompt. */
export function missingPictures(run: PdfRun) {
  return run.draft ? pictureSlots(run.draft).filter(s => !madeFor(run.pictures?.[s.key], s)) : [];
}

/** The draft's characters with the place, style and look the author may have changed in the card. */
export function pictureContext(run: PdfRun) {
  const draft = run.draft;
  return {style: run.imageStyle ?? draft?.imageStyle, setting: run.setting ?? draft?.setting, cast: draft?.characters || []};
}

const sending = new Map<string, Set<string>>();
/** Slots (and portraits, as `cast:<name>`) of a card waiting in this browser to be sent to Kie. */
export const waitingPictures = (messageId: string) => sending.get(messageId) || new Set<string>();
// The cards follow these waiting lists as they change.
let sendingVersion = 0;
const sendingListeners = new Set<() => void>();
const changedSending = () => { sendingVersion++; for (const l of sendingListeners) l(); };
export function useWaitingPictures(messageId: string) {
  useSyncExternalStore(cb => { sendingListeners.add(cb); return () => { sendingListeners.delete(cb); }; }, () => sendingVersion, () => 0);
  return waitingPictures(messageId);
}

/** The newest job of each slot for its current prompt, and of each character's portrait for its current look. */
export function pictureJobs(run: PdfRun, jobs: CinemaJob[]) {
  const out = new Map<string, CinemaJob>();
  if (!run.draft || !run.pictureBatch) return out;
  const tags = new Map([...pictureSlots(run.draft).map(s => [pictureTag(s), s.key] as const), ...run.draft.characters.map(c => [portraitTag(c), 'cast:' + c.name] as const)]);
  for (const job of jobs) {
    const key = job.batchId === run.pictureBatch && job.tag ? tags.get(job.tag) : undefined;
    if (key && (!out.has(key) || out.get(key)!.createdAt < job.createdAt)) out.set(key, job);
  }
  return out;
}

const pause = (ms: number) => new Promise(r => setTimeout(r, ms));
const currentRun = (chatId: string, messageId: string) => findMessage(chatId, messageId)?.skill as PdfRun | undefined;

/**
 * Asks Kie for pictures of the draft, one task per picture, with the prompt the text model wrote, each character's
 * look, the shared place and style, and the author's reference images. Nothing is searched on the web.
 * With a model that takes reference images, a portrait of each character is made first and goes with every picture
 * where that character appears, so the same person looks the same.
 * `slots` defaults to the missing ones that are not already on their way or done in Kie. A second call while one is
 * sending does nothing: a double click never pays twice.
 */
export async function generatePictures(chatId: string, messageId: string, opts: {model: string; resolution: string; refs: MediaRef[]; slots?: string[]}) {
  if (sending.has(messageId)) return;
  const run = currentRun(chatId, messageId);
  const model = imageModels.find(m => m.id === opts.model);
  if (!run?.draft || !model) return;
  const jobs = pictureJobs(run, useCinema.getState().data.jobs);
  const slots = opts.slots
    ? pictureSlots(run.draft).filter(s => opts.slots!.includes(s.key))
    : missingPictures(run).filter(s => !jobs.get(s.key) || failed(jobs.get(s.key)));
  if (!slots.length) return;
  const queue = new Set(slots.map(s => s.key));
  sending.set(messageId, queue);
  changedSending();
  try {
    const batchId = run.pictureBatch || crypto.randomUUID();
    updateRun<PdfRun>(chatId, messageId, {pictureBatch: batchId, pictureModel: model.id, pictureResolution: opts.resolution});
    const {style, setting, cast} = pictureContext(run);
    const max = model.options.maxReferences;
    const resolution = model.options.resolutions.includes(opts.resolution) ? opts.resolution : model.options.resolutions[0] || '';
    const own = max ? opts.refs.map(refValue) : [];
    let sent = 0;
    const send = async (prompt: string, aspect: string, references: string[], tag: string, people: string[] = []) => {
      // The studio accepts up to 8 new Kie tasks every 10 seconds.
      if (sent++) await pause(1400);
      const members = people.flatMap(n => run.bookCast?.[n] ? [run.bookCast[n]] : []);
      const book = run.bookProject && members.length ? {project: run.bookProject.id, name: run.bookProject.name, characters: members.map(m => ({id: m.id, name: m.title, refs: m.hash && references.slice(0, max).includes('asset:' + m.hash) ? [{hash: m.hash, name: m.file || m.title}] : []}))} : undefined;
      await startGeneration({mode: 'create', model: model.id, prompt, aspect, resolution, references: references.slice(0, max), count: 1, batchId, tag, ...(book ? {book} : {})});
      changedSending();
    };

    // 1. Portraits of the characters these pictures show, when the model takes references and there is none yet.
    // A character of the book uses its approved picture from the library; without one, no new face is invented for it.
    const portraits = new Map<string, string>();
    const library = run.bookCast || {};
    for (const [name, m] of Object.entries(library)) if (m.hash && max) portraits.set(name, m.hash);
    const needed = max ? cast.filter(c => !library[c.name] && slots.some(s => slotCharacters(s, cast).includes(c))) : [];
    for (const c of needed) if (hasImage(run.cast?.[c.name], c.look)) portraits.set(c.name, run.cast![c.name].image!.asset);
    const missing = needed.filter(c => !portraits.has(c.name));
    for (const c of missing) {
      queue.add('cast:' + c.name);
      const job = pictureJobs({...run, pictureBatch: batchId}, useCinema.getState().data.jobs).get('cast:' + c.name);
      if (!job || failed(job)) await send(portraitPrompt(c, style, setting), nearestAspect('3:4', model.options.aspectRatios), own, portraitTag(c));
    }
    // Wait for them (Kie takes from seconds to minutes); a portrait that fails is left out.
    const deadline = Date.now() + 10 * 60_000;
    const doneAt = new Map<string, number>();
    while (missing.some(c => !portraits.has(c.name)) && Date.now() < deadline) {
      await pause(2000);
      const fresh = currentRun(chatId, messageId);
      if (!fresh?.draft) return;
      const now = pictureJobs(fresh, useCinema.getState().data.jobs);
      let open = false;
      for (const c of missing) {
        if (portraits.has(c.name)) continue;
        if (hasImage(fresh.cast?.[c.name], c.look)) { portraits.set(c.name, fresh.cast![c.name].image!.asset); queue.delete('cast:' + c.name); continue; }
        const job = now.get('cast:' + c.name);
        if (job?.state === 'success') {
          await importResult(chatId, messageId, {kind: 'cast', key: c.name, prompt: c.look}, job);
          // Finished in Kie but its file cannot be brought here: the pictures go without that portrait.
          if (!doneAt.has(c.name)) doneAt.set(c.name, Date.now());
          if (Date.now() - doneAt.get(c.name)! > 90_000) { queue.delete('cast:' + c.name); continue; }
        }
        if (!job || !failed(job)) open = true; else queue.delete('cast:' + c.name);
      }
      if (!open) break;
    }
    for (const c of missing) queue.delete('cast:' + c.name);

    // The library pictures must be in the account for the server to send them (this computer may not have synced yet).
    if (run.bookProject) for (const m of Object.values(library)) if (m.hash) { const e = await getEntry(run.bookProject.id, m.id).catch(() => undefined); if (e) await uploadEntryFiles(e).catch(() => {}); }

    // 2. The pictures, each with the portraits of its characters.
    for (const slot of slots) {
      const people = slotCharacters(slot, cast);
      // The portraits go first: with a model that takes few references they are what keeps the characters the same.
      const refs = [...people.flatMap(c => portraits.has(c.name) ? ['asset:' + portraits.get(c.name)] : []), ...own];
      await send(picturePrompt(slot, style, {cast, setting, withPortraits: people.some(c => portraits.has(c.name))}), nearestAspect(slot.aspect, model.options.aspectRatios), refs, pictureTag(slot), people.map(c => c.name));
      queue.delete(slot.key);
    }
  } finally {
    sending.delete(messageId);
    changedSending();
  }
}

const importing = new Set<string>();
/**
 * Brings a finished picture (or portrait) into the draft as an image of the manual, stored in this browser and in
 * the account, so the preview and the other computers have it. It comes from the studio's saved copy (see
 * cinema/keep.ts) or, while that copy is not there, straight from Kie's link through the studio.
 */
export async function importResult(chatId: string, messageId: string, target: {kind: 'pictures' | 'cast'; key: string; prompt: string; bubbles?: string}, job: CinemaJob) {
  const saved = job.saved?.[0];
  const source = saved ? '/api/sync/assets?hash=' + saved.hash : job.urls[0] ? '/api/cinema/download?url=' + encodeURIComponent(job.urls[0]) + '&name=' + encodeURIComponent(job.taskId || job.id) : '';
  // Each source is tried once per visit: a broken link is not asked for again on every change.
  const attempt = job.id + (saved ? ':saved' : ':kie');
  if (!source || importing.has(attempt)) return;
  importing.add(attempt);
  try {
    const r = await fetch(source);
    if (!r.ok) throw Error();
    const blob = await r.blob();
    const image = await imageFromFile(new File([blob], 'imagen', {type: blob.type || saved?.mime || 'image/png'}));
    if (image.asset !== saved?.hash) {
      const bytes = await getAsset(image.asset);
      if (!bytes) throw Error();
      const up = await fetch('/api/sync/assets', {method: 'POST', headers: {'Content-Type': image.format === 'png' ? 'image/png' : 'image/jpeg'}, body: bytes as BodyInit});
      if (!up.ok) throw Error();
    }
    const run = currentRun(chatId, messageId);
    if (!run?.draft) return;
    const entry = {prompt: target.prompt, image, job: job.id, ...(target.kind === 'pictures' ? {bubbles: target.bubbles ?? ''} : {})};
    if (target.kind === 'cast') {
      if (!run.draft.characters.some(c => c.name === target.key && c.look === target.prompt)) return;
      updateRun<PdfRun>(chatId, messageId, {cast: {...run.cast, [target.key]: entry}});
    } else {
      if (!pictureSlots(run.draft).some(s => s.key === target.key && s.prompt === target.prompt && slotBubbles(s) === (target.bubbles ?? ''))) return;
      updateRun<PdfRun>(chatId, messageId, {pictures: {...run.pictures, [target.key]: entry}});
    }
  } catch {
    // Kept in Kie and in Cinema; another source (the saved copy) is tried when it appears.
  }
}

export const importPicture = (chatId: string, messageId: string, slot: PictureSlot, job: CinemaJob) =>
  importResult(chatId, messageId, {kind: 'pictures', key: slot.key, prompt: slot.prompt, bubbles: slotBubbles(slot)}, job);

/** The draft with another look for one character (their portrait is made again when asked). */
export function withCharacterLook(run: PdfRun, name: string, look: string): PdfRun['draft'] {
  return run.draft && {...run.draft, characters: run.draft.characters.map(c => c.name === name ? {...c, look} : c)};
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
    if (run.source.kind === 'unit') { await reviewUnitPages(chatId, messageId, run, model); return; }
    const pages: {page: number | null; text: string}[] = [{page: null, text: run.source.text}];
    const note = 'texto que pegó o adjuntó el autor';
    // Documents go as their text; pictures go too when the model sees images (a page of a PDF as a screenshot).
    const docs = attachments.filter(a => a.kind === 'document' || (a.kind === 'image' && seesImages(model)));
    // The automatic checks also read the attached documents (their text is stored in the studio).
    const docTexts = await Promise.all(docs.filter(d => d.kind === 'document').map(d => fetch('/api/sync/assets?hash=' + d.hash).then(r => r.ok ? r.text() : '').catch(() => '')));
    const auto = autoChecks([...pages, ...docTexts.map(text => ({page: null, text}))]);
    updateRun<ReviewRun>(chatId, messageId, {auto});
    const reviewTask = {query: 'Revisá el ruso, los acentos, la tipografía y las traducciones al inglés. ' + note, context: pages.map(p => p.text).join('\n').slice(0, 20000)};
    const chatBook = chatProjectOf(chatId);
    const book = await (chatBook ? bookForProject(chatBook, reviewTask) : Promise.resolve(null)).catch(() => null);
    if (book) updateRun<ReviewRun>(chatId, messageId, {book: usedOf(book)});
    const answer = await textAnswer('russian-review', reviewRequest(pages.filter(p => p.text.trim()), note), {model, attachments: docs, webSearch: run.webSearch, book: book?.payload});
    const result = parseReview(answer.text);
    if (!result) { updateRun<ReviewRun>(chatId, messageId, {state: 'error', error: 'INVALID_REVIEW', model: answer.model, credits: answer.credits}); return; }
    updateRun<ReviewRun>(chatId, messageId, {state: 'ready', result, model: answer.model, credits: answer.credits, sources: answer.sources});
  } catch (e) {
    updateRun<ReviewRun>(chatId, messageId, {state: 'error', error: e instanceof Error ? e.message : 'PROVIDER_UNAVAILABLE'});
  } finally {
    running.delete(messageId);
  }
}

// ---------- /revisar-ruso on a unit of the manual: page by page, as in the editor ----------

/** Whether the text model sees images, as Kie documents it («auto» is the fast Gemini model). */
export function seesImages(model: string) {
  const m = textModels.find(x => x.id === (model === 'auto' ? 'kie-flash' : model));
  return Boolean(m?.inputs?.includes('image'));
}

/**
 * Each page of the range: its lines with ids and, for a model that sees images, a picture of the page as it
 * prints. The answer is checked against the page (manual/review.ts); results appear page by page in the card.
 */
async function reviewUnitPages(chatId: string, messageId: string, run: ReviewRun, model: string) {
  if (run.source.kind !== 'unit') return;
  const unit = (await listUnits()).find(u => u.id === (run.source as {unitId: string}).unitId);
  if (!unit) { updateRun<ReviewRun>(chatId, messageId, {state: 'error', error: 'UNIT_MISSING'}); return; }
  const {from, to} = run.source;
  const sees = seesImages(model);
  const fonts = sees ? await fetchEditorFonts() : null;
  updateRun<ReviewRun>(chatId, messageId, {pages: [], auto: autoChecks(unitPagesText(unit, from, to)), result: undefined});
  const done: NonNullable<ReviewRun['pages']> = [];
  let credits = 0, name: string | undefined;
  for (let n = from; n <= Math.min(to, unit.pages.length); n++) {
    updateRun<ReviewRun>(chatId, messageId, {at: n});
    const page = unit.pages[n - 1];
    const texts = reviewTexts(page);
    const attachments = fonts ? [await pagePicture(unit, fonts, n - 1)] : [];
    if (!texts.length && !attachments.length) { done.push({page: n, pageId: page.id, summary: 'La página no tiene texto.', findings: [], picture: false}); continue; }
    const answer = await textAnswer('manual-review', pageReviewRequest(texts, {unit: unit.title, page: n, pages: unit.pages.length, picture: attachments.length > 0}), {model, attachments});
    const parsed = parsePageReview(answer.text, texts, page.id);
    if (!parsed) { updateRun<ReviewRun>(chatId, messageId, {state: 'error', error: 'INVALID_REVIEW', pages: [...done], model: answer.model, credits}); return; }
    credits += answer.credits || 0; name = answer.model || name;
    done.push({page: n, pageId: page.id, summary: parsed.summary, findings: parsed.findings, picture: attachments.length > 0, ...(answer.credits !== undefined ? {credits: answer.credits} : {})});
    updateRun<ReviewRun>(chatId, messageId, {pages: [...done], model: name, credits});
  }
  updateRun<ReviewRun>(chatId, messageId, {state: 'ready', at: undefined});
}

const versioned = new Set<string>();
/**
 * Applies corrections of a chat review to the unit, letter by letter, as the editor does. A version is kept before
 * the first one of each review. Returns how many were applied and the first refusal.
 */
export async function applyReviewFindings(chatId: string, messageId: string, list: ReviewFinding[]) {
  const run = findMessage(chatId, messageId)?.skill as ReviewRun | undefined;
  if (!run || run.source.kind !== 'unit') return {applied: 0, error: 'La revisión ya no está.'};
  const unit = await getUnit(run.source.unitId);
  if (!unit) return {applied: 0, error: 'La unidad ya no está en PDF Studio.'};
  const fonts = await fetchEditorFonts();
  let next = unit, applied = 0, error = '';
  const marked: Record<string, 'applied'> = {};
  for (const f of list) {
    const page = run.pages?.find(p => p.findings.some(x => x.key === f.key));
    if (!f.apply || !page) continue;
    const out = applyFinding(fonts, next, page.pageId, f.apply);
    if ('error' in out) { error ||= out.error; continue; }
    next = out.unit; applied++; marked[f.key] = 'applied';
  }
  if (applied) {
    if (!versioned.has(messageId)) { await saveVersion(unit, 'Antes de la revisión con IA (Chat)'); versioned.add(messageId); }
    await saveUnit({...next, updatedAt: Date.now()});
    updateRun<ReviewRun>(chatId, messageId, {done: {...run.done, ...marked}});
  }
  return {applied, error};
}
