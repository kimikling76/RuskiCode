'use client';
import {useEffect, useMemo, useState} from 'react';
import {create} from 'zustand';
import {libraryEvents} from '@/lib/books/library';
import {listEntries, listProjects} from '@/lib/kb/store';
import type {EntryOf, KbEntry, KbProject, KbRef} from '@/lib/kb/model';
import {approvedRefs} from '@/lib/kb/picture';
import {ageInEnglish, ageOf} from '@/lib/kb/characters';
import {autoLooks, type Looks, type Mention} from '@/lib/cinema/studio-looks';
import {useStudioItems, type StudioItem} from '@/store/cinema-projects';
import {isDone, type CinemaJob} from '@/store/cinema';

/** Someone or somewhere the composer can call with «@»: from the book's context (read only) or the Estudio's own. */
export type CastMember = Mention & {
  key: string;
  kind: 'character' | 'place';
  source: 'book' | 'own';
  /** What the card shows: a book reference file or a gallery picture. */
  picture: {ref: KbRef} | {url: string} | null;
  /** Book characters: what is kept with the job (who, with which file). */
  book?: {project: string; projectName: string; id: string; refs: {hash: string; name: string}[]};
};

function useBook() {
  const [value, setValue] = useState<{projects: KbProject[]; entries: KbEntry[]} | null>(null);
  useEffect(() => {
    let alive = true;
    const run = () => { Promise.all([listProjects(), listEntries()]).then(([projects, entries]) => { if (alive) setValue({projects, entries}); }).catch(() => {}); };
    run();
    libraryEvents?.addEventListener('change', run);
    libraryEvents?.addEventListener('synced', run);
    return () => { alive = false; libraryEvents?.removeEventListener('change', run); libraryEvents?.removeEventListener('synced', run); };
  }, []);
  return value;
}

/** What the model is told about a book character: its confirmed look (with its age), or else its role. */
function bookDescription(c: EntryOf<'character'>) {
  const age = ageInEnglish(ageOf(c));
  const look = c.data.look?.trim() || c.data.role?.trim() || '';
  return [age ? age.charAt(0).toUpperCase() + age.slice(1) : '', look].filter(Boolean).join('; ');
}

/** Where an element's picture is shown: its copy in the studio (`asset:<sha256>`) or its Kie link. */
export const pictureUrl = (ref: string) => ref.startsWith('asset:') ? '/api/sync/assets?hash=' + ref.slice(6) : ref;

/**
 * The cast for «@»: the book's characters (only an approved main picture is sent, never a rejected or unchecked
 * file) and the Estudio's own characters and places.
 */
export function useCast() {
  const book = useBook();
  const items = useStudioItems(s => s.items);
  return useMemo<CastMember[] | null>(() => {
    if (!book) return null;
    const names = new Map(book.projects.map(p => [p.id, p.name]));
    const fromBook = book.entries
      .filter((e): e is EntryOf<'character'> => e.kind === 'character' && e.status !== 'superseded')
      .map((c): CastMember => {
        const main = approvedRefs(c).find(r => r.hash === c.data.mainRef && !r.chunks);
        return {
          key: 'book:' + c.id, name: c.title, kind: 'character', source: 'book', description: bookDescription(c),
          ...(main ? {reference: 'asset:' + main.hash} : {}), picture: main ? {ref: main} : null,
          book: {project: c.project, projectName: names.get(c.project) || 'Libro', id: c.id, refs: main ? [{hash: main.hash, name: main.name}] : []},
        };
      });
    const own = items.filter((i): i is StudioItem & {element: NonNullable<StudioItem['element']>} => i.type === 'element' && Boolean(i.element)).map((i): CastMember => ({
      key: 'own:' + i.id, name: i.name, kind: i.element.kind, source: 'own', description: i.element.description,
      ...(i.element.image ? {reference: i.element.image} : {}), picture: i.element.image ? {url: pictureUrl(i.element.image)} : null,
    }));
    return [...own, ...fromBook].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [book, items]);
}

/** The first picture of a job (or of its saved copy), for collages and the hero. */
export const jobPicture = (job: CinemaJob) => isDone(job) ? job.urls[0] : null;

/** The composer's choices, kept while moving between the Estudio's pages. */
type Draft = {
  mode: 'image' | 'video';
  imageModel: string;
  videoModel: string;
  prompt: string;
  looks: Looks;
  aspect: string;
  resolution: string;
  duration: string;
  count: number;
  references: string[];
  /** Reference videos for a video model (Kie links, or `video:<sha256>` kept in this browser). */
  videos?: string[];
  /** The part of each video to use, by video, for models that take clips. */
  clips?: Record<string, {start: number; ends: number}>;
  /** The project the results go to from Inicio (a project page always uses its own). */
  project: string | null;
};
export const useEstudioDraft = create<Draft & {patch: (p: Partial<Draft>) => void}>(set => ({
  mode: 'image', imageModel: 'nano-banana-2-1', videoModel: '', prompt: '', looks: autoLooks(),
  aspect: '', resolution: '', duration: '', count: 1, references: [], project: null,
  patch: p => set(p),
}));
