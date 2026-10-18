import {z} from 'zod';

// The knowledge base of a book project (PDF Studio → Libro).
//
// Every fact is an entry with its sources, version, date and status. Being in a file is not an approval: what is
// imported comes in as «observado» (seen in a file) or «pendiente» (a decision to make), and only the author marks
// it «aprobado». Entries are never deleted: a replaced fact becomes «sustituido», and every change keeps the previous
// version in the entry's history so it can be restored.
//
// The content of the base is the author's material: it lives in their account (synced records), never in the code.

export const kbStatuses = ['approved', 'observed', 'proposed', 'pending', 'superseded'] as const;
export type KbStatus = (typeof kbStatuses)[number];
export const statusName: Record<KbStatus, string> = {
  approved: 'Aprobado', observed: 'Observado en un archivo', proposed: 'Propuesto', pending: 'Pendiente', superseded: 'Sustituido',
};

export const kbKinds = ['identity', 'character', 'story', 'unit', 'page', 'rule', 'decision', 'note'] as const;
export type KbKind = (typeof kbKinds)[number];
export const kindName: Record<KbKind, string> = {
  identity: 'Identidad y pedagogía', character: 'Personaje', story: 'Continuidad y escenarios', unit: 'Unidad', page: 'Página',
  rule: 'Regla editorial', decision: 'Decisión o contradicción', note: 'Nota',
};

const num = z.number().finite();
const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const entryIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,99}$/);
const short = (n: number) => z.string().max(n);

/** Where a fact comes from. `author`: said by the author; `file`: a document; `extraction`: text read from a PDF. */
export const sourceSchema = z.object({
  kind: z.enum(['author', 'file', 'extraction', 'manifest', 'studio']),
  label: short(300),
  file: short(300).optional(),
  /** Section, page or line inside the file. */
  ref: short(200).optional(),
  /** Date of the source (ISO), when the file says it. */
  date: short(40).optional(),
}).strict();
export type KbSource = z.infer<typeof sourceSchema>;

/** A picture or sheet of a character, stored once by its hash. Big files are kept in parts (`chunks`). */
export const refSchema = z.object({
  hash: sha,
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']),
  name: short(300),
  size: z.number().int().positive(),
  kind: z.enum(['sheet', 'scene', 'turnaround', 'pdf-sheet', 'other']),
  /** The author's review of this file. Only `approved` files are sent to image models as the character. */
  review: z.enum(['approved', 'observed', 'rejected']),
  /** Checked against the hash of the package manifest. */
  verified: z.enum(['manifest', 'mismatch', 'unlisted']),
  /** Parts of a file over the size of one stored file, in order. */
  chunks: z.array(sha).max(16).optional(),
  addedAt: num,
  note: short(500).optional(),
}).strict();
export type KbRef = z.infer<typeof refSchema>;

export const relationSchema = z.object({to: short(60), label: short(120)}).strict();

export const characterDataSchema = z.object({
  nameRu: short(120),
  /** Forms to find the character in a request or a page («Галя», «тётя Галя», «Aunt Galya»). */
  aliases: z.array(short(80)).max(40),
  /** Characters easy to confuse with this one; kept apart in prompts. */
  distinct: z.array(short(60)).max(20),
  role: short(500).optional(),
  /** Confirmed appearance: face, hair, build, age. What text models receive instead of pictures. */
  look: short(2000).optional(),
  relations: z.array(relationSchema).max(40),
  refs: z.array(refSchema).max(40),
  /** Hash of the reference sent to image models; one of the approved refs. */
  mainRef: sha.optional(),
  /** What the package manifest says about the file of this character. */
  manifest: z.object({
    id: short(60), asset: short(200).nullable(), sha256: sha.nullable(), referenceKind: short(60),
    sourceName: short(300).optional(), sourceDate: short(40).optional(), approval: short(120).optional(),
  }).strict().optional(),
  /** No verified picture exists: nobody may generate one and call it canonical. */
  missing: z.boolean().optional(),
}).strict();
export type CharacterData = z.infer<typeof characterDataSchema>;

