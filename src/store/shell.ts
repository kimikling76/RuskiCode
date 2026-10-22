'use client';
import {create} from 'zustand';

const KEY = 'rc-sidebar';
// The editors keep their own choice: they open with the navigation folded, so the page gets the room.
const EDITOR_KEY = 'rc-sidebar-editor';

type Shell = {
  drawer: boolean;
  collapsed: boolean;
  /** Folded in the editors (PDF Studio's book, manual and PDF editors). */
  editorCollapsed: boolean;
  /** An editor is open: the sidebar uses its editor choice. */
  editor: boolean;
  ready: boolean;
  setDrawer: (open: boolean) => void;
  setEditor: (on: boolean) => void;
  toggleCollapsed: () => void;
  restore: () => void;
};

/** Navigation state shared by the sidebar, the mobile drawer and each view's header. */
export const useShell = create<Shell>((set, get) => ({
  drawer: false,
  collapsed: false,
  editorCollapsed: true,
  editor: false,
  ready: false,
  setDrawer: drawer => set({drawer}),
  setEditor: editor => set({editor}),
  toggleCollapsed: () => {
    const editor = get().editor;
    const next = !(editor ? get().editorCollapsed : get().collapsed);
    set(editor ? {editorCollapsed: next} : {collapsed: next});
    try { localStorage.setItem(editor ? EDITOR_KEY : KEY, next ? 'closed' : 'open'); } catch {}
  },
  restore: () => {
    if (get().ready) return;
    let saved: string | null = null;
    let savedEditor: string | null = null;
    try { saved = localStorage.getItem(KEY); savedEditor = localStorage.getItem(EDITOR_KEY); } catch {}
    const collapsed = saved ? saved === 'closed' : window.matchMedia('(max-width: 1199px)').matches;
    set({collapsed, editorCollapsed: savedEditor ? savedEditor === 'closed' : true, ready: true});
  },
}));
