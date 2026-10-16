'use client';
import {editableBookSchema, type EditableBook} from './editable';
import {localStore} from './local-store';

// Where an editable book lives:
// - local: created in PDF Studio, stored only in this browser (IndexedDB).
// - server: created by the book composer; the browser keeps an unsent draft on top of the saved revision.
// - demo: the bundled sample, with its own draft.
export type BookSource = {kind: 'local'; id: string} | {kind: 'server'; id: string} | {kind: 'demo'};

export type LocalBook = {id: string; project: EditableBook; createdAt: number; updatedAt: number};
export type Draft = {revision: number; project: EditableBook; updatedAt: number};

const bookKey = (id: string) => 'book:' + id;
const draftKey = (source: BookSource) => 'draft:' + (source.kind === 'server' ? source.id : 'demo');
const legacyDraftKey = (source: BookSource) => 'ruskicode-editor-v1-' + (source.kind === 'server' ? source.id : 'demo');

export async function listLocalBooks() {
  const keys = (await localStore.keys()).filter(k => k.startsWith('book:'));
  const books = await Promise.all(keys.map(k => localStore.get<LocalBook>(k)));
  return books.filter((b): b is LocalBook => Boolean(b?.project)).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function createLocalBook(project: EditableBook) {
  const book: LocalBook = {id: crypto.randomUUID(), project: editableBookSchema.parse(project), createdAt: Date.now(), updatedAt: Date.now()};
  await localStore.set(bookKey(book.id), book);
  return book.id;
}

export async function loadLocalBook(id: string) {
  const book = await localStore.get<LocalBook>(bookKey(id));
  return book ? {...book, project: editableBookSchema.parse(book.project)} : undefined;
}

export async function saveLocalBook(id: string, project: EditableBook) {
  const previous = await localStore.get<LocalBook>(bookKey(id));
  await localStore.set(bookKey(id), {id, project, createdAt: previous?.createdAt || Date.now(), updatedAt: Date.now()} satisfies LocalBook);
}

export const deleteLocalBook = (id: string) => localStore.remove(bookKey(id));

/** Unsent edits on top of a server revision or the demo. Moves an older localStorage draft into IndexedDB once. */
export async function loadDraft(source: BookSource): Promise<Draft | undefined> {
  const stored = await localStore.get<Draft>(draftKey(source));
  if (stored) return stored;
  try {
    const legacy = JSON.parse(localStorage.getItem(legacyDraftKey(source)) || 'null');
    if (legacy?.project) {
      const draft: Draft = {revision: legacy.revision || 0, project: legacy.project, updatedAt: Date.now()};
      await localStore.set(draftKey(source), draft);
      localStorage.removeItem(legacyDraftKey(source));
      return draft;
    }
  } catch {}
  return undefined;
}

export const saveDraft = (source: BookSource, revision: number, project: EditableBook) => localStore.set(draftKey(source), {revision, project, updatedAt: Date.now()} satisfies Draft);
export const clearDraft = (source: BookSource) => localStore.remove(draftKey(source));

/** Books created by the composer from the earlier tools: their ids live in localStorage, one per old project. */
export function composerBooks(): {id: string; projectId: string}[] {
  const out: {id: string; projectId: string}[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || '';
      if (!key.startsWith('ruskicode-book-job-v1-')) continue;
      const id = localStorage.getItem(key);
      if (id) out.push({id, projectId: key.slice('ruskicode-book-job-v1-'.length)});
    }
  } catch {}
  return out;
}

export function editorHref(source: BookSource) {
  return source.kind === 'local' ? '/workspace/editor?local=' + encodeURIComponent(source.id)
    : source.kind === 'server' ? '/workspace/editor?book=' + encodeURIComponent(source.id)
    : '/workspace/editor';
}
