'use client';
import {create} from 'zustand';

// Notes anchored to blocks. They live in this browser only (shared notes need a server table).
const KEY = 'rc-pdf-notes-v1';

export type BookNote = {
  id: string;
  book: string;
  blockId: string | null;
  chapter: number;
  text: string;
  suggestion?: string;
  author: 'Vos' | 'Asistente';
  severity?: 'info' | 'warning' | 'error';
  createdAt: number;
  resolved?: boolean;
};

type Store = {
  notes: BookNote[];
  hydrated: boolean;
  hydrate: () => void;
  add: (notes: BookNote[]) => void;
  update: (id: string, patch: Partial<BookNote>) => void;
  remove: (id: string) => void;
  /** Sync only: replaces the notes with the merged set. */
  replaceSynced: (notes: BookNote[]) => void;
};

function persist(notes: BookNote[]) {
  try { localStorage.setItem(KEY, JSON.stringify(notes)); } catch {}
  useNotes.setState({notes});
}

export const useNotes = create<Store>((set, get) => ({
  notes: [],
  hydrated: false,
  hydrate: () => {
    if (get().hydrated) return;
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || '[]');
      set({notes: Array.isArray(value) ? value.filter(n => n && typeof n.id === 'string' && typeof n.text === 'string') : [], hydrated: true});
    } catch { set({hydrated: true}); }
  },
  add: notes => persist([...notes, ...get().notes]),
  update: (id, patch) => persist(get().notes.map(n => n.id === id ? {...n, ...patch} : n)),
  remove: id => persist(get().notes.filter(n => n.id !== id)),
  replaceSynced: notes => persist(notes),
}));
