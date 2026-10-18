import {tokenOf} from '@/lib/sync/canonical';
import {contentOf, dataSchemas, entrySchema, snapshotOf, trimHistory, type KbEntry, type KbProject, type KbSnapshot, type KbStatus} from './model';

// Versions of an entry. A change never overwrites: the entry as it was goes to its history first, so any earlier
// version can be looked at and restored (restoring is itself a new version). Two computers' copies are merged only
// when one already contains the other; otherwise the person chooses.

export type EntryChange = Partial<Pick<KbEntry, 'title' | 'body' | 'status' | 'sources' | 'tags'>> & {data?: unknown};

/** The entry with a change applied as a new version. Returns the same entry when nothing changes. */
export function changeEntry(entry: KbEntry, change: EntryChange, note: string, now: number): KbEntry {
  const data = change.data === undefined ? entry.data : dataSchemas[entry.kind].parse(change.data);
  const next = {...entry, ...change, data} as KbEntry;
  if (tokenOf(contentOf(next)) === tokenOf(contentOf(entry)) && tokenOf(next.tags) === tokenOf(entry.tags)) return entry;
  return entrySchema.parse({...next, version: entry.version + 1, updatedAt: now, note: note.slice(0, 300), history: trimHistory([...entry.history, snapshotOf(entry)])});
}

/** Brings back an earlier version as the newest one. */
export function restoreEntry(entry: KbEntry, version: number, now: number): KbEntry {
  const old = entry.history.find(h => h.version === version);
  if (!old) throw Error('VERSION_NOT_FOUND');
  return changeEntry(entry, {title: old.title, body: old.body, status: old.status, sources: old.sources, data: old.data}, 'Restaurada la versión ' + version, now);
}

export const setStatus = (entry: KbEntry, status: KbStatus, now: number, why?: string) =>
  changeEntry(entry, {status}, why || statusNote[status], now);
const statusNote: Record<KbStatus, string> = {
  approved: 'Aprobado por el autor', observed: 'Marcado como observado', proposed: 'Marcado como propuesta',
  pending: 'Marcado como pendiente', superseded: 'Sustituido',
};

const sameContent = (a: Pick<KbSnapshot, 'status' | 'title' | 'body' | 'data' | 'sources'>, b: Pick<KbSnapshot, 'status' | 'title' | 'body' | 'data' | 'sources'>) =>
  tokenOf(contentOf(a)) === tokenOf(contentOf(b));

/** True when `later` was made from `earlier`: its history holds `earlier` as it is. */
const descends = (later: KbEntry, earlier: KbEntry) =>
  later.version > earlier.version && later.history.some(h => h.version === earlier.version && sameContent(h, earlier));

/** Merges two copies of an entry when that loses nothing; undefined is a real conflict. */
export function mergeEntries(local: KbEntry, remote: KbEntry): KbEntry | undefined {
  if (sameContent(local, remote)) return local.version >= remote.version ? local : remote;
  if (descends(remote, local)) return remote;
  if (descends(local, remote)) return local;
  return undefined;
}

/** Merges two copies of a project: links to units and assistants are added up; a different name is a conflict. */
export function mergeProjects(local: KbProject, remote: KbProject): KbProject | undefined {
  if (local.name !== remote.name) return undefined;
  const imports = [...remote.imports];
  for (const i of local.imports) if (!imports.some(x => x.file === i.file && x.at === i.at)) imports.push(i);
  return {
    ...remote,
    units: {...local.units, ...remote.units},
    assistants: [...new Set([...remote.assistants, ...local.assistants])].slice(0, 20),
    imports: imports.sort((a, b) => a.at - b.at).slice(-200),
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
  };
}
