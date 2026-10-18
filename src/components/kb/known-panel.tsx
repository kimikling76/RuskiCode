'use client';
import {useMemo, useState} from 'react';
import {knownUntil, type UnitSummary, type WordStat} from '@/lib/kb/progress';
import {statusName, type KbEntry} from '@/lib/kb/model';

function Words({title, words, hint}: {title: string; words: WordStat[]; hint: string}) {
  const [all, setAll] = useState(false);
  const shown = all ? words : words.slice(0, 60);
  return (
    <section className="rc-kb-block">
      <h3>{title} <span className="rc-hint">({words.length})</span></h3>
      <p className="rc-hint">{hint}</p>
      {words.length ? (
        <p className="rc-kb-words">
          {shown.map(w => <span key={w.key} title={'Primera vez: página ' + w.first.page + ' · ' + w.count + (w.count === 1 ? ' vez' : ' veces') + ' · unidades ' + w.units.join(', ')}>{w.word}</span>)}
          {words.length > shown.length ? <button type="button" className="rc-kb-link" onClick={() => setAll(true)}>y {words.length - shown.length} más</button> : null}
        </p>
      ) : <p className="rc-hint">Ninguna.</p>}
    </section>
  );
}

function UnitLine({u, label, onOpen}: {u: UnitSummary; label: string; onOpen: (id: string) => void}) {
  return (
    <li>
      <button type="button" className="rc-kb-link" onClick={() => onOpen(u.id)}>Unidad {u.number}{u.title ? ' · ' + u.title : ''}</button>
      <span className="rc-hint"> · {label} · {statusName[u.status].toLowerCase()}</span>
      <div>{u.grammar.join('; ') || 'sin descripción'}</div>
      {u.expressions.length ? <div className="rc-hint">Expresiones sin explicación formal: {u.expressions.join('; ')}</div> : null}
      {u.notYet.length ? <div className="rc-kb-warning">No introducir todavía: {u.notYet.join('; ')}</div> : null}
    </li>
  );
}

/** «¿Qué sabe el alumno hasta esta página?», answered from the pages and units in the base, with what it is made of. */
export function KnownPanel({entries, onOpen}: {entries: KbEntry[]; onOpen: (id: string) => void}) {
  const pages = useMemo(() => entries.flatMap(e => e.kind === 'page' && e.status !== 'superseded' ? [e.data.number] : []).sort((a, b) => a - b), [entries]);
  const [page, setPage] = useState<number | null>(null);
  const at = page ?? pages.at(-1) ?? 1;
  const k = useMemo(() => knownUntil(entries, at), [entries, at]);
  if (!pages.length) return <p className="rc-hint">Importá los textos de las unidades para ver qué contienen las páginas.</p>;
  return (
    <div className="rc-kb-known">
      <label className="rc-field rc-kb-page-pick"><span>Hasta la página</span>
        <input className="rc-input" type="number" min={1} max={999} value={at} onChange={e => setPage(Number(e.target.value) || 1)} />
      </label>
      <p>Página {at}{k.unit !== null ? ', unidad ' + k.unit : ''}. Páginas en la base hasta acá: {k.pages.length}{k.missing.length ? <span className="rc-kb-warning"> · faltan {k.missing.join(', ')}</span> : null}.</p>
      <p className="rc-hint">Sale del texto extraído de las páginas y de la descripción de cada unidad. Que una palabra aparezca no significa que el alumno la domine.</p>
      <section className="rc-kb-block">
        <h3>Unidades</h3>
        <ul className="rc-kb-units">
          {k.done.map(u => <UnitLine key={u.id} u={u} label="anterior" onOpen={onOpen} />)}
          {k.current ? <UnitLine u={k.current} label="en curso (puede no estar presentado todavía en esta página)" onOpen={onOpen} /> : null}
        </ul>
        {k.later.length ? <p className="rc-hint">Todavía no enseñado: {k.later.map(u => 'unidad ' + u.number + ' (' + (u.grammar.slice(0, 3).join('; ') || u.title) + ')').join(' · ')}</p> : null}
      </section>
      <Words title="Recicladas en más de una unidad" words={k.recycled} hint="Aparecen en dos o más unidades hasta esta página." />
      <Words title="Repetidas dentro de una unidad" words={k.repeated} hint="Más de una vez, pero en una sola unidad." />
      <Words title="Vistas una sola vez" words={k.once} hint="Una aparición no alcanza para darlas por sabidas." />
      <Words title={'Nuevas en la página ' + at} words={k.fresh} hint="Primera aparición en el libro." />
      <p className="rc-hint">Fuentes: {k.sources.length} datos de la base ({k.pages.length} páginas y {k.done.length + (k.current ? 1 : 0)} unidades).</p>
    </div>
  );
}
