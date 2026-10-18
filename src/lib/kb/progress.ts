import {buildIndex, findCharacters, fold, words} from './names';
import type {EntryOf, KbEntry, KbStatus} from './model';

// What the student has met up to a page of the book, from the pages in the knowledge base.
//
// A word seen once is reported as seen once, never as known: only the pages say what was met, not what was learnt.
// Grammar comes from the units' descriptions with their status, so an observed description stays «observado».

export type WordStat = {
  /** As first written (with stress marks when the page has them). */
  word: string;
  key: string;
  first: {unit: number; page: number};
  pages: number[];
  units: number[];
  count: number;
};

const cyrillicWord = /^[\u0400-\u04ff\u0300\u0301-]+$/;
const footerLine = /^русский код\s*·\s*[aа]1$/;

/** Every Russian word of the pages, by first appearance. Names of characters are left out. */
export function vocabulary(pages: EntryOf<'page'>[], characters: EntryOf<'character'>[] = []) {
  const names = buildIndex(characters.map(c => ({id: c.id, nameRu: c.data.nameRu || c.title, aliases: c.data.aliases})));
  const stats = new Map<string, WordStat>();
  for (const p of [...pages].sort((a, b) => a.data.number - b.data.number)) {
    // The running footer of the book is page furniture, not something the student reads.
    const text = p.data.text.split('\n').filter(l => !footerLine.test(fold(l.trim()))).join('\n');
    for (const w of words(text)) {
      if (!cyrillicWord.test(w) || w.replace(/[\u0300\u0301-]/g, '').length < 2) continue;
      if (findCharacters(w, names).ids.length) continue;
      const key = fold(w);
      const s = stats.get(key);
      if (!s) { stats.set(key, {word: w.toLowerCase(), key, first: {unit: p.data.unit, page: p.data.number}, pages: [p.data.number], units: [p.data.unit], count: 1}); continue; }
      s.count++;
      if (!s.pages.includes(p.data.number)) s.pages.push(p.data.number);
      if (!s.units.includes(p.data.unit)) s.units.push(p.data.unit);
      // Prefer a written form with its stress mark.
      if (!/[\u0301]/.test(s.word) && /[\u0301]/.test(w)) s.word = w.toLowerCase();
    }
  }
  return stats;
}

export type UnitSummary = {number: number; title: string; status: KbStatus; grammar: string[]; expressions: string[]; notYet: string[]; pages?: [number, number]; id: string};

export type Known = {
  page: number;
  unit: number | null;
  /** Pages up to this one that are in the base, and the ones of that stretch that are missing. */
  pages: number[];
  missing: number[];
  done: UnitSummary[];
  current: UnitSummary | null;
  later: UnitSummary[];
  /** Words met in more than one unit; met on several pages of one unit; met once. */
  recycled: WordStat[];
  repeated: WordStat[];
  once: WordStat[];
  /** Words that appear for the first time on this page. */
  fresh: WordStat[];
  /** Entry ids the answer is made of. */
  sources: string[];
};

const unitSummary = (u: EntryOf<'unit'>): UnitSummary => ({
  id: u.id, number: u.data.number, title: u.data.title, status: u.status, grammar: u.data.grammar, expressions: u.data.expressions, notYet: u.data.notYet, ...(u.data.pages ? {pages: u.data.pages} : {}),
});

/** What the pages up to `page` contain, unit by unit. */
export function knownUntil(entries: KbEntry[], page: number): Known {
  const live = entries.filter(e => e.status !== 'superseded');
  const pages = live.filter((e): e is EntryOf<'page'> => e.kind === 'page').sort((a, b) => a.data.number - b.data.number);
  const units = live.filter((e): e is EntryOf<'unit'> => e.kind === 'unit').sort((a, b) => a.data.number - b.data.number);
  const characters = live.filter((e): e is EntryOf<'character'> => e.kind === 'character');
  const here = pages.find(p => p.data.number === page);
  const unit = here?.data.unit ?? units.find(u => u.data.pages && page >= u.data.pages[0] && page <= u.data.pages[1])?.data.number ?? null;
  const upTo = pages.filter(p => p.data.number <= page);
  const first = upTo[0]?.data.number ?? page;
  const have = new Set(upTo.map(p => p.data.number));
  const missing: number[] = [];
  for (let n = first; n <= page; n++) if (!have.has(n)) missing.push(n);

  const stats = [...vocabulary(upTo, characters).values()];
  const byFirst = (a: WordStat, b: WordStat) => a.first.page - b.first.page || a.key.localeCompare(b.key);
  return {
    page, unit,
    pages: upTo.map(p => p.data.number), missing,
    done: units.filter(u => unit !== null && u.data.number < unit).map(unitSummary),
    current: unit === null ? null : (units.find(u => u.data.number === unit) ? unitSummary(units.find(u => u.data.number === unit)!) : null),
    later: units.filter(u => unit !== null && u.data.number > unit).map(unitSummary),
    recycled: stats.filter(s => s.units.length > 1).sort(byFirst),
    repeated: stats.filter(s => s.units.length === 1 && s.count > 1).sort(byFirst),
    once: stats.filter(s => s.count === 1).sort(byFirst),
    fresh: stats.filter(s => s.first.page === page).sort(byFirst),
    sources: [...upTo.map(p => p.id), ...units.filter(u => unit !== null && u.data.number <= unit).map(u => u.id)],
  };
}

/** The same in words, for the assistant: what was met, how often, and what has not been taught yet. */
export function knownText(k: Known, limit = 160) {
  const list = (ws: WordStat[]) => ws.slice(0, limit).map(w => w.word).join(', ') + (ws.length > limit ? ' (y ' + (ws.length - limit) + ' más)' : '');
  const unitLine = (u: UnitSummary, label: string) =>
    '- Unidad ' + u.number + (u.title ? ' «' + u.title + '»' : '') + ' [' + label + '; ' + u.status + ']: ' + (u.grammar.join('; ') || 'sin descripción') +
    (u.expressions.length ? ' · Expresiones sin explicación formal: ' + u.expressions.join('; ') : '') + (u.notYet.length ? ' · No introducir todavía: ' + u.notYet.join('; ') : '');
  const lines = ['Hasta la página ' + k.page + (k.unit !== null ? ' (unidad ' + k.unit + ')' : '') + '. Páginas en la base: ' + (k.pages.join(', ') || 'ninguna') + (k.missing.length ? '. Faltan en la base: ' + k.missing.join(', ') : '') + '.'];
  for (const u of k.done) lines.push(unitLine(u, 'unidad anterior'));
  if (k.current) lines.push(unitLine(k.current, 'unidad en curso: lo que figura puede no estar presentado todavía en esta página'));
  if (k.later.length) lines.push('Todavía no enseñado (unidades siguientes): ' + k.later.map(u => 'U' + u.number + ': ' + (u.grammar.join('; ') || u.title)).join(' | '));
  lines.push('Palabras recicladas en más de una unidad (' + k.recycled.length + '): ' + list(k.recycled));
  lines.push('Palabras repetidas dentro de una sola unidad (' + k.repeated.length + '): ' + list(k.repeated));
  lines.push('Palabras vistas una sola vez, no dominadas (' + k.once.length + '): ' + list(k.once));
  if (k.fresh.length) lines.push('Nuevas en la página ' + k.page + ': ' + list(k.fresh));
  lines.push('Las palabras salen del texto extraído de las páginas: aparecer no significa que el alumno las domine.');
  return lines.join('\n');
}
