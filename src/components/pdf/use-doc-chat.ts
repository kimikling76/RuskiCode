'use client';
import {useEffect, useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {docChatEvents, loadDocChat, type DocMessage, type DocThread} from '@/lib/books/doc-chat';
import type {ChatModel} from '@/components/studio/chat-model-picker';

/** One thread of a document's conversations, kept current when this or another computer adds to it. */
export function useDocThread(doc: string, thread: DocThread) {
  const [messages, setMessages] = useState<DocMessage[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => { void loadDocChat(doc).then(c => { if (alive) setMessages(c.messages.filter(m => m.thread === thread)); }); };
    load();
    const on = (e: Event) => { if ((e as CustomEvent<string>).detail === doc) load(); };
    docChatEvents?.addEventListener('change', on);
    return () => { alive = false; docChatEvents?.removeEventListener('change', on); };
  }, [doc, thread]);
  return messages;
}

/** Kie text models from the server catalog (the same list as the Chat), with what is really available. */
export function useTextModels() {
  const query = useQuery<{models: ChatModel[]}>({
    queryKey: ['personal-kie-models'],
    queryFn: async () => { const r = await fetch('/api/personal-chat'); if (!r.ok) throw Error(); return r.json(); },
    staleTime: 60000,
  });
  return {models: query.data?.models || [], loading: query.isPending, failed: query.isError};
}

/** A model choice remembered in this browser for one panel. */
export function useStoredModel(key: string) {
  const [model, setModel] = useState('auto');
  useEffect(() => { try { const v = localStorage.getItem(key); if (v) setModel(v); } catch {} }, [key]);
  const choose = (id: string) => { setModel(id); try { localStorage.setItem(key, id); } catch {} };
  return [model, choose] as const;
}

/** An on/off choice remembered in this browser for one panel. */
export function useStoredFlag(key: string) {
  const [on, setOn] = useState(false);
  useEffect(() => { try { setOn(localStorage.getItem(key) === '1'); } catch {} }, [key]);
  const choose = (value: boolean) => { setOn(value); try { localStorage.setItem(key, value ? '1' : '0'); } catch {} };
  return [on, choose] as const;
}
