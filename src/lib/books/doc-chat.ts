'use client';
import {localStore} from './local-store';
import {libraryEvents} from './library';

// The conversations that belong to one document: the «Crear con IA» chat and the editing assistant's history
// (what was asked, what it proposed and whether it was applied). Saved with the account, like the document.
// The personal Chat is separate and never reads these.

export type DocThread = 'create' | 'assistant';

export type DocMessage = {
  id: string;
  thread: DocThread;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  /** Last change (a proposal applied or discarded), for merging two computers' copies. */
  updatedAt?: number;
  /** The model that wrote an answer. */
  model?: {id: string; name: string};
  /** Credits Kie reported for this answer. Absent when Kie did not report them. */
  credits?: number;
  /** Assistant proposals: what became of them. */
  status?: 'proposed' | 'applied' | 'discarded' | 'failed' | 'unsupported';
  /** The checked plan behind an assistant answer: the actions (as validated by the server) and what to review. */
  plan?: {actions: unknown[]; warnings: string[][]; rejected: string[]; unsupported: string | null};
  /** Why an answer failed, as a code (see cinemaErrorDetails). */
  error?: string;
};

export type DocChat = {doc: string; messages: DocMessage[]; updatedAt: number};

export const MAX_DOC_MESSAGES = 300;
/** «pdf:<id>» for an imported PDF, «book:<id>» for a book of this browser. */
export const docKey = (kind: 'pdf' | 'book', id: string) => kind + ':' + id;

const storeKey = (doc: string) => 'docchat:' + doc;
export const docChatEvents = typeof window === 'undefined' ? null : new EventTarget();
const changed = (doc: string) => {
  libraryEvents?.dispatchEvent(new Event('change'));
  docChatEvents?.dispatchEvent(new CustomEvent('change', {detail: doc}));
};

export async function loadDocChat(doc: string): Promise<DocChat> {
  return (await localStore.get<DocChat>(storeKey(doc))) || {doc, messages: [], updatedAt: 0};
}

async function write(chat: DocChat) {
  const messages = chat.messages.slice(-MAX_DOC_MESSAGES);
  await localStore.set(storeKey(chat.doc), {...chat, messages, updatedAt: Date.now()});
  changed(chat.doc);
}

export async function addDocMessages(doc: string, messages: DocMessage[]) {
  const chat = await loadDocChat(doc);
  await write({...chat, messages: [...chat.messages, ...messages]});
}

export async function updateDocMessage(doc: string, id: string, patch: Partial<DocMessage>) {
  const chat = await loadDocChat(doc);
  await write({...chat, messages: chat.messages.map(m => m.id === id ? {...m, ...patch, updatedAt: Date.now()} : m)});
}

export async function clearDocThread(doc: string, thread: DocThread) {
  const chat = await loadDocChat(doc);
  await write({...chat, messages: chat.messages.filter(m => m.thread !== thread)});
}

/** When its document is deleted for good. */
export async function deleteDocChat(doc: string) {
  await localStore.remove(storeKey(doc));
  changed(doc);
}

/** Two computers' copies of a chat: every message from both, the newest copy of each. Never loses one. */
export function mergeDocChats(a: DocChat, b: DocChat): DocChat {
  const byId = new Map<string, DocMessage>();
  for (const m of [...a.messages, ...b.messages]) {
    const prev = byId.get(m.id);
    if (!prev || (m.updatedAt || m.createdAt) > (prev.updatedAt || prev.createdAt)) byId.set(m.id, m);
  }
  const messages = [...byId.values()].sort((x, y) => x.createdAt - y.createdAt || (x.id < y.id ? -1 : 1)).slice(-MAX_DOC_MESSAGES);
  return {doc: a.doc || b.doc, messages, updatedAt: Math.max(a.updatedAt, b.updatedAt)};
}

// ---------- Sync only ----------

export async function listDocChats(): Promise<DocChat[]> {
  const keys = (await localStore.keys()).filter(k => k.startsWith('docchat:'));
  const items = await Promise.all(keys.map(k => localStore.get<DocChat>(k)));
  return items.filter((c): c is DocChat => Boolean(c?.doc));
}

export async function putSyncedDocChat(chat: DocChat) {
  await localStore.set(storeKey(chat.doc), chat);
  docChatEvents?.dispatchEvent(new CustomEvent('change', {detail: chat.doc}));
}

export async function removeSyncedDocChat(doc: string) {
  await localStore.remove(storeKey(doc));
  docChatEvents?.dispatchEvent(new CustomEvent('change', {detail: doc}));
}
