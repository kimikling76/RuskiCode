'use client';
import {create} from 'zustand';

const KEY = 'rc-sidebar';

type Shell = {
  drawer: boolean;
  collapsed: boolean;
  ready: boolean;
  setDrawer: (open: boolean) => void;
  toggleCollapsed: () => void;
  restore: () => void;
};

/** Navigation state shared by the sidebar, the mobile drawer and each view's header. */
export const useShell = create<Shell>((set, get) => ({
  drawer: false,
  collapsed: false,
  ready: false,
  setDrawer: drawer => set({drawer}),
  toggleCollapsed: () => {
    const collapsed = !get().collapsed;
    set({collapsed});
    try { localStorage.setItem(KEY, collapsed ? 'closed' : 'open'); } catch {}
  },
  restore: () => {
    if (get().ready) return;
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch {}
    const collapsed = saved ? saved === 'closed' : window.matchMedia('(max-width: 1199px)').matches;
    set({collapsed, ready: true});
  },
}));
