import type {EntryOf} from './model';

// The age of a character, as the book's sources write it («14 años», «unos 70 años», «bebé»). The author can confirm it
// in the character's «Edad»; until then it is read from the manifest's line and the context's paragraph, never guessed.

const agePattern = /(?:\b(unos|unas|aproximadamente|alrededor de|cerca de)\s+)?\b(\d{1,3}|un)\s+(años?)\b/i;

/** «14 años», «unos 70 años», «aproximadamente un año», «bebé»; undefined when the text gives no age. */
export function ageIn(text: string): string | undefined {
  const m = text.match(agePattern);
  if (m) return [m[1]?.toLowerCase(), m[2].toLowerCase(), m[2].toLowerCase() === 'un' ? 'año' : m[3].toLowerCase()].filter(Boolean).join(' ');
  return /\bbeb[eé]\b/i.test(text) ? 'bebé' : undefined;
}

/** The confirmed age, or the one the sources give. */
export const ageOf = (c: EntryOf<'character'>) => c.data.age?.trim() || ageIn([c.data.role || '', c.body].join('\n'));

/** The same in English, for image prompts: «unos 70 años» → «about 70 years old». */
export function ageInEnglish(age: string | undefined) {
  if (!age) return undefined;
  if (/^beb[eé]$/i.test(age.trim())) return 'a baby';
  const m = age.match(agePattern);
  if (!m) return undefined;
  const n = m[2].toLowerCase() === 'un' ? 1 : Number(m[2]);
  return (m[1] ? 'about ' : '') + n + (n === 1 ? ' year old' : ' years old') + (n <= 2 ? ' (a baby)' : '');
}

const statedAge = /\b(?:about |around |aged )?\d{1,3}(?:[- ]years?[- ]old|[- ]year-old)\b|\baged \d{1,3}\b|\bof (?:about |around )?\d{1,3}\b/gi;

/** A look that states the book's age: a different age the text model wrote is taken out, and the right one goes first. */
export function withAge(look: string, age: string | undefined) {
  const en = ageInEnglish(age);
  if (!en) return look;
  const n = en.match(/\d+/)?.[0];
  const stated = look.match(statedAge) || [];
  if (n && stated.length && stated.every(x => x.match(/\d+/)?.[0] === n)) return look;
  if (!n && /\b(baby|infant|toddler)\b/i.test(look)) return look;
  const rest = look.replace(statedAge, '').replace(/\s{2,}/g, ' ').replace(/\s+([,;.])/g, '$1').replace(/([,;])(\s*[,;])+/g, '$1').replace(/^[\s,;]+/, '').trim();
  return en.charAt(0).toUpperCase() + en.slice(1) + (rest ? '; ' + rest : '');
}
