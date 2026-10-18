'use client';
import {useEffect, useState} from 'react';
import {libraryEvents} from '@/lib/books/library';
import {listEntries, listProjects} from '@/lib/kb/store';
import type {KbEntry, KbProject} from '@/lib/kb/model';

/** Reloads when this browser saves or sync brings changes from another computer. */
function useLibrary<T>(load: () => Promise<T>, deps: unknown[]): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    let alive = true;
    const run = () => { load().then(v => { if (alive) setValue(v); }).catch(() => {}); };
    run();
    libraryEvents?.addEventListener('change', run);
    libraryEvents?.addEventListener('synced', run);
    return () => { alive = false; libraryEvents?.removeEventListener('change', run); libraryEvents?.removeEventListener('synced', run); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

export const useKbProjects = () => useLibrary<KbProject[]>(listProjects, []);
export const useKbEntries = (project: string | null) => useLibrary<KbEntry[]>(() => project ? listEntries(project) : Promise.resolve([]), [project]);
