'use client';
import {create} from 'zustand';
import type {AspectRatio, Resolution, TaskState} from '@/lib/cinema/capabilities';

const KEY = 'rc-cinema-v1';

export type JobMode = 'create' | 'edit' | 'shot' | 'video';
export type JobState = 'sending' | TaskState | 'error';

export type CinemaJob = {
  id: string;
  batchId: string;
  mode: JobMode;
  prompt: string;
  aspect: AspectRatio;
  resolution: Resolution;
  references: string[];
  /** Reference videos sent with it (Kie links, or `video:<sha256>` kept in the browser that sent it). */
  videos?: string[];
  /** Catalog model id (absent on older jobs: the default image model). */
  model?: string;
  duration?: string;
  /** Edit mode: the image being edited (also references[0]). */
  source?: string;
  boardId?: string;
  shotId?: string;
  /** What the job is for, given by the caller (a picture slot of /pdf-generator). */
  tag?: string;
  taskId?: string;
  state: JobState;
  urls: string[];
  credits?: number;
  /** The studio's own copies of the result images (Kie deletes its files after 14 days). */
  saved?: {hash: string; mime: string}[];
  error?: string;
  failMessage?: string;
  createdAt: number;
  finishedAt?: number;
  /** What the server uploaded to Kie for each reference (hash measured on the bytes sent). */
  sent?: SentRef[];
  /** A picture of a book's characters: who, with which reference files. */
  book?: JobBook;
  /** The author's review of the result against the approved looks; never set automatically. */
  review?: 'consistent' | 'changed';
  /** The Estudio project it belongs to (null: taken out of one), with when that was decided. */
  studio?: {project: string | null; at: number};
  /** Marked as a favorite in the Estudio, with when it was marked or unmarked. */
  favorite?: {on: boolean; at: number};
};

export type SentRef = {reference: string; url: string; sha256?: string; size?: number; mime?: string};
export type JobBook = {
  project: string;
  name: string;
  characters: {id: string; name: string; refs: {hash: string; name: string}[]}[];
};

export type Shot = {id: string; title: string; description: string; prompt: string};
export type Board = {id: string; title: string; idea: string; script: string; aspect: AspectRatio; shots: Shot[]; createdAt: number; updatedAt: number};

export type CinemaData = {version: 1; jobs: CinemaJob[]; boards: Board[]};

type Store = {
  data: CinemaData;
  hydrated: boolean;
  error: string;
  hydrate: () => void;
  addJobs: (jobs: CinemaJob[]) => void;
  updateJob: (id: string, patch: Partial<CinemaJob>) => void;
  removeJobs: (ids: string[]) => void;
  saveBoard: (board: Board) => void;
  removeBoard: (id: string) => void;
  /** Sync only: replaces the saved data with records merged from another computer. */
  replaceSynced: (data: CinemaData) => void;
};

const empty = (): CinemaData => ({version: 1, jobs: [], boards: []});

function read(): CinemaData {
  const raw = localStorage.getItem(KEY);
  if (!raw) return empty();
  const parsed = JSON.parse(raw);
  if (parsed?.version !== 1 || !Array.isArray(parsed.jobs) || !Array.isArray(parsed.boards)) throw Error();
  return parsed;
}

// Set when the saved data could not be read: never overwrite it, keep working in memory.
let broken = false;

function persist(data: CinemaData) {
  if (broken) { useCinema.setState({data}); return; }
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    useCinema.setState({data, error: ''});
  } catch {
    // Keep working in memory; tell the person their history may not survive a reload.
    useCinema.setState({data, error: 'No se pudo guardar en este navegador. Descargá lo que quieras conservar.'});
  }
}

export const useCinema = create<Store>((set, get) => ({
  data: empty(),
  hydrated: false,
  error: '',
  hydrate: () => {
    if (get().hydrated) return;
    try {
      const data = read();
      // A request that was in flight when the page closed never got its task id.
      data.jobs = data.jobs.map(j => j.state === 'sending' ? {...j, state: 'error', error: 'CREATE_UNCERTAIN'} : j);
      set({data, hydrated: true});
    } catch {
      broken = true;
      set({hydrated: true, error: 'No se pudo leer la galería guardada en este navegador. No se sobrescribió; lo nuevo se pierde al recargar.'});
    }
    window.addEventListener('storage', e => {
      if (e.key !== KEY) return;
      try { set({data: read()}); } catch {}
    });
  },
  addJobs: jobs => persist({...get().data, jobs: [...jobs, ...get().data.jobs]}),
  updateJob: (id, patch) => persist({...get().data, jobs: get().data.jobs.map(j => j.id === id ? {...j, ...patch} : j)}),
  removeJobs: ids => persist({...get().data, jobs: get().data.jobs.filter(j => !ids.includes(j.id))}),
  saveBoard: board => {
    const boards = get().data.boards;
    const next = boards.some(b => b.id === board.id) ? boards.map(b => b.id === board.id ? board : b) : [board, ...boards];
    persist({...get().data, boards: next});
  },
  removeBoard: id => persist({...get().data, boards: get().data.boards.filter(b => b.id !== id)}),
  replaceSynced: data => persist(data),
}));

export const isActive = (job: CinemaJob) => job.state === 'sending' || job.state === 'waiting' || job.state === 'queuing' || job.state === 'generating';
export const isDone = (job: CinemaJob) => job.state === 'success' && job.urls.length > 0;
