// Finding characters of the book in a request or on a page, by their names in any case form.
//
// Russian names change with the case (Лена, Лены, Лене, Лену, Леной), so each Cyrillic alias is expanded to its
// forms. Words are compared without stress marks and with ё as е. Two names are never merged because they look alike:
// «Галя» and «Галина» are different words, and a name shared by two characters is reported as ambiguous instead of
// being given to one of them. Nothing here knows the names of a particular book: they come from its knowledge base.

/** Lowercase, without stress marks, ё as е: the form used to compare words. Keeps й. */
export function fold(text: string) {
  return text.normalize('NFD').replace(/[\u0300\u0301\u0308]/g, '').normalize('NFC').toLowerCase();
}

const wordPattern = /[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)*/gu;
export const words = (text: string) => text.match(wordPattern) || [];
export const tokens = (text: string) => words(text).map(fold);

const cyrillic = /[\u0400-\u04ff]/;
const vowels = 'аеёиоуыэюя';

/** Case forms of a Russian first name (nominative given). Unknown endings keep only the given form. */
export function nameForms(name: string): string[] {
  const n = fold(name.trim());
  if (!n || !cyrillic.test(n)) return n ? [n] : [];
  const stem = n.slice(0, -1);
  const last = n.at(-1)!;
  // Foreign names ending in и, у, ю, о, е, э do not decline (Тоби, Бруно).
  if ('иуюоеэ'.includes(last)) return [n];
  if (last === 'а') return [n, stem + 'ы', stem + 'и', stem + 'е', stem + 'у', stem + 'ой', stem + 'ою', stem + 'ей', stem + 'ею'];
  if (last === 'я') return [n, stem + 'и', stem + 'е', stem + 'ю', stem + 'ей', stem + 'ею'];
  if (last === 'й') return [n, stem + 'я', stem + 'ю', stem + 'ем', stem + 'е'];
  if (last === 'ь') return [n, stem + 'я', stem + 'ю', stem + 'ем', stem + 'е', stem + 'и', stem + 'ью'];
  if (!vowels.includes(last)) return [n, n + 'а', n + 'у', n + 'ом', n + 'е'];
  return [n];
}

const latin: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n',
  о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y',
  ь: '', э: 'e', ю: 'yu', я: 'ya',
};
/** A plain Latin spelling (Лена → Lena), for requests written with Latin letters. */
export function transliterate(text: string) {
  const plain = text.normalize('NFD').replace(/[\u0300\u0301]/g, '').normalize('NFC');
  let out = '';
  for (const ch of plain) {
    const lower = ch.toLowerCase();
    const t = latin[lower];
    out += t === undefined ? ch : ch === lower ? t : t.charAt(0).toUpperCase() + t.slice(1);
  }
  return out;
}

/** Kinship titles that go before a name («тётя Галя»): the name alone is an alias too. */
const titles = new Set(['бабушка', 'дедушка', 'тетя', 'дядя', 'баба', 'деда']);
const patronymic = /(ович|евич|ич|овна|евна|ична|инична)$/;

/** Aliases made from the Russian name: each «/» alternative, without the kinship title or the patronymic, and in Latin letters. */
export function defaultAliases(nameRu: string): string[] {
  const out: string[] = [];
  const add = (v: string) => { const t = v.trim(); if (t && !out.some(x => fold(x) === fold(t))) out.push(t); };
  for (const part of nameRu.split('/').map(p => p.trim()).filter(Boolean)) {
    add(part);
    const ws = words(part);
    const bare = ws.filter((w, i) => !(titles.has(fold(w)) && i < ws.length - 1) && !(i > 0 && patronymic.test(fold(w))));
    const name = bare.join(' ');
    if (bare.length && bare.length < ws.length) add(name);
    if (cyrillic.test(name)) add(transliterate(name));
  }
  return out;
}

export type NamedCharacter = {id: string; nameRu: string; aliases: string[]};
type Phrase = {forms: Set<string>[]; ids: string[]; alias: string};
export type NameIndex = {phrases: Phrase[]};

/** Every alias of every character, expanded to its case forms, longest first. */
export function buildIndex(characters: NamedCharacter[]): NameIndex {
  const byKey = new Map<string, Phrase>();
  for (const c of characters) {
    for (const alias of [c.nameRu, ...c.aliases]) {
      for (const part of alias.split('/')) {
        const ws = words(part);
        if (!ws.length) continue;
        const key = ws.map(fold).join(' ');
        const p = byKey.get(key) || {forms: ws.map(w => new Set(nameForms(w))), ids: [], alias: part.trim()};
        if (!p.ids.includes(c.id)) p.ids.push(c.id);
        byKey.set(key, p);
      }
    }
  }
  return {phrases: [...byKey.values()].sort((a, b) => b.forms.length - a.forms.length)};
}

export type Found = {
  /** Characters named, in order of first mention. */
  ids: string[];
  /** Names that belong to more than one character: none of them is assumed. */
  ambiguous: {alias: string; ids: string[]}[];
  count: Record<string, number>;
};

/** The characters a text names. A longer alias wins over the shorter one inside it («тётя Галя» over «Галя»). */
export function findCharacters(text: string, index: NameIndex): Found {
  const t = tokens(text);
  const ids: string[] = [];
  const count: Record<string, number> = {};
  const ambiguous = new Map<string, {alias: string; ids: string[]}>();
  for (let i = 0; i < t.length;) {
    const hit = index.phrases.find(p => p.forms.length <= t.length - i && p.forms.every((f, k) => f.has(t[i + k])));
    if (!hit) { i++; continue; }
    if (hit.ids.length === 1) {
      const id = hit.ids[0];
      if (!ids.includes(id)) ids.push(id);
      count[id] = (count[id] || 0) + 1;
    } else ambiguous.set(hit.alias, {alias: hit.alias, ids: hit.ids});
    i += hit.forms.length;
  }
  return {ids, ambiguous: [...ambiguous.values()], count};
}
