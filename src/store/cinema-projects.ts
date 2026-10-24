'use client';
import {create} from 'zustand';

const KEY = 'rc-cinema-projects-v1';

/**
 * The Estudio's own things, synced between computers one record each: projects (the pictures and videos that belong
 * together), folders (projects that belong together) and elements (a character or a place the author describes once
 * and calls with «@» in a prompt).
 */
export type StudioElement = {kind: 'character' | 'place'; description: string; /** A gallery picture sent as a reference: the studio's copy (`asset:<sha256>`), or its Kie link if it was not copied. */ image?: string};
export type StudioItem = {
  id: string;
  type: 'project' | 'folder' | 'element';
  name: string;
  /** A project's folder. */
  folder?: string;
  element?: StudioElement;
  createdAt: number;
  updatedAt: number;
};

type Store = {
  items: StudioItem[];
  hydrated: boolean;
  hydrate: () => void;
  create: (type: StudioItem['type'], name: string, extra?: Partial<Pick<StudioItem, 'folder' | 'element'>>) => StudioItem;
  update: (id: string, patch: Partial<Pick<StudioItem, 'name' | 'folder' | 'element'>>) => void;
  /** A folder goes with nothing inside: its projects move to the top level. */
  remove: (id: string) => void;
  /** Sync only. */
  replaceSynced: (items: StudioItem[]) => void;
};

function persist(items: StudioItem[]) {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {}
  useStudioItems.setState({items});
}

const valid = (x: unknown): x is StudioItem => {
  const i = x as StudioItem;
  return Boolean(i && typeof i.id === 'string' && typeof i.name === 'string' && ['project', 'folder', 'element'].includes(i.type));
};

export const useStudioItems = create<Store>((set, get) => ({
  items: [],
  hydrated: false,
  hydrate: () => {
    if (get().hydrated) return;
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || '[]');
      set({items: Array.isArray(value) ? value.filter(valid) : [], hydrated: true});
    } catch { set({hydrated: true}); }
    window.addEventListener('storage', e => { if (e.key === KEY) try { const v = JSON.parse(e.newValue || '[]'); if (Array.isArray(v)) set({items: v.filter(valid)}); } catch {} });
  },
  create: (type, name, extra = {}) => {
    const now = Date.now();
    const item: StudioItem = {id: crypto.randomUUID(), type, name: name.trim().slice(0, 120) || defaultName(type), ...extra, createdAt: now, updatedAt: now};
    persist([item, ...get().items]);
    return item;
  },
  update: (id, patch) => persist(get().items.map(i => {
    if (i.id !== id) return i;
    const next = {...i, ...patch, updatedAt: Date.now()};
    if (patch.name !== undefined) next.name = patch.name.trim().slice(0, 120) || i.name;
    if (patch.folder === undefined && 'folder' in patch) delete next.folder;
    return next;
  })),
  remove: id => persist(get().items.filter(i => i.id !== id).map(i => i.folder === id ? (({folder: _gone, ...rest}) => ({...rest, updatedAt: Date.now()}))(i) : i)),
  replaceSynced: items => persist(items.filter(valid)),
}));

export const defaultName = (type: StudioItem['type']) => type === 'project' ? 'Proyecto sin título' : type === 'folder' ? 'Carpeta nueva' : 'Elemento sin nombre';
