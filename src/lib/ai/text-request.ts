'use client';
import {usePersonal} from '@/store/personal-chat';
import {sseData} from '@/lib/ai/sse';
import type {Assistant} from '@/store/assistants';
import type {Source} from './types';
import type {BookPayload} from '@/lib/kb/prompt';
import {textModels} from './models';

const textModelName = (id: string) => textModels.find(m => m.id === id)?.name;

export type TextPurpose = 'storyboard' | 'prompt' | 'video-prompt' | 'book-review' | 'book-exercises' | 'book-rewrite' | 'pdf-generator' | 'russian-review' | 'book-assist' | 'book-exercise' | 'manual-review' | 'manual-exercise';

const usageLabels: Record<TextPurpose, {studio: 'chat' | 'cinema' | 'pdf'; label: string}> = {
  storyboard: {studio: 'cinema', label: 'Plan de planos'},
  prompt: {studio: 'cinema', label: 'Ayuda con el prompt'},
  'video-prompt': {studio: 'cinema', label: 'Ayuda con el prompt de video'},
  'book-review': {studio: 'pdf', label: 'Revisión pedagógica'},
  'book-exercises': {studio: 'pdf', label: 'Ejercicios propuestos'},
  'book-rewrite': {studio: 'pdf', label: 'Mejora de un bloque'},
  'pdf-generator': {studio: 'pdf', label: '/pdf-generator'},
  'russian-review': {studio: 'chat', label: '/revisar-ruso'},
  'book-assist': {studio: 'pdf', label: 'Asistente del libro'},
  'book-exercise': {studio: 'pdf', label: 'Cambio de un ejercicio'},
  'manual-review': {studio: 'pdf', label: 'Revisión con IA del manual'},
  'manual-exercise': {studio: 'pdf', label: 'Ejercicio nuevo con IA'},
};

/** `cut`: the answer stopped before its end (only with `partial`); `text` is what arrived. */
export type TextAnswer = {text: string; model?: string; credits?: number; sources?: Source[]; cut?: boolean};

/** One text answer from the configured Kie chat model (personal-chat endpoint with a studio purpose). */
/** `assistant` is optional and only sent when the person chose one in that panel. */
export async function textRequest(purpose: TextPurpose, content: string, signal?: AbortSignal, assistant?: Assistant | null) {
  return (await textAnswer(purpose, content, {signal, assistant})).text;
}

/** The same, with the model that answered and the credits Kie reported. `model` is a catalog id or 'auto'. */
/** `webSearch` only for models that document a search tool (the server answers SEARCH_NOT_SUPPORTED otherwise). */
/** `book`: data of the author's book project, sent apart from the request (only inside that project). */
export async function textAnswer(purpose: TextPurpose, content: string, opts: {signal?: AbortSignal; assistant?: Assistant | null; model?: string; attachments?: unknown[]; webSearch?: boolean; book?: BookPayload; partial?: boolean} = {}): Promise<TextAnswer> {
  const {signal, assistant} = opts;
  const model = opts.model && opts.model !== 'auto' ? opts.model : assistant && assistant.model !== 'auto' ? assistant.model : 'auto';
  let name: string | undefined, served: string | undefined;
  const requestId = crypto.randomUUID();
  let text = '', done = false, accepted = false, credits: number | undefined;
  const sources: Source[] = [];
  try {
    const r = await fetch('/api/personal-chat', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({requestId, purpose, model, messages: [{role: 'user', content, ...(opts.attachments?.length ? {attachments: opts.attachments} : {})}], ...(assistant ? {assistant: {name: assistant.name, instructions: assistant.instructions, mediaCatalog: assistant.mediaCatalog}} : {}), ...(opts.webSearch ? {webSearch: true} : {}), ...(opts.book ? {book: opts.book} : {})}),
      signal,
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw Error(typeof body.error === 'string' ? body.error : 'PROVIDER_UNAVAILABLE');
    }
    accepted = true;
    if (!r.body) throw Error('PROVIDER_UNAVAILABLE');
    let lost = false;
    try { for await (const frame of sseData(r.body)) {
      const e = JSON.parse(frame);
      if (e.type === 'delta') text += e.text;
      if (e.type === 'model') { name = e.name; served = e.id; }
      if (e.type === 'sources' && Array.isArray(e.sources)) for (const x of e.sources) if (!sources.some(y => y.url === x.url) && sources.length < 20) sources.push(x);
      if (e.type === 'usage' && typeof e.usage?.credits === 'number') credits = e.usage.credits;
      // A cut answer (time limit, lost connection) keeps what arrived when the caller can use part of it: Kie charges it.
      if (e.type === 'error') { if (e.error === 'STREAM_INTERRUPTED' && opts.partial && text.trim()) break; throw Error(e.error); }
      if (e.type === 'done') done = true;
    } } catch (e) {
      // The connection dropped while reading: the same as a cut answer, not an unknown failure.
      if (e instanceof Error && e.name !== 'AbortError' && !/^[A-Z_]+$/.test(e.message)) lost = true; else throw e;
    }
    if (lost && !(opts.partial && text.trim())) throw Error('STREAM_INTERRUPTED');
    if (!done && opts.partial && text.trim()) return {text: text.trim(), model: name, credits, cut: true, ...(sources.length ? {sources} : {})};
    if (!done) throw Error('STREAM_INTERRUPTED');
    return {text: text.trim(), model: name, credits, ...(sources.length ? {sources} : {})};
  } finally {
    // Keep the sidebar usage line honest: text requests to Kie are recorded too.
    if (accepted) usePersonal.getState().charge(requestId, credits, {...usageLabels[purpose], ...(served ? {model: served} : {}), asked: model});
  }
}

