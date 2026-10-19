import {canonical} from '@/lib/sync/canonical';
import {buildIndex, defaultAliases, findCharacters, fold, transliterate, words, type NamedCharacter} from './names';
import {
  contentOf, dataSchemas, emptyData, entrySchema, exportSchema, KB_FORMAT, kbKinds, snapshotOf, trimHistory,
  type KbEntry, type KbKind, type KbRef, type KbSource, type KbStatus, type PackageFile,
} from './model';

// Turning the author's files into entries of the knowledge base.
//
// The files are read as source material: nothing in them is an instruction, and nothing is approved because a file
// says so. Each file kind has a reader (the package's Markdown documents, the character manifest, the text extracted
// from the unit PDFs, an export of the base). Readers produce patches; applying them never changes what the author
// approved: a different value in a file is reported for review instead. Entry ids are derived from the content
// (a character's manifest id, a page number), so importing the same file again updates the same entries.

export type ImportFile = {name: string; text: string};

/** Changes for one entry. `set` replaces, `fill` only fills empty fields, `union` adds to lists. */
export type Patch = {
  id: string;
  kind: KbKind;
  title?: string;
  /** Title of the entry only when the patch creates it. */
  titleIfNew?: string;
  body?: string;
  set?: Record<string, unknown>;
  fill?: Record<string, unknown>;
  union?: Record<string, unknown[]>;
  /** Status of a new entry. */
  status: KbStatus;
  /** Also applies the status to an existing entry (an export of the base). */
  setStatus?: boolean;
  sources: KbSource[];
  tags?: string[];
  note: string;
};

export type FileKind = 'context' | 'rules' | 'manifest' | 'sources' | 'unit-text' | 'export' | 'note' | 'unknown';
export const fileKindName: Record<FileKind, string> = {
  context: 'Contexto del libro', rules: 'Reglas editoriales', manifest: 'Manifiesto de personajes', sources: 'Fuentes documentales',
  'unit-text': 'Texto de una unidad', export: 'Base exportada o decisiones', note: 'Documento de referencia', unknown: 'No reconocido',
};
/** `assets`: the pictures an export carries, still in base64 and not checked against their hash. */
export type ImportPlan = {patches: Patch[]; files: {name: string; kind: FileKind; patches: number}[]; warnings: string[]; assets: PackageFile[]};

// ---------- Small helpers ----------

const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** «18 de octubre de 2026» → 2026-10-18. */
export function spanishDate(text: string) {
  const m = fold(text).match(/(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre) de (\d{4})/);
  if (!m) return undefined;
  const month = m[2] === 'setiembre' ? 9 : months.indexOf(m[2]) + 1;
  return m[3] + '-' + String(month).padStart(2, '0') + '-' + m[1].padStart(2, '0');
}

