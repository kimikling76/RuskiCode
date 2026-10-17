'use client';
import type {SyncKind} from './kinds';
import {usePersonal} from '@/store/personal-chat';
import {useCinema, isActive, type CinemaJob} from '@/store/cinema';
import {useNotes, type BookNote} from '@/store/book-notes';
import {useAssistants, isPristineSeed, type Assistant} from '@/store/assistants';
import {useFavorites} from '@/store/favorites';
import {
  libraryEvents, isBookOpen, listLocalBooks, putSyncedBook, removeSyncedBook, listDrafts, putSyncedDraft, removeSyncedDraft,
  composerBooks, putSyncedComposerBook, type LocalBook, type Draft,
} from '@/lib/books/library';
import {decodeAssets, encodeAssets} from './assets';
import {
  listOriginals, loadOriginalData, isOriginalOpen, putSyncedOriginal, removeSyncedOriginal, bytesToDataUrl, dataUrlToBytes, SYNC_LIMIT, type OriginalPdf,
} from '@/lib/books/originals';
import type {PersonalChat, StudioProject} from '@/store/personal-chat';
import type {UsageEntry} from '@/lib/personal-chat/state';
import type {Board} from '@/store/cinema';

export type Entry = {key: string; data: unknown};
export type Change = {key: string; data: unknown | null};

/** How one kind of record is read from and written to this browser. */
export type Collection = {
  kind: SyncKind;
  list(): Entry[] | Promise<Entry[]>;
  apply(changes: Change[]): void | Promise<void>;
  subscribe(onChange: () => void): () => void;
  label(data: unknown): string;
  /** Cheap change token instead of fingerprinting the whole record (books). */
  token?(data: unknown): string;
  /** False while a record is still being produced (a streaming answer, a request not yet sent). */
  ready?(data: unknown): boolean;
  /** True while the record is open somewhere: changes from another computer wait. */
  busy?(key: string): boolean;
  /** A record nobody edited here (a starter assistant): the other computer's version wins. */
  pristine?(data: unknown): boolean;
  /** Merges two edits automatically when that can never lose work; undefined means a real conflict. */
  merge?(local: unknown, remote: unknown): unknown | undefined;
  /** A copy with a new key, to keep both versions of a conflict. */
  duplicate?(data: unknown): Entry | null;
  encode?(data: unknown): Promise<unknown>;
  decode?(data: unknown): Promise<unknown>;
};

const upsert = <T extends {id: string}>(list: T[], changes: Change[], insertAtStart = true) => {
  let next = [...list];
  for (const {key, data} of changes) {
    const at = next.findIndex(x => x.id === key);
    if (data === null) { if (at >= 0) next = next.filter(x => x.id !== key); continue; }
    const item = data as T;
    if (at >= 0) next[at] = item; else next = insertAtStart ? [item, ...next] : [...next, item];
  }
  return next;
};

const copyLabel = (text: string, max = 100) => (text + ' (copia de esta computadora)').slice(0, max);

const day = (at?: number) => {
  if (typeof at !== 'number' || !Number.isFinite(at)) return 'undated';
  return new Date(at).toISOString().slice(0, 10);
};