export const unitDataSchema = z.object({
  number: z.number().int().min(0).max(99),
  title: short(200),
  /** First and last page of the book, as found. */
  pages: z.tuple([z.number().int(), z.number().int()]).optional(),
  goal: short(2000).optional(),
  /** Grammar and topics taught in the unit, as the sources describe them. */
  grammar: z.array(short(300)).max(40),
  /** Communicative expressions used as blocks before their grammar is explained. */
  expressions: z.array(short(300)).max(60),
  /** Grammar that must not appear yet (unit 1: possessives). */
  notYet: z.array(short(300)).max(20),
}).strict();
export type UnitData = z.infer<typeof unitDataSchema>;

export const exerciseRefSchema = z.object({number: short(10), audio: short(12).optional(), instruction: short(400)}).strict();
export const pageDataSchema = z.object({
  number: z.number().int().min(0).max(999),
  unit: z.number().int().min(0).max(99),
  /** Text extracted from the PDF: reading order, columns and bubbles may be lost. */
  text: short(30000),
  audios: z.array(short(12)).max(60),
  exercises: z.array(exerciseRefSchema).max(40),
  /** Heading of the closing reading, when the page has one («Читаем», «Дава́й прочита́ем»). */
  reading: short(80).optional(),
  characters: z.array(short(60)).max(40),
}).strict();
export type PageData = z.infer<typeof pageDataSchema>;

export const decisionDataSchema = z.object({
  area: z.enum(['imagen', 'historia', 'editorial', 'ruso', 'técnica']),
  question: short(1000),
  options: z.array(z.object({id: short(40), label: short(500)}).strict()).max(8),
  /** The option suggested by whoever opened the decision; not a choice. */
  proposal: short(40).optional(),
  /** The author's choice, once made (the entry is then approved). */
  chosen: short(40).optional(),
  /** Entries this decision changes once made. */
  affects: z.array(entryIdSchema).max(40),
}).strict();
export type DecisionData = z.infer<typeof decisionDataSchema>;

export const ruleDataSchema = z.object({
  area: z.enum(['diseño', 'tipografía', 'audio', 'pictogramas', 'historietas', 'idioma', 'numeración', 'pedagogía', 'otro']),
  /** Applies only to this unit; absent means the whole book. */
  unit: z.number().int().min(0).max(99).optional(),
}).strict();

const common = {
  schema: z.literal(1),
  project: short(80).min(1),
  id: entryIdSchema,
  title: short(300).min(1),
  body: short(60000),
  status: z.enum(kbStatuses),
  sources: z.array(sourceSchema).max(20),
  tags: z.array(short(60)).max(30),
  version: z.number().int().min(1),
  createdAt: num,
  updatedAt: num,
  /** Why this version exists: «Importado de …», «Editado», «Aprobado», «Restaurada la versión 2». */
  note: short(300),
};

/** A previous version of an entry, as it was. */
export const snapshotSchema = z.object({
  version: z.number().int().min(1),
  at: num,
  status: z.enum(kbStatuses),
  title: short(300),
  body: short(60000),
  data: z.unknown(),
  sources: z.array(sourceSchema).max(20),
  note: short(300),
}).strict();
export type KbSnapshot = z.infer<typeof snapshotSchema>;
export const MAX_HISTORY = 60;
const history = z.array(snapshotSchema).max(MAX_HISTORY);

export const dataSchemas = {
  identity: z.object({}).strict(),
  character: characterDataSchema,
  story: z.object({}).strict(),
  unit: unitDataSchema,
  page: pageDataSchema,
  rule: ruleDataSchema,
  decision: decisionDataSchema,
  note: z.object({}).strict(),
} as const;

