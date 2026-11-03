'use client';
import {ImageOff} from 'lucide-react';
import type {EntryOf, KbEntry, Pictured} from '@/lib/kb/model';
import {ageOf} from '@/lib/kb/characters';
import {isImage, useRefUrl} from './character-refs';
import {StatusBadge} from './entry-detail';

// «Personajes» and «Lugares»: the book's cast as faces, and its places as pictures. Each card shows the picture image models receive (the main reference) or
// says it is missing; nothing is generated to fill the gap.

export const isCharacter = (e: KbEntry): e is EntryOf<'character'> => e.kind === 'character';
export const isPlace = (e: KbEntry): e is EntryOf<'place'> => e.kind === 'place';

/** The picture a card shows: the main reference, else the first approved image, else the first one not rejected. */
function pictureOf(c: Pictured) {
  const images = c.data.refs.filter(isImage);
  const main = images.find(r => r.hash === c.data.mainRef);
  return {ref: main || images.find(r => r.review === 'approved') || images.find(r => r.review !== 'rejected') || null, main: Boolean(main)};
}

function Portrait({entry, small}: {entry: Pictured; small?: boolean}) {
  const {ref} = pictureOf(entry);
  const url = useRefUrl(ref);
  const initial = (entry.title || '?').trim().slice(0, 1).toUpperCase();
  return (
    <span className={'rc-kb-portrait' + (small ? ' rc-kb-portrait--small' : '') + (entry.kind === 'place' ? ' rc-kb-portrait--place' : '')} data-state={ref ? (url === 'missing' ? 'missing' : url ? 'ready' : 'loading') : 'none'} aria-hidden="true">
      {ref && url && url !== 'missing' ? <img src={url} alt="" /> : <span className="rc-kb-initial" lang="ru">{initial}</span>}
    </span>
  );
}

/** What the card says under the name: the age and the role, as the author confirmed them or the sources give them. */
function summary(c: Pictured) {
  if (c.kind === 'place') return c.body || c.data.look || '';
  const role = c.data.role || c.body.replace(/^[^:]{1,60}:\s*/, '');
  const age = ageOf(c);
  // A role that already says the age («12 años; hijo de…») is not repeated.
  return [age && !role.includes(age) ? age : '', role].filter(Boolean).join(' · ');
}

/** A note when the picture image models receive is not settled. */
function pictureNote(c: Pictured) {
  if (c.kind === 'character' && c.data.missing) return 'Sin imagen verificada';
  const {ref, main} = pictureOf(c);
  if (!ref) return 'Sin imagen';
  return main ? null : c.kind === 'place' ? 'Sin imagen principal' : 'Sin foto principal';
}

/**
 * The cast. Without a selection, a grid of faces; with one, a compact column beside its detail (`compact`).
 * `current` is the open character.
 */
export function People({people, current, compact, onOpen}: {people: Pictured[]; current: string | null; compact: boolean; onOpen: (id: string) => void}) {
  const places = people.length > 0 && people.every(isPlace);
  return (
    <ul className={'rc-kb-people' + (compact ? ' rc-kb-people--compact' : '') + (places ? ' rc-kb-people--places' : '')} aria-label={people.length + (places ? (people.length === 1 ? ' lugar' : ' lugares') : people.length === 1 ? ' personaje' : ' personajes')}>
      {people.map(c => {
        const note = pictureNote(c);
        return (
          <li key={c.id}>
            <button type="button" className="rc-kb-person" aria-current={c.id === current || undefined} onClick={() => onOpen(c.id)}>
              <Portrait entry={c} small={compact} />
              <span className="rc-kb-person-text">
                <strong lang="ru">{c.title}</strong>
                {compact ? null : <span className="rc-kb-person-summary">{summary(c) || (c.kind === 'place' ? 'Sin descripción confirmada' : 'Sin datos de edad ni rol')}</span>}
                <span className="rc-kb-person-meta">
                  <StatusBadge status={c.status} />
                  {note ? <span className="rc-kb-person-note"><ImageOff aria-hidden="true" />{note}</span> : null}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
