import {buildIndex, findCharacters} from './names';
import type {EntryOf, KbEntry, KbRef} from './model';

// A picture of the book's characters: which reference files go to the image model, and the prompt that names them.
//
// Only files the author approved and ticked for this picture are sent, in order (each character's main reference
// first), up to what the model accepts. A model that takes no reference images gets only the text. Nothing here can
// promise that a face stays the same: the author reviews the result.

export type CastPick = {id: string; refs: string[]};
export type PictureParts = {action: string; scene: string; composition: string; style: string};

export const approvedRefs = (c: EntryOf<'character'>) => {
  const ok = c.data.refs.filter(r => r.review === 'approved' && r.mime.startsWith('image/'));
  return [...ok.filter(r => r.hash === c.data.mainRef), ...ok.filter(r => r.hash !== c.data.mainRef)];
};

/** The main approved reference of each chosen character, to start with. */
export const defaultPicks = (chars: EntryOf<'character'>[]): CastPick[] =>
  chars.map(c => ({id: c.id, refs: approvedRefs(c).filter(r => !r.chunks).slice(0, 1).map(r => r.hash)}));

export type PlannedRef = {character: string; name: string; ref: KbRef; index: number};

/** The files that will be sent, in order, and the ones the model's limit leaves out. */
export function plannedRefs(chars: EntryOf<'character'>[], picks: CastPick[], max: number) {
  const order: {c: EntryOf<'character'>; r: KbRef}[] = [];
  const of = (id: string) => chars.find(c => c.id === id);
  // First every character's first chosen file, then the extra ones: with a small limit each character keeps one.
  for (const round of [0, 1]) for (const p of picks) {
    const c = of(p.id);
    if (!c) continue;
    // A file kept in parts (over 4 MB) cannot be read by the server as one file: it is never sent.
    const refs = p.refs.map(h => approvedRefs(c).find(r => r.hash === h)).filter((r): r is KbRef => Boolean(r) && !r!.chunks);
    for (const r of round === 0 ? refs.slice(0, 1) : refs.slice(1)) order.push({c, r});
  }
  const sent: PlannedRef[] = order.slice(0, max).map(({c, r}, i) => ({character: c.id, name: c.title, ref: r, index: i + 1}));
  const left = order.slice(max).map(({c, r}) => ({character: c.id, name: c.title, ref: r}));
  return {sent, left};
}

/** The prompt: who is in the picture and how to tell them apart, then what happens, where, framed how. */
export function bookPicturePrompt(chars: EntryOf<'character'>[], sent: PlannedRef[], parts: PictureParts) {
  const lines: string[] = [];
  if (chars.length) {
    lines.push(sent.length
      ? 'Characters. Keep each one\'s face, hair, body build and age exactly as in their reference image; clothing may change to suit the scene:'
      : 'Characters:');
    for (const c of chars) {
      const refs = sent.filter(s => s.character === c.id).map(s => s.index);
      const who = c.data.nameRu || c.title;
      const look = c.data.look?.trim();
      const bits = [refs.length ? 'reference image ' + refs.join(' and ') : '', look || ''].filter(Boolean);
      lines.push('- ' + who + (bits.length ? ': ' + bits.join('. ') : ''));
    }
    const apart = chars.filter(c => c.data.distinct.some(d => chars.some(o => o.id === 'char.' + d)));
    if (apart.length) lines.push('These are different people; do not mix their features: ' + chars.map(c => c.data.nameRu || c.title).join(', ') + '.');
  }
  if (parts.action.trim()) lines.push('Action: ' + parts.action.trim());
  if (parts.scene.trim()) lines.push('Setting: ' + parts.scene.trim());
  if (parts.composition.trim()) lines.push('Composition: ' + parts.composition.trim());
  if (parts.style.trim()) lines.push('Style: ' + parts.style.trim());
  lines.push('No text, letters, labels, speech bubbles or logos in the picture.');
  return lines.join('\n');
}

/** Warnings for the author before a paid picture: what the model will not see, and who has no verified picture. */
export function pictureWarnings(chars: EntryOf<'character'>[], sent: PlannedRef[], left: {name: string; ref: KbRef}[], max: number) {
  const out: string[] = [];
  if (!max && chars.some(c => approvedRefs(c).length)) out.push('Este modelo no recibe imágenes de referencia: solo se envía el texto. Elegí uno que las acepte para que vea las fichas.');
  for (const c of chars) {
    if (c.data.missing && !approvedRefs(c).length) out.push(c.title + ' no tiene imagen verificada: el resultado no es una ficha canónica y no se debe presentar como tal.');
    else if (!sent.some(s => s.character === c.id)) out.push(c.title + ' va sin imagen de referencia' + (c.data.look ? ', solo con su descripción confirmada.' : ' ni descripción confirmada: el modelo lo inventa.'));
  }
  if (left.length) out.push('El modelo acepta ' + max + (max === 1 ? ' imagen' : ' imágenes') + ': quedan afuera ' + left.map(l => l.ref.name + ' (' + l.name + ')').join(', ') + '.');
  out.push('Ningún modelo garantiza el mismo rostro: revisá el resultado antes de usarlo.');
  return out;
}

/**
 * The characters of a /pdf-generator draft that are the book's, by the name the draft uses, each with its approved
 * main picture when there is one. A name that is not the book's, or that could be more than one, is left out.
 */
export function castOfBook(names: string[], entries: KbEntry[]) {
  const chars = entries.filter((e): e is EntryOf<'character'> => e.kind === 'character' && e.status !== 'superseded');
  const index = buildIndex(chars.map(c => ({id: c.id, nameRu: c.data.nameRu || c.title, aliases: c.data.aliases})));
  const out: Record<string, {id: string; title: string; hash?: string; file?: string}> = {};
  for (const name of names) {
    const found = findCharacters(name, index);
    if (found.ids.length !== 1 || found.ambiguous.length) continue;
    const c = chars.find(x => x.id === found.ids[0])!;
    const main = approvedRefs(c).find(r => r.hash === c.data.mainRef && !r.chunks);
    out[name] = {id: c.id, title: c.title, ...(main ? {hash: main.hash, file: main.name} : {})};
  }
  return out;
}