const unionById = (a: UsageEntry[], b: UsageEntry[]) => {
  const map = new Map<string, UsageEntry>();
  for (const e of [...a, ...b]) {
    const prev = map.get(e.id);
    // Keep whichever copy knows the reported cost.
    map.set(e.id, prev && prev.credits !== undefined ? prev : e);
  }
  return [...map.values()].sort((x, y) => x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
};

const personal = usePersonal;

const chats: Collection = {
  kind: 'chat',
  // A chat in its "Deshacer" window still exists: it is only deleted on the server once the window closes.
  list: () => {
    const d = personal.getState().data;
    return [...d.chats, ...d.pending.map(p => p.chat)].map(c => ({key: c.id, data: c}));
  },
  apply: changes => {
    personal.getState().replaceSynced(d => {
      const pendingIds = new Set(d.pending.map(p => p.id));
      const forPending = new Map(changes.filter(ch => pendingIds.has(ch.key)).map(ch => [ch.key, ch.data]));
      return {
        ...d,
        chats: upsert(d.chats, changes.filter(ch => !pendingIds.has(ch.key))),
        pending: d.pending.flatMap(p => !forPending.has(p.id) ? [p] : forPending.get(p.id) === null ? [] : [{...p, chat: forPending.get(p.id) as PersonalChat}]),
      };
    });
  },
  subscribe: cb => personal.subscribe((s, prev) => { if (s.data.chats !== prev.data.chats || s.data.pending !== prev.data.pending) cb(); }),
  label: data => (data as PersonalChat).title || 'Chat',
  ready: data => !(data as PersonalChat).messages.some(m => m.status === 'streaming'),
  busy: key => personal.getState().data.chats.find(c => c.id === key)?.messages.some(m => m.status === 'streaming') || false,
  duplicate: data => {
    const chat = data as PersonalChat;
    const id = crypto.randomUUID();
    return {key: id, data: {...chat, id, title: copyLabel(chat.title), titleEdited: true}};
  },
};

const projects: Collection = {
  kind: 'project',
  list: () => personal.getState().data.projects.map(p => ({key: p.id, data: p})),
  apply: changes => { personal.getState().replaceSynced(d => ({...d, projects: upsert(d.projects, changes)})); },
  subscribe: cb => personal.subscribe((s, prev) => { if (s.data.projects !== prev.data.projects) cb(); }),
  label: data => (data as StudioProject).name || 'Proyecto',
  duplicate: data => {
    const p = data as StudioProject;
    const id = crypto.randomUUID();
    return {key: id, data: {...p, id, name: copyLabel(p.name)}};
  },
};

// Usage is append-only: two computers' entries for the same day are always merged.
const usage: Collection = {
  kind: 'usage-day',
  list: () => {
    const groups = new Map<string, UsageEntry[]>();
    for (const e of personal.getState().data.usage) {
      const k = day(e.at);
      groups.set(k, [...(groups.get(k) || []), e]);
    }
    return [...groups].map(([key, entries]) => ({key, data: {entries: unionById(entries, [])}}));
  },
  apply: changes => {
    personal.getState().replaceSynced(d => {
      let entries = d.usage;
      for (const {key, data} of changes) {
        if (data === null) continue;
        entries = [...entries.filter(e => day(e.at) !== key), ...unionById(entries.filter(e => day(e.at) === key), (data as {entries: UsageEntry[]}).entries || [])];
      }
      return {...d, usage: entries};
    });
  },
  subscribe: cb => personal.subscribe((s, prev) => { if (s.data.usage !== prev.data.usage) cb(); }),
  label: () => 'Registro de consumo',
  merge: (local, remote) => ({entries: unionById((local as {entries: UsageEntry[]}).entries, (remote as {entries: UsageEntry[]}).entries || [])}),
};

const terminal = (j: CinemaJob) => !isActive(j);

const jobs: Collection = {
  kind: 'cinema-job',
  // A request still being sent has no Kie task id yet; it is shared once it does.
  list: () => useCinema.getState().data.jobs.filter(j => j.state !== 'sending').map(j => ({key: j.id, data: j})),
  apply: changes => {
    const d = useCinema.getState().data;
    useCinema.getState().replaceSynced({...d, jobs: upsert(d.jobs, changes).sort((a, b) => b.createdAt - a.createdAt)});
  },
  subscribe: cb => useCinema.subscribe((s, prev) => { if (s.data.jobs !== prev.data.jobs) cb(); }),
  label: data => 'Imagen: ' + ((data as CinemaJob).prompt || '').slice(0, 60),
  ready: data => (data as CinemaJob).state !== 'sending',
  // Both computers may follow the same Kie task: the most advanced state wins, nothing is lost.
  merge: (local, remote) => {
    const a = local as CinemaJob, b = remote as CinemaJob;
    if (terminal(a) !== terminal(b)) return terminal(a) ? a : b;
    if ((a.finishedAt || 0) !== (b.finishedAt || 0)) return (a.finishedAt || 0) > (b.finishedAt || 0) ? a : b;
    return {...b, credits: b.credits ?? a.credits};
  },
};

const boards: Collection = {
  kind: 'cinema-board',
  list: () => useCinema.getState().data.boards.map(b => ({key: b.id, data: b})),
  apply: changes => {
    const d = useCinema.getState().data;
    useCinema.getState().replaceSynced({...d, boards: upsert(d.boards, changes)});
  },
  subscribe: cb => useCinema.subscribe((s, prev) => { if (s.data.boards !== prev.data.boards) cb(); }),
  label: data => 'Plan: ' + ((data as Board).title || 'sin título'),
  duplicate: data => {
    const b = data as Board;
    const id = crypto.randomUUID();
    return {key: id, data: {...b, id, title: copyLabel(b.title || 'Plan')}};
  },
};

const notes: Collection = {
  kind: 'book-note',
  list: () => useNotes.getState().notes.map(n => ({key: n.id, data: n})),
  apply: changes => { useNotes.getState().replaceSynced(upsert(useNotes.getState().notes, changes)); },
  subscribe: cb => useNotes.subscribe((s, prev) => { if (s.notes !== prev.notes) cb(); }),
  label: data => 'Nota: ' + ((data as BookNote).text || '').slice(0, 60),
  duplicate: data => {
    const n = data as BookNote;
    const id = crypto.randomUUID();
    return {key: id, data: {...n, id}};
  },
};

const onLibrary = (cb: () => void) => {
  libraryEvents?.addEventListener('change', cb);
  return () => libraryEvents?.removeEventListener('change', cb);
};

async function encodeProject<T extends {project: LocalBook['project']}>(record: T): Promise<T> {
  return {...record, project: {...record.project, assets: await encodeAssets(record.project.assets || {})}};
}
async function decodeProject<T extends {project: LocalBook['project']}>(record: T): Promise<T> {
  return {...record, project: {...record.project, assets: await decodeAssets(record.project.assets || {})}};
}

const books: Collection = {
  kind: 'book',
  list: async () => (await listLocalBooks()).map(b => ({key: b.id, data: b})),
  apply: async changes => {
    for (const {key, data} of changes) {
      if (data === null) await removeSyncedBook(key);
      else await putSyncedBook({...(data as LocalBook), id: key});
    }
    libraryEvents?.dispatchEvent(new Event('synced'));
  },
  subscribe: onLibrary,
  label: data => (data as LocalBook).project?.spec?.title || 'Libro',
  token: data => 'u' + (data as LocalBook).updatedAt,
  busy: key => isBookOpen('book:' + key),
  duplicate: data => {
    const b = data as LocalBook;
    const id = crypto.randomUUID();
    return {key: id, data: {...b, id, updatedAt: Date.now(), project: {...b.project, spec: {...b.project.spec, title: copyLabel(b.project.spec.title, 200)}}}};
  },
  encode: data => encodeProject(data as LocalBook),
  decode: data => decodeProject(data as LocalBook),
};

const drafts: Collection = {
  kind: 'book-draft',
  list: async () => (await listDrafts()).map(d => ({key: d.key, data: d.draft})),
  apply: async changes => {
    for (const {key, data} of changes) {
      if (data === null) await removeSyncedDraft(key);
      else await putSyncedDraft(key, data as Draft);
    }
    libraryEvents?.dispatchEvent(new Event('synced'));
  },
  subscribe: onLibrary,
  label: data => 'Borrador: ' + ((data as Draft).project?.spec?.title || 'libro'),
  token: data => 'u' + (data as Draft).updatedAt,
  busy: key => isBookOpen('draft:' + key),
  encode: data => encodeProject(data as Draft),
  decode: data => decodeProject(data as Draft),
};

const composer: Collection = {
  kind: 'composer-book',
  list: () => composerBooks().map(b => ({key: b.projectId, data: {id: b.id}})),
  apply: changes => { for (const {key, data} of changes) putSyncedComposerBook(key, data ? (data as {id: string}).id : null); },
  subscribe: () => () => {},
  label: () => 'Libro del compositor',
  merge: (_local, remote) => remote,
};

const assistants: Collection = {
  kind: 'assistant',
  list: () => useAssistants.getState().assistants.map(a => ({key: a.id, data: a})),
  apply: changes => { useAssistants.getState().replaceSynced(upsert(useAssistants.getState().assistants, changes, false)); },
  subscribe: cb => useAssistants.subscribe((s, prev) => { if (s.assistants !== prev.assistants) cb(); }),
  label: data => (data as Assistant).name || 'Asistente',
  pristine: data => isPristineSeed(data as Assistant),
  duplicate: data => {
    const a = data as Assistant;
    const id = crypto.randomUUID();
    return {key: id, data: {...a, id, seed: undefined, name: copyLabel(a.name, 80)}};
  },
};

const favorites: Collection = {
  kind: 'favorite',
  list: () => Object.entries(useFavorites.getState().favorites).map(([key, data]) => ({key, data})),
  apply: changes => {
    const next = {...useFavorites.getState().favorites};
    for (const {key, data} of changes) { if (data === null) delete next[key]; else next[key] = data as never; }
    useFavorites.getState().replaceSynced(next);
  },
  subscribe: cb => useFavorites.subscribe((s, prev) => { if (s.favorites !== prev.favorites) cb(); }),
  label: () => 'Modelo favorito',
  merge: (_local, remote) => remote,
};

// The record carries the PDF as an asset reference; files over the limit stay on their computer.
type SyncedOriginal = OriginalPdf & {file?: string | null; copyOf?: string; bytes?: ArrayBuffer | null};
const originals: Collection = {
  kind: 'pdf-original',
  list: async () => (await listOriginals()).map(p => ({key: p.id, data: p})),
  apply: async changes => {
    for (const {key, data} of changes) {
      if (data === null) { await removeSyncedOriginal(key); continue; }
      const d = data as SyncedOriginal;
      await putSyncedOriginal({...d, id: key}, d.bytes ?? null, d.copyOf);
    }
    libraryEvents?.dispatchEvent(new Event('synced'));
  },
  subscribe: onLibrary,
  label: data => (data as OriginalPdf).name || 'PDF',
  token: data => 'u' + (data as OriginalPdf).updatedAt,
  busy: key => isOriginalOpen(key),
  duplicate: data => {
    const p = data as OriginalPdf;
    const id = crypto.randomUUID();
    return {key: id, data: {...p, id, name: copyLabel(p.name, 200), updatedAt: Date.now(), copyOf: p.id}};
  },
  encode: async data => {
    const {id, name, size, createdAt, updatedAt} = data as OriginalPdf;
    const meta = {id, name, size, createdAt, updatedAt};
    const bytes = await loadOriginalData(id);
    if (!bytes || bytes.byteLength > SYNC_LIMIT) return {...meta, file: null};
    const {pdf} = await encodeAssets({pdf: await bytesToDataUrl(bytes)});
    return {...meta, file: pdf};
  },
  decode: async data => {
    const d = data as SyncedOriginal;
    if (!d.file) return {...d, bytes: null};
    const {pdf} = await decodeAssets({pdf: d.file});
    return {...d, file: undefined, bytes: await dataUrlToBytes(pdf)};
  },
};

export const collections: Collection[] = [chats, projects, usage, jobs, boards, notes, books, drafts, composer, assistants, favorites, originals];

/** Loads every store from this browser before the first sync. */
export function hydrateAll() {
  usePersonal.getState().hydrate();
  useCinema.getState().hydrate();
  useNotes.getState().hydrate();
  useAssistants.getState().hydrate();
  useFavorites.getState().hydrate();
}
