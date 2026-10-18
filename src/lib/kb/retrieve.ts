import {buildIndex, findCharacters, fold, tokens} from './names';
import {knownText, knownUntil} from './progress';
import {statusName, type EntryOf, type KbEntry, type KbKind, type KbStatus} from './model';

// The part of the knowledge base a request needs, as source material for the model.
//
// Nothing here is an instruction: each item says what it is, its status and where it comes from, and the server
// wraps the whole set as book data apart from the author's request. A request gets the book's identity and rules, the
// active unit with what the student has met up to the page, the page itself, the characters it names (with the ones
// easy to confuse with them), and the open decisions about any of those. The rest is left out.

export type BookTask = {
  /** What the author asked, in their words. */
  query: string;
  unit?: number;
  page?: number;
  /** Text of the page or block the author is working on, to find who is in it. */
  context?: string;
  /** Characters chosen on purpose (ids without «char.»). */
  characters?: string[];
  /** Upper bound of the text sent, in characters. */
  budget?: number;
};

export type BookItem = {id: string; kind: KbKind; title: string; status: KbStatus; source: string; text: string};
export type BookContext = {
  items: BookItem[];
  unit?: number;
  page?: number;
  characters: string[];
  ambiguous: {alias: string; ids: string[]}[];
  /** Characters without a verified picture among the ones named. */
  missingPictures: string[];
  omitted: number;
};

export const BOOK_BUDGET = 24_000;
const label = (s: KbStatus) => statusName[s].toLowerCase();
const sourceOf = (e: KbEntry) => e.sources.map(s => s.label + (s.date ? ' (' + s.date + ')' : '')).slice(0, 3).join('; ') || 'escrito en el estudio';
const stop = new Set(fold('el la los las un una unos unas de del al y o en con por para que se lo le les su sus es son un una este esta estos estas ese esa mas más muy como qué que cual cuál hasta desde sobre entre the and of to in for a an is are это и в на не что как').split(' '));

function characterText(c: EntryOf<'character'>, names: Map<string, string>) {
  const d = c.data;
  const lines = [c.body.trim()];
  if (d.role && !c.body.includes(d.role)) lines.push('Manifiesto: ' + d.role);
  lines.push(d.look ? 'Descripción confirmada: ' + d.look : 'Sin descripción de apariencia confirmada por el autor.');
  if (d.relations.length) lines.push('Relaciones: ' + d.relations.map(r => r.label + ' ' + (names.get(r.to) || r.to)).join('; '));
  if (d.distinct.length) lines.push('No confundir con: ' + d.distinct.map(id => names.get(id) || id).join(', '));
  if (d.aliases.length) lines.push('Alias: ' + d.aliases.join(', '));
  const main = d.refs.find(r => r.hash === d.mainRef);
  lines.push(d.missing && !main ? 'No tiene imagen verificada: no inventar una ni presentarla como canónica.' : main ? 'Imagen principal aprobada: ' + main.name + '.' : 'Sin imagen principal aprobada.');
  return lines.filter(Boolean).join('\n');
}

function decisionText(d: EntryOf<'decision'>) {
  const chosen = d.data.options.find(o => o.id === d.data.chosen);
  if (chosen) return d.data.question + '\nDecidido por el autor: ' + chosen.label;
  return d.data.question + '\nOpciones: ' + d.data.options.map(o => '«' + o.label + '»').join(' / ') + '\nTodavía no decidido: no tratar ninguna opción como un hecho.';
}

function itemOf(e: KbEntry, names: Map<string, string>): BookItem {
  const text = e.kind === 'character' ? characterText(e, names)
    : e.kind === 'decision' ? decisionText(e)
    : e.kind === 'unit' ? [
      'Unidad ' + e.data.number + (e.data.title ? ' «' + e.data.title + '»' : '') + (e.data.pages ? ', páginas ' + e.data.pages[0] + '–' + e.data.pages[1] : ''),
      e.data.goal ? 'Objetivo: ' + e.data.goal : '',
      e.data.grammar.length ? 'Gramática y temas: ' + e.data.grammar.join('; ') : '',
      e.data.expressions.length ? 'Expresiones sin explicación formal: ' + e.data.expressions.join('; ') : '',
      e.data.notYet.length ? 'No introducir todavía: ' + e.data.notYet.join('; ') : '',
      e.body,
    ].filter(Boolean).join('\n')
    : e.kind === 'page' ? [
      'Página ' + e.data.number + ' (unidad ' + e.data.unit + '). Texto extraído del PDF: puede faltar el orden de lectura, los bocadillos o acentos.',
      e.data.exercises.length ? 'Ejercicios: ' + e.data.exercises.map(x => x.number + (x.audio ? ' [' + x.audio + ']' : '') + ' ' + x.instruction).join(' | ') : '',
      e.data.reading ? 'Lectura: ' + e.data.reading : '',
      e.data.text,
      e.body,
    ].filter(Boolean).join('\n')
    : e.body;
  return {id: e.id, kind: e.kind, title: e.title, status: e.status, source: sourceOf(e), text: text.trim()};
}