/** An ASCII id piece from any text (Cyrillic is transliterated). */
export function slug(text: string, max = 48) {
  const s = transliterate(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s.slice(0, max).replace(/-+$/, '') || 'x';
}

const firstWords = (text: string, n: number) => words(text).slice(0, n).join(' ');
const sentence = (text: string, max = 110) => {
  const plain = text.replace(/\*\*|`/g, '').trim();
  const end = plain.search(/[.;](\s|$)/);
  const s = end > 0 && end < max ? plain.slice(0, end) : plain;
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
};

type Section = {level: number; heading: string; lines: string[]};
function sections(text: string): Section[] {
  const out: Section[] = [{level: 0, heading: '', lines: []}];
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) out.push({level: h[1].length, heading: h[2].trim(), lines: []});
    else out.at(-1)!.lines.push(line);
  }
  return out;
}
const bullets = (lines: string[]) => {
  const out: string[] = [];
  for (const line of lines) {
    const b = line.match(/^\s*[-*]\s+(.*)$/);
    if (b) out.push(b[1].trim());
    else if (out.length && /^\s{2,}\S/.test(line)) out[out.length - 1] += ' ' + line.trim();
  }
  return out;
};
const paragraphs = (lines: string[]) => lines.filter(l => !/^\s*[-*]\s+/.test(l) && !/^\s*\|/.test(l)).join('\n').trim();
const sectionText = (lines: string[]) => lines.join('\n').trim();

function table(lines: string[]) {
  const rows = lines.filter(l => /^\s*\|/.test(l)).map(l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
  if (rows.length < 2) return null;
  const head = rows[0].map(fold);
  const body = rows.slice(1).filter(r => !r.every(c => /^:?-{2,}:?$/.test(c)));
  return {head, body};
}

// ---------- Characters in text ----------

const kinship = '(esposo|esposa|padre|madre|padres|hijo|hija|hijos|hermano|hermana|hermanos|abuelo|abuela|abuelos|sobrino|sobrina|tío|tía|tíos|nieto|nieta|nietos|primo|prima)';
const relationPattern = new RegExp('^(?:y\\s+)?(?:su\\s+)?' + kinship + '(\\s+(?:materno|materna|maternos|paterno|paterna|paternos))?\\s+de\\s+(.+)$', 'i');
const clauseBreak = new RegExp('[,;.]\\s*|\\s+y\\s+(?=(?:su\\s+)?' + kinship.replace('(', '(?:') + '\\b)', 'i');

/** Relations written as «esposa de Борис, madre de Коля y Лена»: one per character named after «de». */
export function relationsIn(text: string, index: ReturnType<typeof buildIndex>, self: string) {
  const out: {to: string; label: string}[] = [];
  for (const clause of text.split(clauseBreak)) {
    const m = clause.trim().match(relationPattern);
    if (!m) continue;
    const label = (m[1] + (m[2] || '')).toLowerCase() + ' de';
    for (const to of findCharacters(m[3], index).ids) if (to !== self && !out.some(r => r.to === to && r.label === label)) out.push({to, label});
  }
  return out;
}

/** Characters a text says not to confuse with («No confundir con Лена», «distinta de тётя Галя»). */
export function distinctIn(text: string, index: ReturnType<typeof buildIndex>, self: string) {
  const out: string[] = [];
  const re = /(?:no\s+confundirl[oa]s?\s+con|no\s+confundir\s+con|no\s+la\s+confundas\s+con|no\s+lo\s+confundas\s+con|diferenciarl[oa]s?(?:\s+visualmente)?\s+de|distint[oa]s?\s+de)\s+([^.;,]+)/gi;
  for (const m of text.matchAll(re)) for (const id of findCharacters(m[1], index).ids) if (id !== self && !out.includes(id)) out.push(id);
  return out;
}

// ---------- Readers ----------

type Context = {index: ReturnType<typeof buildIndex>; characters: NamedCharacter[]; dates: Map<string, string>; unitPages: Map<number, [number, number]>};

/** The character manifest of the package: one entry per character, by its manifest id. */
function readManifest(file: ImportFile, list: unknown[], ctx: Context): Patch[] {
  const out: Patch[] = [];
  for (const raw of list) {
    const c = raw as Record<string, unknown>;
    if (typeof c?.id !== 'string' || typeof c.name_ru !== 'string') continue;
    const source = (c.source || {}) as Record<string, unknown>;
    const id = 'char.' + slug(c.id.replace(/-scene$/, ''), 60);
    const description = typeof c.description === 'string' ? c.description : '';
    const kind = typeof c.reference_kind === 'string' ? c.reference_kind : '';
    const date = typeof source.created_at === 'string' ? source.created_at.slice(0, 10) : undefined;
    out.push({
      id, kind: 'character', title: c.name_ru, status: 'observed', note: 'Importado de ' + file.name,
      set: {
        nameRu: c.name_ru,
        role: description.slice(0, 500),
        manifest: {
          id: c.id, asset: typeof c.asset === 'string' ? c.asset : null, sha256: typeof c.sha256 === 'string' && /^[a-f0-9]{64}$/.test(c.sha256) ? c.sha256 : null,
          referenceKind: kind.slice(0, 60), ...(typeof source.name === 'string' ? {sourceName: source.name.slice(0, 300)} : {}), ...(date ? {sourceDate: date} : {}),
          ...(typeof c.approval_status === 'string' ? {approval: c.approval_status.slice(0, 120)} : {}),
        },
        ...(kind === 'missing' || c.asset === null ? {missing: true} : {}),
      },
      fill: {aliases: defaultAliases(c.name_ru)},
      union: {relations: [], distinct: []},
      sources: [{kind: 'manifest', label: file.name + ' · ' + (typeof source.name === 'string' ? source.name : c.id), file: file.name, ...(date ? {date} : {})}],
      tags: kind === 'missing' ? ['sin imagen'] : kind.includes('scene') ? ['solo escena'] : [],
    });
  }
  // Relations and look-alikes in the descriptions, once every character of the manifest is known.
  const index = buildIndex([...ctx.characters, ...out.map(p => ({id: p.id.slice(5), nameRu: p.title!, aliases: (p.fill!.aliases as string[])}))]);
  for (const p of out) {
    const self = p.id.slice(5);
    p.union = {relations: relationsIn(p.set!.role as string, index, self), distinct: distinctIn(p.set!.role as string, index, self)};
  }
  return out;
}

/** The package's context document: identity, story, families, units, rules and limits, by section. */
function readContext(file: ImportFile, ctx: Context): Patch[] {
  const out: Patch[] = [];
  const all = sections(file.text);
  const date = spanishDate(file.text.slice(0, 600));
  const src = (ref: string): KbSource => ({kind: 'file', label: file.name + ' · ' + ref, file: file.name, ref, ...(date ? {date} : {})});
  const note = 'Importado de ' + file.name;
  const seen = new Set<string>();
  const unique = (id: string) => { let v = id, n = 2; while (seen.has(v)) v = id + '-' + n++; seen.add(v); return v; };

  for (const s of all) {
    const h = fold(s.heading);
    if (!s.heading || s.level === 1) continue;
    const text = sectionText(s.lines);
    if (!text) continue;
    if (/proposito|metodolog|pedagog/.test(h)) {
      out.push({id: unique('identity.' + slug(s.heading)), kind: 'identity', title: s.heading, body: text, status: 'observed', sources: [src(s.heading)], note});
    } else if (/^familia|familia de/.test(h)) {
      out.push({id: unique('story.' + slug(s.heading)), kind: 'story', title: s.heading, body: text, status: 'observed', sources: [src(s.heading)], note, tags: ['familia']});
      // Each bullet is about the characters named before its colon.
      const bodies = new Map<string, string[]>();
      // A bullet may hold several statements («Тоби: … . Бублик y Муся: …»).
      for (const b of bullets(s.lines).flatMap(b => b.split(/(?<=\.)\s+(?=[^.:]{1,80}:\s)/))) {
        const colon = b.indexOf(':');
        if (colon < 0) continue;
        const found = findCharacters(b.slice(0, colon), ctx.index);
        for (const id of found.ids) bodies.set(id, [...(bodies.get(id) || []), b]);
      }
      for (const [id, lines] of bodies) {
        const text = lines.join('\n');
        out.push({
          id: 'char.' + id, kind: 'character', body: text, status: 'observed', sources: [src(s.heading)], note,
          union: {relations: relationsIn(lines.map(l => l.slice(l.indexOf(':') + 1)).join('; '), ctx.index, id), distinct: distinctIn(text, ctx.index, id)},
        });
      }
    } else if (/mundo|narrativ|continuidad|escenario/.test(h)) {
      const intro = paragraphs(s.lines);
      if (intro) out.push({id: unique('story.' + slug(s.heading)), kind: 'story', title: s.heading, body: intro, status: 'observed', sources: [src(s.heading)], note});
    } else if (/unidad/.test(h)) {
      const t = table(s.lines);
      const col = (name: RegExp) => t ? t.head.findIndex(c => name.test(c)) : -1;
      const [cUnit, cPages, cTitle, cContent] = [col(/unidad/), col(/pagina/), col(/titulo/), col(/contenido|observ/)];
      for (const row of t?.body || []) {
        const n = Number((row[cUnit] || '').match(/\d+/)?.[0]);
        if (!Number.isInteger(n)) continue;
        const range = (row[cPages] || '').match(/(\d+)\s*[-–]\s*(\d+)/);
        const topics = (row[cContent] || '').split(/;\s*|(?<=[.…])\s+(?=\p{Lu})/u).map(x => x.trim().replace(/\.$/, '')).filter(Boolean);
        const notYet = topics.filter(x => /^no introducir/i.test(x)).map(x => x.replace(/^no introducir\s*/i, '').replace(/\s+en esta unidad$/i, ''));
        const partial = /encontrad|parcial|en desarrollo/i.test(row[cPages] || '');
        const title = (row[cTitle] || '').trim();
        out.push({
          id: 'unit.' + n, kind: 'unit', title: 'Unidad ' + n + (title ? ' · ' + title : ''), status: 'observed', sources: [src(s.heading)], note,
          set: {number: n, title, grammar: topics.filter(x => !/^no introducir/i.test(x)), ...(range ? {pages: [Number(range[1]), Number(range[2])]} : {})},
          union: {notYet},
          tags: partial ? ['parcial'] : [],
        });
        if (range) ctx.unitPages.set(n, [Number(range[1]), Number(range[2])]);
      }
      const rest = paragraphs(s.lines);
      if (rest) out.push({id: unique('note.' + slug(s.heading)), kind: 'note', title: s.heading, body: rest, status: 'observed', sources: [src(s.heading)], note});
    } else if (/regla|estilo|editorial/.test(h)) {
      for (const b of bullets(s.lines)) out.push(rulePatch(b, unique('rule.' + slug(firstWords(b, 6))), src(s.heading), note));
      const rest = paragraphs(s.lines);
      if (rest) out.push({id: unique('note.' + slug(s.heading)), kind: 'note', title: s.heading, body: rest, status: 'observed', sources: [src(s.heading)], note});
    } else {
      // Limits, pending items, how to use the package: kept as notes, one per bullet when there are bullets.
      const bs = bullets(s.lines);
      if (bs.length) for (const b of bs) out.push({id: unique('note.' + slug(firstWords(b, 6))), kind: 'note', title: sentence(b), body: b, status: 'observed', sources: [src(s.heading)], note, tags: [s.heading.slice(0, 60)]});
      const rest = paragraphs(s.lines);
      if (rest || !bs.length) out.push({id: unique('note.' + slug(s.heading)), kind: 'note', title: s.heading, body: rest || text, status: 'observed', sources: [src(s.heading)], note});
    }
  }
  return out;
}

const ruleAreas: [RegExp, string][] = [
  [/pictograma/, 'pictogramas'], [/historieta|bocadillo|vineta/, 'historietas'], [/numeracion|numerad/, 'numeración'],
  [/audio|auricular/, 'audio'], [/pestana|\bpie\b|pincelada|color|verde|rojo|encabezado|abajo a la/, 'diseño'],
  [/consigna|acento|negrita|tamano|tipograf|letra|puntos/, 'tipografía'], [/ruso|ortograf/, 'idioma'],
];
function rulePatch(text: string, id: string, source: KbSource, note: string): Patch {
  const f = fold(text);
  const area = ruleAreas.find(([re]) => re.test(f))?.[1] || 'otro';
  return {id, kind: 'rule', title: sentence(text), body: text, status: 'observed', set: {area}, sources: [source], note};
}

/** A document of editorial rules: one rule per bullet, dated by the document. */
function readRules(file: ImportFile): Patch[] {
  const date = spanishDate(file.text.slice(0, 800));
  const heading = sections(file.text).find(s => s.level === 1)?.heading || file.name;
  const seen = new Set<string>();
  const out: Patch[] = [];
  for (const b of bullets(file.text.split(/\r?\n/))) {
    let id = 'rule.' + slug(firstWords(b, 6)), n = 2;
    while (seen.has(id)) id = 'rule.' + slug(firstWords(b, 6)) + '-' + n++;
    seen.add(id);
    out.push(rulePatch(b, id, {kind: 'file', label: file.name + ' · ' + heading, file: file.name, ...(date ? {date} : {})}, 'Importado de ' + file.name));
  }
  return out;
}

const footer = /^русский код\s*·\s*[aа]1$/;
const audioCode = /^\d{1,2}\.\d{2}$/;
const exerciseNumber = /^\d{1,2}[а-яa-z]?$/;
const readingHeading = /^(давай\s+)?(прочитаем|читаем)[.!]?$/;

/** Text extracted from a unit PDF («FUENTE: …», then «## Página del archivo N»): one entry per page of the book. */
function readUnitText(file: ImportFile, ctx: Context): {patches: Patch[]; warnings: string[]} {
  const lines = file.text.replace(/\r\n?/g, '\n').split('\n');
  const pdf = (lines[0].match(/^FUENTE:\s*(.+)$/)?.[1] || file.name).trim();
  const warnings: string[] = [];
  const unitMatch = pdf.match(/unidad[_\s-]*(\d+)/i) || file.text.match(/Уро\u0301?к\s*(\d+)/i);
  const unit = unitMatch ? Number(unitMatch[1]) : NaN;
  if (!Number.isInteger(unit)) return {patches: [], warnings: ['«' + file.name + '»: no se encontró el número de unidad.']};
  const titleLine = lines.map(l => l.trim()).find(l => /^урок\s*\d+\.\s*\S/.test(fold(l)));
  const unitTitle = titleLine ? titleLine.replace(/^\S+\s*\d+\.\s*/, '').trim() : '';
  const named = pdf.match(/pagina[s]?[_\s-]*(\d+)(?:[_\s-]+(\d+))?/i);
  const start = named ? Number(named[1]) : ctx.unitPages.get(unit)?.[0];
  const date = ctx.dates.get(fold(pdf).replace(/\(\d+\)/g, '').replace(/\s+/g, ''));

  const pages: {index: number; lines: string[]}[] = [];
  for (const line of lines) {
    const m = line.match(/^##\s+Página del archivo\s+(\d+)/i);
    if (m) pages.push({index: Number(m[1]), lines: []});
    else pages.at(-1)?.lines.push(line);
  }
  const patches: Patch[] = [];
  let previous: number | null = null;
  const numbers: number[] = [];
  for (const page of pages) {
    const ls = page.lines.map(l => l.trim());
    const candidates: {line: number; value: number}[] = [];
    ls.forEach((l, i) => { if (footer.test(fold(l)) && /^\d{1,3}$/.test(ls[i + 1] || '')) candidates.push({line: i + 1, value: Number(ls[i + 1])}); });
    const expected: number | null = start !== undefined ? start + page.index - 1 : previous !== null ? previous + 1 : null;
    const chosen: {line: number; value: number} | null = candidates.find(c => c.value === expected) || (candidates.length ? candidates.reduce((a, b) => b.value > a.value ? b : a) : null);
    const number: number | null = chosen?.value ?? expected;
    if (number === null || number === undefined) { warnings.push('«' + file.name + '», página del archivo ' + page.index + ': sin número de página.'); continue; }
    previous = number;
    numbers.push(number);
    const exercises: {number: string; audio?: string; instruction: string}[] = [];
    const audios: string[] = [];
    let reading: string | undefined;
    ls.forEach((l, i) => {
      if (audioCode.test(l) && l.startsWith(unit + '.') && !audios.includes(l)) audios.push(l);
      if (readingHeading.test(fold(l))) reading = l;
      if (i === chosen?.line || i === ls.length - 1 || !exerciseNumber.test(l)) return;
      const next = ls.slice(i + 1).filter(Boolean);
      const audio = audioCode.test(next[0] || '') ? next[0] : undefined;
      const instruction = (audio ? next[1] : next[0]) || '';
      if (!audio && !/[а-яa-z]$/.test(l)) return;
      if (!instruction || exerciseNumber.test(instruction) || audioCode.test(instruction)) return;
      exercises.push({number: l, ...(audio ? {audio} : {}), instruction: instruction.slice(0, 400)});
    });
    const text = ls.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    patches.push({
      id: 'page.' + number, kind: 'page', title: 'Página ' + number + ' · Unidad ' + unit, status: 'observed',
      set: {number, unit, text: text.slice(0, 30000), audios, exercises: exercises.slice(0, 40), ...(reading ? {reading} : {}), characters: findCharacters(text, ctx.index).ids.slice(0, 40)},
      sources: [{kind: 'extraction', label: 'Texto extraído de ' + pdf, file: pdf, ref: 'página del archivo ' + page.index + (chosen ? '' : ' (número deducido)'), ...(date ? {date} : {})}],
      note: 'Importado de ' + file.name,
      tags: chosen ? [] : ['número deducido'],
    });
  }
  if (numbers.length) {
    patches.push({
      id: 'unit.' + unit, kind: 'unit', titleIfNew: 'Unidad ' + unit + (unitTitle ? ' · ' + unitTitle : ''), status: 'observed',
      fill: {number: unit, title: unitTitle, pages: [Math.min(...numbers), Math.max(...numbers)]},
      sources: [{kind: 'extraction', label: 'Texto extraído de ' + pdf, file: pdf, ...(date ? {date} : {})}],
      note: 'Importado de ' + file.name,
    });
  }
  return {patches, warnings};
}

/** An export of a base (or decisions prepared in the same format): entries as they are, with their status. */
function readExport(file: ImportFile, value: unknown): {patches: Patch[]; warnings: string[]; assets: PackageFile[]} {
  const parsed = exportSchema.safeParse(value);
  if (!parsed.success) return {patches: [], warnings: ['«' + file.name + '» no tiene el formato ' + KB_FORMAT + '.'], assets: []};
  return {
    warnings: [],
    assets: parsed.data.files || [],
    patches: parsed.data.entries.map(e => ({
      id: e.id, kind: e.kind, title: e.title, body: e.body, status: e.status, setStatus: true,
      set: e.data && typeof e.data === 'object' ? e.data as Record<string, unknown> : {},
      sources: e.sources.length ? e.sources : [{kind: 'file', label: file.name, file: file.name}], tags: e.tags, note: 'Importado de ' + file.name,
    })),
  };
}

export function detect(file: ImportFile): FileKind {
  const name = file.name.toLowerCase();
  const text = file.text.trimStart();
  if (name.endsWith('.json') || text.startsWith('{') || text.startsWith('[')) {
    try {
      const v = JSON.parse(text);
      if (Array.isArray(v) && v.some(x => x && typeof x.id === 'string' && typeof x.name_ru === 'string')) return 'manifest';
      if (v && typeof v === 'object' && v.format === KB_FORMAT) return 'export';
      if (v && typeof v === 'object' && Array.isArray(v.character_files)) return 'sources';
    } catch {}
    return 'unknown';
  }
  if (/^FUENTE:/m.test(text.slice(0, 200)) && /^##\s+Página del archivo/m.test(text)) return 'unit-text';
  if (/^##\s+(propósito|mundo narrativo|unidades)/im.test(text)) return 'context';
  if (/reglas editoriales/.test(fold(text.slice(0, 400)))) return 'rules';
  if (/\.(md|txt)$/.test(name)) return 'note';
  return 'unknown';
}

/** Reads every file of an import together: the manifest first, so the other files can find its characters. */
export function planImport(files: ImportFile[], known: NamedCharacter[], unitPages: Map<number, [number, number]> = new Map()): ImportPlan {
  const kinds = files.map(f => ({file: f, kind: detect(f)}));
  const order: FileKind[] = ['sources', 'manifest', 'export', 'context', 'rules', 'unit-text', 'note', 'unknown'];
  kinds.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  const ctx: Context = {characters: [...known], index: buildIndex(known), dates: new Map(), unitPages: new Map(unitPages)};
  const plan: ImportPlan = {patches: [], files: [], warnings: [], assets: []};
  const learn = (patches: Patch[]) => {
    for (const p of patches) if (p.kind === 'character' && p.title) {
      const id = p.id.slice(5);
      const aliases = [...((p.fill?.aliases as string[]) || []), ...((p.set?.aliases as string[]) || [])];
      ctx.characters = [...ctx.characters.filter(c => c.id !== id), {id, nameRu: p.title, aliases}];
    }
    ctx.index = buildIndex(ctx.characters);
  };
  for (const {file, kind} of kinds) {
    let patches: Patch[] = [];
    if (kind === 'manifest') patches = readManifest(file, JSON.parse(file.text), ctx);
    else if (kind === 'sources') {
      const v = JSON.parse(file.text) as {character_files?: unknown[]; units?: {name?: string; created_at?: string}[]};
      for (const u of v.units || []) if (typeof u?.name === 'string' && typeof u.created_at === 'string') ctx.dates.set(fold(u.name).replace(/\(\d+\)/g, '').replace(/\s+/g, ''), u.created_at.slice(0, 10));
      patches = readManifest(file, v.character_files || [], ctx);
      const list = (v.units || []).filter(u => typeof u?.name === 'string').map(u => '- ' + u.name + (u.created_at ? ' (' + u.created_at.slice(0, 10) + ')' : ''));
      if (list.length) patches.push({id: 'note.' + slug(file.name.replace(/\.json$/i, '')), kind: 'note', title: 'Archivos de unidades consultados', body: list.join('\n'), status: 'observed', sources: [{kind: 'file', label: file.name, file: file.name}], note: 'Importado de ' + file.name});
    } else if (kind === 'export') {
      const r = readExport(file, JSON.parse(file.text));
      patches = r.patches; plan.warnings.push(...r.warnings); plan.assets.push(...r.assets);
    } else if (kind === 'context') patches = readContext(file, ctx);
    else if (kind === 'rules') patches = readRules(file);
    else if (kind === 'unit-text') {
      const r = readUnitText(file, ctx);
      patches = r.patches; plan.warnings.push(...r.warnings);
    } else if (kind === 'note') {
      const title = sections(file.text).find(s => s.level === 1)?.heading || file.name;
      patches = [{id: 'note.' + slug(file.name.replace(/\.(md|txt)$/i, '')), kind: 'note', title: title.slice(0, 300), body: file.text.slice(0, 60000), status: 'observed', sources: [{kind: 'file', label: file.name, file: file.name, ...(spanishDate(file.text.slice(0, 800)) ? {date: spanishDate(file.text.slice(0, 800))} : {})}], note: 'Importado de ' + file.name}];
    } else plan.warnings.push('«' + file.name + '» no es un archivo que la base sepa leer.');
    learn(patches);
    plan.patches.push(...patches);
    plan.files.push({name: file.name, kind, patches: patches.length});
  }
  if (!plan.patches.some(p => p.kind === 'character') && !known.length && plan.patches.some(p => p.kind === 'page')) {
    plan.warnings.push('No hay personajes en la base: importá también el manifiesto de personajes para reconocerlos en las páginas.');
  }
  return plan;
}

/**
 * The pictures an export names, kept only when their file is stored or comes in the export (`stored`, by hash, with
 * the parts a large file is kept in): a reference to a file nobody has is left out, and so is a main picture without it.
 */
export function refsWithFiles(patches: Patch[], stored: Map<string, {chunks?: string[]}>) {
  const left: string[] = [];
  const out = patches.map(p => {
    if (p.kind !== 'character' || !Array.isArray(p.set?.refs)) return p;
    const refs = (p.set.refs as KbRef[]).flatMap(r => {
      const file = r && typeof r.hash === 'string' ? stored.get(r.hash) : undefined;
      if (!file) { left.push(typeof r?.name === 'string' ? r.name : '?'); return []; }
      const {chunks: _, ...rest} = r;
      return [{...rest, ...(file.chunks ? {chunks: file.chunks} : {})}];
    });
    const set: Record<string, unknown> = {...p.set, refs};
    if (typeof set.mainRef === 'string' && !refs.some(r => r.hash === set.mainRef && r.review === 'approved')) delete set.mainRef;
    return {...p, set};
  });
  return {patches: out, left};
}

// ---------- Applying a plan ----------

const empty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v as object).length);
const same = (a: unknown, b: unknown) => canonical(a ?? null) === canonical(b ?? null);
const unionOf = (a: unknown[], b: unknown[]) => { const out = [...a]; for (const x of b) if (!out.some(y => same(x, y))) out.push(x); return out; };
const fieldName: Record<string, string> = {title: 'título', body: 'texto', status: 'estado'};

export type ImportReport = {
  created: string[];
  updated: string[];
  unchanged: string[];
  /** Approved entries a file disagrees with: nothing was changed in them. */
  kept: {id: string; title: string; fields: string[]; file: string}[];
  invalid: {id: string; reason: string}[];
};

/** Applies the patches to the entries of a project. Returns the entries to save; approved content never changes. */
export function applyPlan(project: string, existing: Map<string, KbEntry>, patches: Patch[], now: number) {
  const work = new Map(existing);
  const touched = new Set<string>();
  const report: ImportReport = {created: [], updated: [], unchanged: [], kept: [], invalid: []};
  const before = new Map([...existing].map(([id, e]) => [id, canonical(contentOf(e))]));
  for (const p of patches) {
    if (!kbKinds.includes(p.kind)) { report.invalid.push({id: p.id, reason: 'tipo desconocido'}); continue; }
    const current = work.get(p.id);
    if (current && current.kind !== p.kind) { report.invalid.push({id: p.id, reason: 'ya existe como ' + current.kind}); continue; }
    const base: KbEntry = current || {
      schema: 1, project, id: p.id, kind: p.kind, title: p.title || p.titleIfNew || p.id, body: '', status: p.status, data: emptyData(p.kind),
      sources: [], tags: [], version: 1, createdAt: now, updatedAt: now, note: p.note, history: [],
    } as KbEntry;
    const locked = existing.get(p.id)?.status === 'approved';
    const kept: string[] = [];
    const next = {...base, data: {...(base.data as Record<string, unknown>)}} as KbEntry & {data: Record<string, unknown>};
    const change = (field: 'title' | 'body', value: string | undefined) => {
      if (value === undefined || value === next[field]) return;
      if (locked && !empty(next[field])) kept.push(fieldName[field]); else next[field] = value;
    };
    change('title', p.title);
    change('body', p.body);
    for (const [k, v] of Object.entries(p.set || {})) {
      if (same(next.data[k], v)) continue;
      if (locked && !empty(next.data[k])) kept.push(k); else next.data[k] = v;
    }
    // A new entry starts from empty data (unit 0, no title): what a file fills in is its first value.
    for (const [k, v] of Object.entries(p.fill || {})) if ((!current || empty(next.data[k])) && !empty(v)) next.data[k] = v;
    for (const [k, v] of Object.entries(p.union || {})) {
      const have = Array.isArray(next.data[k]) ? next.data[k] as unknown[] : [];
      // «madre de Света» and «padres de Света» say the same: the first relation found with someone is kept.
      const fresh = k === 'relations' ? (v as {to: string}[]).filter(r => !(have as {to: string}[]).some(h => h.to === r.to)) : v;
      const merged = unionOf(have, fresh);
      if (same(merged, next.data[k])) continue;
      if (locked) kept.push(k); else next.data[k] = merged;
    }
    if (current && p.setStatus && p.status !== next.status) { if (locked) kept.push(fieldName.status); else next.status = p.status; }
    if (!kept.length) next.sources = unionOf(next.sources, p.sources).slice(-20) as KbSource[];
    next.tags = unionOf(next.tags, p.tags || []).slice(0, 30) as string[];
    if (kept.length) report.kept.push({id: p.id, title: next.title, fields: [...new Set(kept)], file: p.note.replace(/^Importado de /, '')});
    const data = dataSchemas[p.kind].safeParse({...emptyData(p.kind), ...next.data});
    const parsed = data.success ? entrySchema.safeParse({...next, data: data.data}) : data;
    if (!parsed.success) { report.invalid.push({id: p.id, reason: parsed.error.issues[0]?.path.join('.') + ': ' + (parsed.error.issues[0]?.message || 'datos inválidos')}); continue; }
    work.set(p.id, parsed.data);
    touched.add(p.id);
  }
  const entries: KbEntry[] = [];
  for (const id of touched) {
    const now2 = work.get(id)!;
    const old = existing.get(id);
    if (!old) { entries.push({...now2, version: 1, createdAt: now, updatedAt: now, history: []}); report.created.push(id); continue; }
    if (before.get(id) === canonical(contentOf(now2)) && same(now2.tags, old.tags)) { report.unchanged.push(id); continue; }
    entries.push({...now2, version: old.version + 1, updatedAt: now, note: patches.find(p => p.id === id)?.note || 'Importado', history: trimHistory([...old.history, snapshotOf(old)])});
    report.updated.push(id);
  }
  return {entries, report};
}