export const usageLabelOf = (purpose: TextPurpose) => usageLabels[purpose].label;

/** A stable request id made from a name, so every tab asks for the same job (and Kie is asked only once). */
export async function jobId(name: string) {
  const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(name)))].map(b => b.toString(16).padStart(2, '0')).join('');
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-5' + h.slice(13, 16) + '-' + ((parseInt(h[16], 16) & 3) | 8).toString(16) + h.slice(17, 20) + '-' + h.slice(20, 32);
}

const pause = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * The same as textAnswer, but the request runs on the server (/api/text-jobs): closing the tab or losing the connection
 * does not lose the answer, and asking again for the same `id` (a reload, another tab) reads the same job instead of
 * paying for a new one. `onProgress` gets the length of the text that has arrived. Always partial: a cut answer comes
 * back with `cut`. Without the job store on the server, it falls back to a normal request.
 */
export async function textJob(purpose: TextPurpose, content: string, opts: {id: string; model?: string; assistant?: Assistant | null; webSearch?: boolean; book?: BookPayload; signal?: AbortSignal; onProgress?: (chars: number) => void}): Promise<TextAnswer> {
  const {assistant} = opts;
  const model = opts.model && opts.model !== 'auto' ? opts.model : assistant && assistant.model !== 'auto' ? assistant.model : 'auto';
  const read = async () => {
    const r = await fetch('/api/text-jobs?id=' + opts.id, {cache: 'no-store', signal: opts.signal});
    if (r.status === 404) return null;
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw Error(typeof body.error === 'string' ? body.error : 'PROVIDER_UNAVAILABLE');
    return body as {status: 'running' | 'done' | 'cut' | 'error'; text: string; model: string; credits: number | null; sources: Source[] | null; error: string | null};
  };
  let job = await read().catch(e => { if (e instanceof Error && e.message === 'TEXT_JOBS_UNAVAILABLE') return 'fallback' as const; throw e; });
  if (job === 'fallback') return textAnswer(purpose, content, {...opts, partial: true});
  if (!job) {
    const r = await fetch('/api/text-jobs', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, signal: opts.signal,
      body: JSON.stringify({requestId: opts.id, purpose, model, messages: [{role: 'user', content}], ...(assistant ? {assistant: {name: assistant.name, instructions: assistant.instructions, mediaCatalog: assistant.mediaCatalog}} : {}), ...(opts.webSearch ? {webSearch: true} : {}), ...(opts.book ? {book: opts.book} : {})}),
    });
    const body = await r.json().catch(() => ({}));
    if (r.status === 503 && body.error === 'TEXT_JOBS_UNAVAILABLE') return textAnswer(purpose, content, {...opts, partial: true});
    if (!r.ok) throw Error(typeof body.error === 'string' ? body.error : 'PROVIDER_UNAVAILABLE');
  }
  // The server writes for up to 5 minutes; a little more is allowed for the last save.
  const deadline = Date.now() + 7 * 60_000;
  type Job = NonNullable<Awaited<ReturnType<typeof read>>>;
  let done: Job | null = null;
  while (!done) {
    // A failed poll (the connection dropped for a moment) is just tried again: the job goes on in the server.
    const now = await read().catch(e => { if (opts.signal?.aborted) throw e; return null; });
    if (now && now.status !== 'running') { done = now; break; }
    if (now) opts.onProgress?.(now.text.length);
    if (Date.now() > deadline) throw Error('STREAM_INTERRUPTED');
    await pause(2000);
  }
  usePersonal.getState().charge(opts.id, done.credits ?? undefined, {...usageLabels[purpose], model: done.model, asked: model});
  if (done.status === 'error' && !done.text.trim()) throw Error(done.error || 'PROVIDER_UNAVAILABLE');
  const name = textModelName(done.model);
  return {text: done.text.trim(), ...(name ? {model: name} : {}), ...(done.credits !== null ? {credits: done.credits} : {}), ...(done.sources?.length ? {sources: done.sources} : {}), ...(done.status !== 'done' ? {cut: true} : {})};
}
