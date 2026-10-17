'use client';
import {create} from 'zustand';

const KEY = 'rc-favorite-models-v1';

export type FavoriteCategory = 'text' | 'image' | 'video';
export type Favorites = Record<string, {category: FavoriteCategory; at: number}>;

type Store = {
  favorites: Favorites;
  hydrated: boolean;
  hydrate: () => void;
  toggle: (id: string, category: FavoriteCategory) => void;
  /** Sync only. */
  replaceSynced: (favorites: Favorites) => void;
};

function persist(favorites: Favorites) {
  try { localStorage.setItem(KEY, JSON.stringify(favorites)); } catch {}
  useFavorites.setState({favorites});
}

/** Favorite models per category. Synced between computers, one record per model. */
export const useFavorites = create<Store>((set, get) => ({
  favorites: {},
  hydrated: false,
  hydrate: () => {
    if (get().hydrated) return;
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || '{}');
      set({favorites: value && typeof value === 'object' && !Array.isArray(value) ? value : {}, hydrated: true});
    } catch { set({hydrated: true}); }
    window.addEventListener('storage', e => { if (e.key === KEY) try { set({favorites: JSON.parse(e.newValue || '{}')}); } catch {} });
  },
  toggle: (id, category) => {
    const next = {...get().favorites};
    if (next[id]) delete next[id]; else next[id] = {category, at: Date.now()};
    persist(next);
  },
  replaceSynced: favorites => persist(favorites),
}));
