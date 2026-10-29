'use client';

export const kindNames: Record<string, string> = {ortografía: 'Ortografía', gramática: 'Gramática', tilde: 'Tilde', 'letra latina': 'Letra latina', traducción: 'Traducción', inglés: 'Inglés', otro: 'Otro'};

/** The changed part of a line, marked: before with the removed words, after with the new ones. */
export function Diff({before, after}: {before: string; after: string}) {
  let a = 0;
  while (a < before.length && a < after.length && before[a] === after[a]) a++;
  let b = 0;
  while (b < before.length - a && b < after.length - a && before[before.length - 1 - b] === after[after.length - 1 - b]) b++;
  return (
    <div className="rc-man-diff-text">
      <p><span className="rc-hint">Antes </span>{before.slice(0, a)}<del>{before.slice(a, before.length - b)}</del>{before.slice(before.length - b)}</p>
      <p><span className="rc-hint">Después </span>{after.slice(0, a)}<ins>{after.slice(a, after.length - b)}</ins>{after.slice(after.length - b)}</p>
    </div>
  );
}

