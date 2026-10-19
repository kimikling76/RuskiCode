'use client';
import {localStore} from '@/lib/books/local-store';
import {libraryEvents} from '@/lib/books/library';
import {entrySchema, projectSchema, type KbEntry, type KbProject, type KbRef} from './model';
import {applyPlan, planImport, refsWithFiles, type ImportFile, type ImportReport} from './import';
import {refBytes, storeUnpacked, unpackFiles} from './files';
import {changeEntry, restoreEntry, type EntryChange} from './versions';

// Book projects and their knowledge base in this browser (IndexedDB), synced to the account as one record per
// project (`kb-project`) and one per entry (`kb-entry`):
// - `kbp:<project>` the project;
// - `kbe:<project>:<entry>` each entry, with its history.

const projectKey = (id: string) => 'kbp:' + id;
const entryStoreKey = (project: string, id: string) => 'kbe:' + project + ':' + id;
const changed = () => libraryEvents?.dispatchEvent(new Event('change'));

// ---------- Projects ----------

export async function listProjects(): Promise<KbProject[]> {
  const keys = (await localStore.keys()).filter(k => k.startsWith('kbp:'));
  const items = await Promise.all(keys.map(k => localStore.get<KbProject>(k)));
  return items.filter((p): p is KbProject => projectSchema.safeParse(p).success).sort((a, b) => b.updatedAt - a.updatedAt);
}

export const getProject = (id: string) => localStore.get<KbProject>(projectKey(id));

export async function saveProject(project: KbProject) {
  const valid = projectSchema.parse({...project, updatedAt: Date.now()});
  await localStore.set(projectKey(valid.id), valid);
  changed();
  return valid;
}

export async function createProject(name: string) {
  const now = Date.now();
  return saveProject({schema: 1, id: crypto.randomUUID(), name: name.trim().slice(0, 200) || 'Libro', createdAt: now, updatedAt: now, units: {}, assistants: [], imports: []});
}

/** The project a manual unit belongs to; a unit of no project gets no book context. */
export async function projectOfUnit(unitId: string) {
  return (await listProjects()).find(p => unitId in p.units) || null;
}
/** The project a saved assistant brings when the person chooses it. */
export async function projectOfAssistant(assistantId: string) {
  return (await listProjects()).find(p => p.assistants.includes(assistantId)) || null;
}

export async function putSyncedProject(project: KbProject) {
  const parsed = projectSchema.safeParse(project);
  if (parsed.success) await localStore.set(projectKey(parsed.data.id), parsed.data);
}
export const removeSyncedProject = (id: string) => localStore.remove(projectKey(id));

// ---------- Entries ----------

export async function listEntries(project?: string): Promise<KbEntry[]> {
  const prefix = project ? 'kbe:' + project + ':' : 'kbe:';
  const keys = (await localStore.keys()).filter(k => k.startsWith(prefix));
  const items = await Promise.all(keys.map(k => localStore.get<KbEntry>(k)));
  return items.filter((e): e is KbEntry => Boolean(e?.id && e.project));
}

export const getEntry = (project: string, id: string) => localStore.get<KbEntry>(entryStoreKey(project, id));

async function writeEntries(entries: KbEntry[]) {
  for (const e of entries) await localStore.set(entryStoreKey(e.project, e.id), entrySchema.parse(e));
  if (entries.length) changed();
}

/** Saves a change as a new version. Reads the stored entry first, so a stale copy on screen never wins. */
export async function editEntry(project: string, id: string, change: EntryChange, note: string) {
  const current = await getEntry(project, id);
  if (!current) throw Error('NOT_FOUND');
  const next = changeEntry(current, change, note, Date.now());
  if (next !== current) await writeEntries([next]);
  return next;
}

export async function restoreVersion(project: string, id: string, version: number) {
  const current = await getEntry(project, id);
  if (!current) throw Error('NOT_FOUND');
  const next = restoreEntry(current, version, Date.now());
  if (next !== current) await writeEntries([next]);
  return next;
}

/** A new entry written by the author (a proposal, a note, a character without a file). */
export async function addEntry(entry: KbEntry) {
  if (await getEntry(entry.project, entry.id)) throw Error('EXISTS');
  await writeEntries([entry]);
  return entry;
}

export async function putSyncedEntry(entry: KbEntry) {
  const parsed = entrySchema.safeParse(entry);
  if (parsed.success) await localStore.set(entryStoreKey(parsed.data.project, parsed.data.id), parsed.data);
}
export async function removeSyncedEntry(key: string) {
  const at = key.indexOf(':');
  if (at > 0) await localStore.remove(entryStoreKey(key.slice(0, at), key.slice(at + 1)));
}

// ---------- Importing files ----------

/** Pictures of an import: the ones its files bring, the ones named but missing, and the ones that are not what they say. */
export type ImportPictures = {added: number; approved: number; left: string[]; bad: string[]};

/** What importing these files would do, without saving anything. */
export async function previewImport(project: KbProject, files: ImportFile[]) {
  const existing = await listEntries(project.id);
  const known = existing.flatMap(e => e.kind === 'character' ? [{id: e.id.replace(/^char\./, ''), nameRu: e.data.nameRu || e.title, aliases: e.data.aliases}] : []);
  const unitPages = new Map(existing.flatMap(e => e.kind === 'unit' && e.data.pages ? [[e.data.number, e.data.pages] as [number, [number, number]]] : []));
  const plan = planImport(files, known, unitPages);
  // An export's pictures: the files it carries, or the ones this browser or the account already has.
  const {ok, bad} = await unpackFiles(plan.assets);
  const stored = new Map<string, {chunks?: string[]}>([...ok].map(([hash, f]) => [hash, f.chunks ? {chunks: f.chunks} : {}]));
  for (const p of plan.patches) if (p.kind === 'character' && Array.isArray(p.set?.refs)) for (const r of p.set.refs as KbRef[]) {
    if (typeof r?.hash !== 'string' || stored.has(r.hash)) continue;
    const ref = {hash: r.hash, chunks: Array.isArray(r.chunks) ? r.chunks : undefined};
    if (await refBytes(ref).catch(() => null)) stored.set(r.hash, ref.chunks ? {chunks: ref.chunks} : {});
  }
  const {patches, left} = refsWithFiles(plan.patches, stored);
  const {entries, report} = applyPlan(project.id, new Map(existing.map(e => [e.id, e])), patches, Date.now());
  const brought = new Map(entries.flatMap(e => e.kind === 'character' ? e.data.refs.filter(r => ok.has(r.hash)).map(r => [r.hash, r] as const) : []));
  const pictures: ImportPictures = {added: brought.size, approved: [...brought.values()].filter(r => r.review === 'approved').length, left, bad};
  return {plan, entries, report, pictures, files: [...brought.keys()].map(h => ok.get(h)!)};
}

export async function commitImport(project: KbProject, files: ImportFile[]): Promise<{report: ImportReport; saved: number; pictures: ImportPictures}> {
  const {plan, entries, report, pictures, files: pictureFiles} = await previewImport(project, files);
  // The files first: an entry is never saved pointing to a picture this browser does not have.
  await storeUnpacked(pictureFiles);
  await writeEntries(entries);
  const at = Date.now();
  await saveProject({...project, imports: [...project.imports, ...plan.files.map(f => ({file: f.name.slice(0, 300), at, entries: f.patches}))].slice(-200)});
  return {report, saved: entries.length, pictures};
}
