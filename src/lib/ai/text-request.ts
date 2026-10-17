'use client';
import {usePersonal} from '@/store/personal-chat';
import {sseData} from '@/lib/ai/sse';

export type TextPurpose = 'storyboard' | 'prompt' | 'book-review' | 'book-exercises' | 'book-rewrite';

const usageLabels: Record<TextPurpose, {studio: 'cinema' | 'pdf'; label: string}> = {
  storyboard: {studio: 'cinema', label: 'Plan de planos'},
  prompt: {studio: 'cinema', label: 'Ayuda con el prompt'},
  'book-review': {studio: 'pdf', label: 'Revisión pedagógica'},
  'book-exercises': {studio: 'pdf', label: 'Ejercicios propuestos'},
  'book-rewrite': {studio: 'pdf', label: 'Mejora de un bloque'},
};

/** One text answer from the configured Kie chat model (personal-chat endpoint with a studio purpose). */
export async function textRequest(purpose: TextPurpose, content: string, signal?: AbortSignal) {
  const requestId = crypto.randomUUID();
  let text = '', done = false, accepted = false, credits: number | undefined;
  try {
    const r = await fetch('/api/personal-chat', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({requestId, purpose, model: 'auto', messages: [{role: 'user', content}]}),
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
      if (e.type === 'usage' && typeof e.usage?.credits === 'number') credits = e.usage.credits;
      if (e.type === 'error') throw Error(e.error);
      if (e.type === 'done') done = true;
    }
    if (!done) throw Error('STREAM_INTERRUPTED');
    return text.trim();
  } finally {
    // Keep the sidebar usage line honest: text requests to Kie are recorded too.
    if (accepted) usePersonal.getState().charge(requestId, credits, usageLabels[purpose]);
  }
}
