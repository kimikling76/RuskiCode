'use client';
import {create} from 'zustand';
import {maxReferences, type AspectRatio, type Resolution} from '@/lib/cinema/capabilities';

export const cinemaTabs = ['image', 'video', 'edit', 'direct', 'gallery'] as const;
export type CinemaTab = (typeof cinemaTabs)[number];

const ASK_KEY = 'rc-cinema-ask';

type ImageDraft = {model: string; prompt: string; aspect: AspectRatio; resolution: Resolution; count: number; references: string[]};
type EditDraft = {source: string | null; instruction: string; count: number};
/** `model` empty: the tab's first video model. Values another model does not offer fall back to its first option. */
/** `videos`: reference videos (Kie links, or `video:<sha256>` kept in this browser). */
type VideoDraft = {model: string; prompt: string; aspect: string; resolution: string; duration: string; references: string[]; videos?: string[]};

type CinemaUi = {
  tab: CinemaTab;
  askFirst: boolean;
  image: ImageDraft;
  edit: EditDraft;
  video: VideoDraft;
  boardId: string | null;
  setTab: (tab: CinemaTab) => void;
  setAskFirst: (value: boolean) => void;
  restoreAskFirst: () => void;
  patchImage: (patch: Partial<ImageDraft>) => void;
  patchEdit: (patch: Partial<EditDraft>) => void;
  patchVideo: (patch: Partial<VideoDraft>) => void;
  setBoard: (id: string | null) => void;
  addReference: (url: string) => void;
  editImage: (url: string) => void;
};

export const useCinemaUi = create<CinemaUi>((set, get) => ({
  tab: 'image',
  askFirst: true,
  image: {model: 'nano-banana-2-1', prompt: '', aspect: 'auto', resolution: '1K', count: 1, references: []},
  edit: {source: null, instruction: '', count: 1},
  video: {model: '', prompt: '', aspect: '', resolution: '', duration: '', references: []},
  boardId: null,
  setTab: tab => {
    set({tab});
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      window.history.replaceState(null, '', url);
    } catch {}
  },
  setAskFirst: askFirst => {
    set({askFirst});
    try { localStorage.setItem(ASK_KEY, askFirst ? '1' : '0'); } catch {}
  },
  restoreAskFirst: () => {
    try { const saved = localStorage.getItem(ASK_KEY); if (saved) set({askFirst: saved === '1'}); } catch {}
  },
  patchImage: patch => set({image: {...get().image, ...patch}}),
  patchEdit: patch => set({edit: {...get().edit, ...patch}}),
  patchVideo: patch => set({video: {...get().video, ...patch}}),
  setBoard: boardId => set({boardId}),
  addReference: url => {
    const refs = get().image.references;
    if (!refs.includes(url)) set({image: {...get().image, references: [...refs, url].slice(-maxReferences)}});
    get().setTab('image');
  },
  editImage: url => {
    set({edit: {...get().edit, source: url}});
    get().setTab('edit');
  },
}));