/** The unit and page a request names («unidad 3», «página 15», «pág. 9»), when it names them. */
export function placeIn(query: string) {
  const q = fold(query);
  const unit = q.match(/\b(?:unidad|урок|unit)\s*(\d{1,2})\b/)?.[1];
  const page = q.match(/\b(?:pagina|pag\.?|страница|page)\s*(\d{1,3})\b/)?.[1];
  return {...(unit ? {unit: Number(unit)} : {}), ...(page ? {page: Number(page)} : {})};
}

/** Picks and orders what the request needs, within the budget. Superseded entries are never sent. */
export function retrieve(entries: KbEntry[], task: BookTask): BookContext {
  const live = entries.filter(e => e.status !== 'superseded');
  const chars = live.filter((e): e is EntryOf<'character'> => e.kind === 'character');
  const names = new Map(chars.map(c => [c.id.replace(/^char\./, ''), c.title]));
  const index = buildIndex(chars.map(c => ({id: c.id.replace(/^char\./, ''), nameRu: c.data.nameRu || c.title, aliases: c.data.aliases})));
  const named = task.query.trim() ? placeIn(task.query) : {};
  const pageEntry = (n?: number) => n === undefined ? undefined : live.find((e): e is EntryOf<'page'> => e.kind === 'page' && e.data.number === n);
  const page = named.page ?? task.page;
  const unit = named.unit ?? (named.page !== undefined ? pageEntry(named.page)?.data.unit : undefined) ?? task.unit ?? pageEntry(page)?.data.unit;

  const inQuery = findCharacters(task.query, index);
  const inContext = findCharacters([task.context || '', pageEntry(page)?.data.text || ''].join('\n'), index);
  const wanted = [...new Set([...(task.characters || []), ...inQuery.ids, ...inContext.ids])];
  // Look-alikes come along so the model can tell them apart, after the ones named.
  const lookAlikes = wanted.flatMap(id => chars.find(c => c.id === 'char.' + id)?.data.distinct || []).filter(id => !wanted.includes(id));
  const ambiguous = [...inQuery.ambiguous];
  const ambiguousIds = ambiguous.flatMap(a => a.ids).filter(id => !wanted.includes(id) && !lookAlikes.includes(id));

  const picked: KbEntry[] = [];
  const add = (e: KbEntry | undefined) => { if (e && !picked.includes(e)) picked.push(e); };
  for (const e of live) if (e.kind === 'identity') add(e);
  for (const id of [...wanted, ...ambiguousIds, ...lookAlikes]) add(chars.find(c => c.id === 'char.' + id));
  add(live.find(e => e.kind === 'unit' && e.data.number === unit));
  add(pageEntry(page));
  const related = new Set([...picked.map(e => e.id), ...(unit !== undefined ? ['unit.' + unit] : [])]);
  for (const e of live) if (e.kind === 'decision' && (e.data.affects.some(a => related.has(a)) || e.data.affects.some(a => a.startsWith('page.') && Number(a.slice(5)) === page))) add(e);
  for (const e of live) if (e.kind === 'rule' && (e.data.unit === undefined || e.data.unit === unit)) add(e);
  // Stories and notes that share words with the request.
  const words = new Set(tokens(task.query).filter(w => w.length > 3 && !stop.has(w)));
  const score = (e: KbEntry) => { const t = new Set(tokens(e.title + ' ' + e.body)); let n = 0; for (const w of words) if (t.has(w)) n++; return n; };
  const extra = live.filter(e => (e.kind === 'story' || e.kind === 'note' || e.kind === 'decision') && !picked.includes(e))
    .map(e => ({e, s: score(e) + (e.kind === 'story' && wanted.some(id => e.body.includes(names.get(id) || '\u0000')) ? 2 : 0)}))
    .filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 6);
  for (const x of extra) add(x.e);

  const budget = task.budget ?? BOOK_BUDGET;
  const items: BookItem[] = [];
  let size = 0, omitted = 0;
  const push = (item: BookItem) => {
    const cost = item.text.length + item.title.length + 80;
    if (size + cost > budget) { omitted++; return; }
    items.push(item); size += cost;
  };
  // What the student has met up to the page (or the end of the unit), made from the pages in the base.
  let known: BookItem | null = null;
  if (unit !== undefined) {
    const until = page ?? live.find((e): e is EntryOf<'unit'> => e.kind === 'unit' && e.data.number === unit)?.data.pages?.[1]
      ?? Math.max(0, ...live.filter((e): e is EntryOf<'page'> => e.kind === 'page' && e.data.unit === unit).map(p => p.data.number));
    if (until) known = {id: 'known.' + until, kind: 'unit', title: '¿Qué sabe el alumno hasta la página ' + until + '?', status: 'observed', source: 'Calculado de las páginas importadas', text: knownText(knownUntil(entries, until), 120)};
  }
  // It goes right after the page (or the unit) it is about, before rules and notes.
  const anchor = pageEntry(page) && picked.includes(pageEntry(page)!) ? pageEntry(page) : picked.find(e => e.kind === 'unit');
  for (const e of picked) {
    push(itemOf(e, names));
    if (e === anchor && known) { push(known); known = null; }
  }
  if (known) push(known);
  const missingPictures = wanted.filter(id => { const c = chars.find(x => x.id === 'char.' + id); return c && !c.data.refs.some(r => r.hash === c.data.mainRef && r.review === 'approved'); });
  return {items, ...(unit !== undefined ? {unit} : {}), ...(page !== undefined ? {page} : {}), characters: wanted, ambiguous, missingPictures, omitted};
}
