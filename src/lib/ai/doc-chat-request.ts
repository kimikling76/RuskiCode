'use client';
import {usePersonal} from '@/store/personal-chat';
import {sseData} from '@/lib/ai/sse';
import type {Source} from './types';

export type DocChatTurn = {role: 'user' | 'assistant'; content: string};
export type DocChatAnswer = {text: string; credits?: number; model?: {id: string; name: string}; sources?: Source[]};

/** One streamed answer for «Crear con IA», from the chosen Kie text model. Credits Kie reports are recorded. */
/** `webSearch` only for a model that documents a search tool. */
export async function docChatRequest({messages, model, signal, onDelta, webSearch}: {messages: DocChatTurn[]; model: string; signal: AbortSignal; onDelta?: (text: string) => void; webSearch?: boolean}): Promise<DocChatAnswer> {
  const requestId = crypto.randomUUID();
  let text = '', done = false, accepted = false, credits: number | undefined, used: DocChatAnswer['model'];
  const sources: Source[] = [];
  try {
    const r = await fetch('/api/personal-chat', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({requestId, purpose: 'pdf-create', model, messages, ...(webSearch ? {webSearch: true} : {})}),
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
      if (e.type === 'model' && typeof e.id === 'string') used = {id: e.id, name: String(e.name || e.id)};
      if (e.type === 'delta') { text += e.text; onDelta?.(text); }
      if (e.type === 'usage' && typeof e.usage?.credits === 'number') credits = e.usage.credits;
      if (e.type === 'sources' && Array.isArray(e.sources)) for (const x of e.sources) if (!sources.some(y => y.url === x.url) && sources.length < 20) sources.push(x);
      if (e.type === 'error') throw Error(e.error);
      if (e.type === 'done') done = true;
    }
    if (!done) throw Error('STREAM_INTERRUPTED');
    return {text: text.trim(), credits, model: used, ...(sources.length ? {sources} : {})};
  } finally {
    if (accepted) usePersonal.getState().charge(requestId, credits, {studio: 'pdf', label: 'Crear con IA'});
  }
}
