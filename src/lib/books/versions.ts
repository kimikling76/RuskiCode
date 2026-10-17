'use client';
import {localStore} from './local-store';
import {libraryEvents} from './library';
import type {EditableBook} from './editable';

// Saved versions of a book made in PDF Studio (the editable source, not the exported PDF).
// One is saved before the assistant changes the book and whenever the author asks for it.
// Restoring a version is itself a normal edit: it can be undone, and the current state is saved first.

export type BookVersion = {
  id: string;
  /** The local book (src/lib/books/library.ts). */
  bookId: string;
  label: string;
  createdAt: number;
  project: EditableBook;
};

export const MAX_BOOK_VERSIONS = 30;

const key = (bookId: string, id: string) => 'bookver:' + bookId + ':' + id;
const changed = () => libraryEvents?.dispatchEvent(new Event('change'));

export async function listBookVersions(bookId: string): Promise<BookVersion[]> {
  const prefix = 'bookver:' + bookId + ':';
  const keys = (await localStore.keys()).filter(k => k.startsWith(prefix));
  const items = await Promise.all(keys.map(k => localStore.get<BookVersion>(k)));
  return items.filter((v): v is BookVersion => Boolean(v?.id)).sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveBookVersion(bookId: string, label: string, project: EditableBook) {
  const version: BookVersion = {id: crypto.randomUUID(), bookId, label: label.slice(0, 200), createdAt: Date.now(), project: structuredClone({...project, layout: undefined})};
  await localStore.set(key(bookId, version.id), version);
  // The oldest go past the limit.
  const all = await listBookVersions(bookId);
  for (const old of all.slice(MAX_BOOK_VERSIONS)) await localStore.remove(key(bookId, old.id));
  changed();
  return version;
}

export async function deleteBookVersions(bookId: string) {
  for (const v of await listBookVersions(bookId)) await localStore.remove(key(bookId, v.id));
  changed();
}

// ---------- Sync only ----------

export async function listAllBookVersions(): Promise<BookVersion[]> {
  const keys = (await localStore.keys()).filter(k => k.startsWith('bookver:'));
  const items = await Promise.all(keys.map(k => localStore.get<BookVersion>(k)));
  return items.filter((v): v is BookVersion => Boolean(v?.id));
}

export const putSyncedBookVersion = (v: BookVersion) => localStore.set(key(v.bookId, v.id), v);

export async function removeSyncedBookVersion(id: string) {
  const found = (await listAllBookVersions()).find(v => v.id === id);
  if (found) await localStore.remove(key(found.bookId, found.id));
}
