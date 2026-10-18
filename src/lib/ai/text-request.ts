'use client';
import {usePersonal} from '@/store/personal-chat';
import {sseData} from '@/lib/ai/sse';
import type {Assistant} from '@/store/assistants';

export type TextPurpose = 'storyboard' | 'prompt' | 'book-review' | 'book-exercises' | 'book-rewrite' | 'pdf-generator' | 'russian-review';

const usageLabels: Record<TextPurpose, {studio: 'chat' | 'cinema' | 'pdf'; label: string}> = {
  storyboard: {studio: 'cinema', label: 'Plan de planos'},
  prompt: {studio: 'cinema', label: 'Ayuda con el prompt'},
  'book-review': {studio: 'pdf', label: 'Revisión pedagógica'},
  'book-exercises': {studio: 'pdf', label: 'Ejercicios propuestos'},
  'book-rewrite': {studio: 'pdf', label: 'Mejora de un bloque'},
  'pdf-generator': {studio: 'pdf', label: '/pdf-generator'},
  'russian-review': {studio: 'chat', label: '/revisar-ruso'},
};

export type TextAnswer = {text: string; model?: string; credits?: number};

/** One text answer from the configured Kie chat model (personal-chat endpoint with a studio purpose). */
/** `assistant` is optional and only sent when the person chose one in that panel. */
export async function textRequest(purpose: TextPurpose, content: string, signal?: AbortSignal, assistant?: Assistant | null) {
  return (await textAnswer(purpose, content, {signal, assistant})).text;
}

/** The same, with the model that answered and the credits Kie reported. `model` is a catalog id or 'auto'. */
export async function textAnswer(purpose: TextPurpose, content: string, opts: {signal?: AbortSignal; assistant?: Assistant | null; model?: string; attachments?: unknown[]} = {}): Promise<TextAnswer> {
  const {signal, assistant} = opts;
  const model = opts.model && opts.model !== 'auto' ? opts.model : assistant && assistant.model !== 'auto' ? assistant.model : 'auto';
  let name: string | undefined;
  const requestId = crypto.randomUUID();
  let text = '', done = false, accepted = false, credits: number | undefined;
  try {
    const r = await fetch('/api/personal-chat', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({requestId, purpose, model, messages: [{role: 'user', content, ...(opts.attachments?.length ? {attachments: opts.attachments} : {})}], ...(assistant ? {assistant: {name: assistant.name, instructions: assistant.instructions, mediaCatalog: assistant.mediaCatalog}} : {})}),
      signal,
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw Error(typeof body.error === 'string' ? body.error : 'PROVIDER_UNAVAILABLE');
    }
    accepted = true;
    if (!r.body) throw Error('PROVIDER_UNAVAILABLE');
    for await (const frame of sseData(r.body)) {
      const e = JSON.parse(frame);
      if (e.type === 'delta') text += e.text;
      if (e.type === 'model') name = e.name;
      if (e.type === 'usage' && typeof e.usage?.credits === 'number') credits = e.usage.credits;
      if (e.type === 'error') throw Error(e.error);
      if (e.type === 'done') done = true;
    }
    if (!done) throw Error('STREAM_INTERRUPTED');
    return {text: text.trim(), model: name, credits};
  } finally {
    // Keep the sidebar usage line honest: text requests to Kie are recorded too.
    if (accepted) usePersonal.getState().charge(requestId, credits, usageLabels[purpose]);
  }
}