export const entrySchema = z.discriminatedUnion('kind', [
  z.object({...common, kind: z.literal('identity'), data: dataSchemas.identity, history}).strict(),
  z.object({...common, kind: z.literal('character'), data: dataSchemas.character, history}).strict(),
  z.object({...common, kind: z.literal('story'), data: dataSchemas.story, history}).strict(),
  z.object({...common, kind: z.literal('unit'), data: dataSchemas.unit, history}).strict(),
  z.object({...common, kind: z.literal('page'), data: dataSchemas.page, history}).strict(),
  z.object({...common, kind: z.literal('rule'), data: dataSchemas.rule, history}).strict(),
  z.object({...common, kind: z.literal('decision'), data: dataSchemas.decision, history}).strict(),
  z.object({...common, kind: z.literal('note'), data: dataSchemas.note, history}).strict(),
]);
export type KbEntry = z.infer<typeof entrySchema>;
export type EntryOf<K extends KbKind> = Extract<KbEntry, {kind: K}>;

/** A book project: its name, the manual units that belong to it and the assistants that bring its context. */
export const projectSchema = z.object({
  schema: z.literal(1),
  id: short(80).min(1).regex(/^[A-Za-z0-9_-]+$/),
  name: short(200).min(1),
  createdAt: num,
  updatedAt: num,
  /** Manual units (PDF Studio → Manual) of this book, by unit id, with their unit number in the book. */
  units: z.record(short(80), z.number().int().min(0).max(99)),
  /** Saved assistants that bring this book's context when the person chooses them on purpose. */
  assistants: z.array(short(80)).max(20),
  /** Files imported, to tell the person what is already in the base. */
  imports: z.array(z.object({file: short(300), at: num, entries: z.number().int().min(0)}).strict()).max(200),
}).strict();
export type KbProject = z.infer<typeof projectSchema>;

/** The file format of an export of the base, and of decisions prepared for import. */
export const KB_FORMAT = 'russkiy-kod-kb@1';
export const exportEntrySchema = z.object({
  id: entryIdSchema,
  kind: z.enum(kbKinds),
  title: short(300).min(1),
  body: short(60000).default(''),
  status: z.enum(kbStatuses),
  data: z.unknown().optional(),
  sources: z.array(sourceSchema).max(20).default([]),
  tags: z.array(short(60)).max(30).default([]),
}).strict();
export type ExportEntry = z.infer<typeof exportEntrySchema>;
export const exportSchema = z.object({
  format: z.literal(KB_FORMAT),
  project: short(200).optional(),
  exported: short(40).optional(),
  entries: z.array(exportEntrySchema).max(5000),
}).strict();

/** Empty data for a kind, so an entry can be created before its fields are known. */
export function emptyData<K extends KbKind>(kind: K): EntryOf<K>['data'] {
  const empty: {[k in KbKind]: unknown} = {
    identity: {}, story: {}, note: {},
    character: {nameRu: '', aliases: [], distinct: [], relations: [], refs: []},
    unit: {number: 0, title: '', grammar: [], expressions: [], notYet: []},
    page: {number: 0, unit: 0, text: '', audios: [], exercises: [], characters: []},
    rule: {area: 'otro'},
    decision: {area: 'editorial', question: '', options: [], affects: []},
  };
  return empty[kind] as EntryOf<K>['data'];
}

/** The content of an entry that a version is about (what is compared and restored). */
export const contentOf = (e: Pick<KbSnapshot, 'status' | 'title' | 'body' | 'data' | 'sources'>) => ({status: e.status, title: e.title, body: e.body, data: e.data, sources: e.sources});

export const snapshotOf = (e: KbEntry): KbSnapshot => ({version: e.version, at: e.updatedAt, status: e.status, title: e.title, body: e.body, data: e.data, sources: e.sources, note: e.note});

/** Keeps the first version (the import) and the most recent ones when the history is full. */
export function trimHistory(list: KbSnapshot[]) {
  return list.length <= MAX_HISTORY ? list : [list[0], ...list.slice(list.length - MAX_HISTORY + 1)];
}

/** Sync key of an entry: one record per entry, so two computers editing different facts never conflict. */
export const entryKey = (project: string, id: string) => project + ':' + id;
