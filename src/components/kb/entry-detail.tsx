'use client';
import {useEffect, useMemo, useState} from 'react';
import {toast} from 'sonner';
import {Check, History, Images, Pencil, RotateCcw} from 'lucide-react';
import {ConfirmDialog} from '@/components/ui/dialog';
import {editEntry, restoreVersion} from '@/lib/kb/store';
import {kindName, statusName, type EntryOf, type KbEntry, type KbProject, type KbStatus} from '@/lib/kb/model';
import type {EntryChange} from '@/lib/kb/versions';
import {CharacterRefs} from './character-refs';
import {BookImageDialog} from './book-image';

const when = new Intl.DateTimeFormat('es-AR', {day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'});
const lines = (v: string) => v.split('\n').map(x => x.trim()).filter(Boolean);
const list = (v: string) => v.split(',').map(x => x.trim()).filter(Boolean);

export function StatusBadge({status}: {status: KbStatus}) {
  return <span className="rc-kb-status" data-status={status}>{statusName[status]}</span>;
}

/** Name of a character id, for relations and look-alikes. */
export type Names = Map<string, string>;

/** One fact of the book: what it says, where it comes from, its versions, and what the author decides about it. */
export function EntryDetail({entry, names, all, project, onOpen}: {entry: KbEntry; names: Names; all: KbEntry[]; project: KbProject; onOpen: (id: string) => void}) {
  const [editing, setEditing] = useState(false);
  const [picture, setPicture] = useState(false);
  const [confirm, setConfirm] = useState<{status: KbStatus; label: string; title: string; text: string} | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  useEffect(() => { setEditing(false); setShowHistory(false); }, [entry.id]);

  async function save(change: EntryChange, note: string) {
    try {
      const next = await editEntry(entry.project, entry.id, change, note);
      toast(next.version > entry.version ? 'Guardado como versión ' + next.version + '.' : 'No había cambios.');
      setEditing(false);
    } catch { toast('No se pudo guardar en este navegador.'); }
  }

  const statusActions: {status: KbStatus; label: string; title: string; text: string}[] = [
    {status: 'approved', label: 'Aprobar', title: 'Aprobar este dato', text: 'Pasa a ser canon: el asistente lo respeta y las importaciones no lo cambian. La versión anterior queda en el historial.'},
    {status: 'pending', label: 'Marcar pendiente', title: 'Marcar como pendiente', text: 'Queda a la espera de una decisión. El asistente no lo usa como hecho.'},
    {status: 'observed', label: 'Volver a observado', title: 'Volver a «observado»', text: 'Queda como algo visto en un archivo, sin aprobar.'},
    {status: 'superseded', label: 'Marcar sustituido', title: 'Marcar como sustituido', text: 'No se borra: queda en la base y en el historial, pero el asistente deja de usarlo.'},
  ];

  return (
    <article className="rc-kb-detail" aria-labelledby="kb-detail-title">
      <header className="rc-kb-detail-head">
        <span className="rc-hint">{kindName[entry.kind]} · versión {entry.version} · {when.format(new Date(entry.updatedAt))}</span>
        <h2 id="kb-detail-title">{entry.title}</h2>
        <div className="rc-kb-detail-meta"><StatusBadge status={entry.status} /><span className="rc-hint">{entry.note}</span></div>
        {entry.tags.length ? <p className="rc-kb-tags">{entry.tags.map(t => <span key={t}>{t}</span>)}</p> : null}
      </header>

      {editing ? <EntryForm entry={entry} names={names} onCancel={() => setEditing(false)} onSave={save} /> : (
        <>
          <EntryView entry={entry} names={names} all={all} onOpen={onOpen} onChoose={(option) => {
            if (entry.kind !== 'decision') return;
            const label = entry.data.options.find(o => o.id === option)?.label || option;
            void save({status: 'approved', data: {...entry.data, chosen: option}}, 'Decidido: ' + label.slice(0, 200));
          }} onReopen={() => {
            if (entry.kind !== 'decision') return;
            const {chosen: _drop, ...rest} = entry.data;
            void save({status: 'pending', data: rest}, 'Decisión reabierta');
          }} />
          <div className="rc-kb-actions">
            <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" onClick={() => setEditing(true)}><Pencil aria-hidden="true" />Editar</button>
            {statusActions.filter(a => a.status !== entry.status && !(entry.kind === 'decision' && a.status === 'approved')).map(a => (
              <button key={a.status} type="button" className={'rc-btn rc-btn--sm ' + (a.status === 'approved' ? 'rc-btn--primary' : 'rc-btn--ghost')} onClick={() => setConfirm(a)}>
                {a.status === 'approved' ? <Check aria-hidden="true" /> : null}{a.label}
              </button>
            ))}
          </div>
        </>
      )}

      {entry.kind === 'character' && !editing ? (
        <>
          <CharacterRefs entry={entry} />
          <div className="rc-kb-block">
            <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" onClick={() => setPicture(true)}><Images aria-hidden="true" />Ilustración con este personaje…</button>
          </div>
          <BookImageDialog open={picture} onClose={() => setPicture(false)} project={project} entries={all} initial={[entry.id]} />
        </>
      ) : null}

      <section className="rc-kb-block">
        <h3>Fuentes</h3>
        {entry.sources.length ? (
          <ul className="rc-kb-sources">{entry.sources.map((s, i) => <li key={i}><span>{s.label}</span>{s.ref ? <span className="rc-hint"> · {s.ref}</span> : null}{s.date ? <span className="rc-hint"> · {s.date}</span> : null}</li>)}</ul>
        ) : <p className="rc-hint">Sin fuente: escrito en el estudio.</p>}
      </section>

      <section className="rc-kb-block">
        <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" aria-expanded={showHistory} onClick={() => setShowHistory(v => !v)}><History aria-hidden="true" />Historial ({entry.history.length} {entry.history.length === 1 ? 'versión anterior' : 'versiones anteriores'})</button>
        {showHistory ? (
          entry.history.length ? (
            <ol className="rc-kb-history" reversed>
              {[...entry.history].reverse().map(h => (
                <li key={h.version}>
                  <div><strong>Versión {h.version}</strong> <StatusBadge status={h.status} /> <span className="rc-hint">{when.format(new Date(h.at))} · {h.note}</span></div>
                  <details><summary>Ver lo que decía</summary><p className="rc-kb-history-title">{h.title}</p>{h.body ? <p className="rc-kb-body">{h.body}</p> : null}<pre className="rc-kb-data">{JSON.stringify(h.data, null, 1)}</pre></details>
                  <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => setRestoring(h.version)}><RotateCcw aria-hidden="true" />Restaurar esta versión</button>
                </li>
              ))}
            </ol>
          ) : <p className="rc-hint">Todavía no hay versiones anteriores.</p>
        ) : null}
      </section>

      <ConfirmDialog open={Boolean(confirm)} onClose={() => setConfirm(null)} title={confirm?.title || ''} description={confirm?.text || ''} confirmLabel={confirm?.label || 'Confirmar'}
        onConfirm={() => { const c = confirm; setConfirm(null); if (c) void save({status: c.status}, c.status === 'approved' ? 'Aprobado por el autor' : c.label); }} />
      <ConfirmDialog open={restoring !== null} onClose={() => setRestoring(null)} title={'¿Restaurar la versión ' + restoring + '?'} confirmLabel="Restaurar"
        description="Vuelve como una versión nueva. La actual no se pierde: queda en el historial."
        onConfirm={() => { const v = restoring; setRestoring(null); if (v !== null) restoreVersion(entry.project, entry.id, v).then(() => toast('Versión ' + v + ' restaurada.'), () => toast('No se pudo restaurar.')); }} />
    </article>
  );
}

function Field({label, children}: {label: string; children: React.ReactNode}) {
  return <div className="rc-kb-field"><span>{label}</span><div>{children}</div></div>;
}
const nameOf = (names: Names, id: string) => names.get(id) || id;

function EntryView({entry, names, all, onOpen, onChoose, onReopen}: {entry: KbEntry; names: Names; all: KbEntry[]; onOpen: (id: string) => void; onChoose: (option: string) => void; onReopen: () => void}) {
  const link = (id: string, label?: string) => all.some(e => e.id === id)
    ? <button key={id} type="button" className="rc-kb-link" onClick={() => onOpen(id)}>{label || all.find(e => e.id === id)?.title || id}</button>
    : <span key={id}>{label || id}</span>;
  return (
    <div className="rc-kb-view">
      {entry.body ? <p className="rc-kb-body">{entry.body}</p> : null}
      {entry.kind === 'character' ? <CharacterView entry={entry} names={names} link={link} /> : null}
      {entry.kind === 'unit' ? (
        <>
          <Field label="Páginas">{entry.data.pages ? entry.data.pages[0] + '–' + entry.data.pages[1] : 'sin datos'}</Field>
          {entry.data.goal ? <Field label="Objetivo">{entry.data.goal}</Field> : null}
          <Field label="Gramática y temas">{entry.data.grammar.length ? <ul>{entry.data.grammar.map(g => <li key={g}>{g}</li>)}</ul> : 'sin datos'}</Field>
          <Field label="Expresiones sin explicación formal">{entry.data.expressions.length ? <ul>{entry.data.expressions.map(g => <li key={g}>{g}</li>)}</ul> : 'sin datos (completalas al editar)'}</Field>
          {entry.data.notYet.length ? <Field label="No introducir todavía">{entry.data.notYet.join('; ')}</Field> : null}
          <Field label="Páginas en la base">{all.filter((e): e is EntryOf<'page'> => e.kind === 'page' && e.data.unit === entry.data.number).sort((a, b) => a.data.number - b.data.number).map(p => link(p.id, String(p.data.number)))}</Field>
        </>
      ) : null}
      {entry.kind === 'page' ? (
        <>
          <Field label="Unidad">{link('unit.' + entry.data.unit, 'Unidad ' + entry.data.unit)}</Field>
          <Field label="Audios">{entry.data.audios.join(', ') || 'ninguno encontrado'}</Field>
          <Field label="Ejercicios encontrados">{entry.data.exercises.length ? <ul>{entry.data.exercises.map((x, i) => <li key={i}><strong>{x.number}</strong>{x.audio ? ' · ' + x.audio : ''} · {x.instruction}</li>)}</ul> : 'ninguno reconocido en el texto'}</Field>
          {entry.data.reading ? <Field label="Lectura">{entry.data.reading}</Field> : null}
          <Field label="Personajes nombrados">{entry.data.characters.length ? entry.data.characters.map(id => link('char.' + id, nameOf(names, id))) : 'ninguno'}</Field>
          <details className="rc-kb-text"><summary>Texto extraído</summary><pre>{entry.data.text}</pre></details>
        </>
      ) : null}
      {entry.kind === 'rule' ? <Field label="Área">{entry.data.area}{entry.data.unit !== undefined ? ' · unidad ' + entry.data.unit : ''}</Field> : null}
      {entry.kind === 'decision' ? (
        <>
          <Field label="Pregunta">{entry.data.question}</Field>
          <Field label="Opciones">
            <ul className="rc-kb-options">
              {entry.data.options.map(o => (
                <li key={o.id} data-chosen={entry.data.chosen === o.id || undefined}>
                  <span>{o.label}{entry.data.proposal === o.id ? <em className="rc-hint"> · propuesta</em> : null}{entry.data.chosen === o.id ? <strong> · elegida</strong> : null}</span>
                  {entry.data.chosen ? null : <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" onClick={() => onChoose(o.id)}>Elegir</button>}
                </li>
              ))}
            </ul>
            {entry.data.chosen ? <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={onReopen}>Reabrir la decisión</button> : null}
          </Field>
          {entry.data.affects.length ? <Field label="Afecta a">{entry.data.affects.map(id => link(id))}</Field> : null}
        </>
      ) : null}
    </div>
  );
}

function CharacterView({entry, names, link}: {entry: EntryOf<'character'>; names: Names; link: (id: string, label?: string) => React.ReactNode}) {
  const d = entry.data;
  return (
    <>
      {d.missing ? <p className="rc-kb-warning">Sin imagen verificada: no generar una y presentarla como canónica.</p> : null}
      <Field label="Nombre ruso">{d.nameRu || '—'}</Field>
      <Field label="Alias de búsqueda">{d.aliases.join(', ') || '—'}</Field>
      {d.role ? <Field label="En el manifiesto">{d.role}</Field> : null}
      <Field label="Descripción confirmada">{d.look ? d.look : <span className="rc-hint">Sin descripción confirmada. Los modelos de texto reciben solo lo aprobado.</span>}</Field>
      <Field label="Relaciones">{d.relations.length ? <ul>{d.relations.map((r, i) => <li key={i}>{r.label} {link('char.' + r.to, nameOf(names, r.to))}</li>)}</ul> : 'sin datos'}</Field>
      {d.distinct.length ? <Field label="No confundir con">{d.distinct.map(id => link('char.' + id, nameOf(names, id)))}</Field> : null}
      {d.manifest ? <Field label="Archivo del manifiesto">{d.manifest.asset || 'ninguno'}{d.manifest.sourceName ? ' · origen: ' + d.manifest.sourceName : ''}{d.manifest.sha256 ? ' · sha256 ' + d.manifest.sha256.slice(0, 12) + '…' : ''}</Field> : null}
    </>
  );
}

function EntryForm({entry, names, onCancel, onSave}: {entry: KbEntry; names: Names; onCancel: () => void; onSave: (change: EntryChange, note: string) => void}) {
  const [title, setTitle] = useState(entry.title);
  const [body, setBody] = useState(entry.body);
  const [note, setNote] = useState('');
  const [data, setData] = useState<Record<string, string>>(() => formData(entry));
  const set = (k: string, v: string) => setData(d => ({...d, [k]: v}));
  const ids = useMemo(() => [...names.keys()].filter(id => id !== entry.id.replace(/^char\./, '')), [names, entry.id]);

  function submit() {
    const next = parseForm(entry, data);
    if (next === null) { toast('Revisá los números de página: van como «13-18».'); return; }
    onSave({title: title.trim() || entry.title, body, data: next}, note.trim() || 'Editado');
  }

  return (
    <form className="rc-kb-form" onSubmit={e => { e.preventDefault(); submit(); }}>
      <label className="rc-field"><span>Título</span><input className="rc-input" required maxLength={300} value={title} onChange={e => setTitle(e.target.value)} /></label>
      <label className="rc-field"><span>Texto</span><textarea className="rc-textarea" rows={5} maxLength={60000} value={body} onChange={e => setBody(e.target.value)} /></label>
      {entry.kind === 'character' ? (
        <>
          <label className="rc-field"><span>Nombre ruso</span><input className="rc-input" maxLength={120} value={data.nameRu} onChange={e => set('nameRu', e.target.value)} /></label>
          <label className="rc-field"><span>Alias de búsqueda (separados por comas)</span><input className="rc-input" value={data.aliases} onChange={e => set('aliases', e.target.value)} /><small className="rc-hint">Un alias que compartan dos personajes se marca como ambiguo y no se le asigna a ninguno.</small></label>
          <label className="rc-field"><span>Descripción confirmada (rostro, pelo, cuerpo, edad)</span><textarea className="rc-textarea" rows={3} maxLength={2000} value={data.look} onChange={e => set('look', e.target.value)} /><small className="rc-hint">Es lo que reciben los modelos de texto en lugar de las imágenes. La ropa puede variar por escena.</small></label>
          <label className="rc-field"><span>Relaciones (una por línea: «madre de: id»)</span><textarea className="rc-textarea" rows={3} value={data.relations} onChange={e => set('relations', e.target.value)} /><small className="rc-hint">Ids: {ids.join(', ')}</small></label>
          <label className="rc-field"><span>No confundir con (ids separados por comas)</span><input className="rc-input" value={data.distinct} onChange={e => set('distinct', e.target.value)} /></label>
          <label className="rc-kb-check"><input type="checkbox" checked={data.missing === '1'} onChange={e => set('missing', e.target.checked ? '1' : '')} />No tiene imagen verificada</label>
        </>
      ) : null}
      {entry.kind === 'unit' ? (
        <>
          <label className="rc-field"><span>Título de la unidad</span><input className="rc-input" maxLength={200} value={data.title} onChange={e => set('title', e.target.value)} /></label>
          <label className="rc-field"><span>Páginas</span><input className="rc-input" placeholder="13-18" value={data.pages} onChange={e => set('pages', e.target.value)} /></label>
          <label className="rc-field"><span>Objetivo</span><textarea className="rc-textarea" rows={2} maxLength={2000} value={data.goal} onChange={e => set('goal', e.target.value)} /></label>
          <label className="rc-field"><span>Gramática y temas enseñados (uno por línea)</span><textarea className="rc-textarea" rows={4} value={data.grammar} onChange={e => set('grammar', e.target.value)} /></label>
          <label className="rc-field"><span>Expresiones sin explicación formal (una por línea)</span><textarea className="rc-textarea" rows={3} value={data.expressions} onChange={e => set('expressions', e.target.value)} /></label>
          <label className="rc-field"><span>No introducir todavía (uno por línea)</span><textarea className="rc-textarea" rows={2} value={data.notYet} onChange={e => set('notYet', e.target.value)} /></label>
        </>
      ) : null}
      {entry.kind === 'page' ? (
        <label className="rc-field"><span>Texto de la página</span><textarea className="rc-textarea rc-kb-pagetext" rows={10} maxLength={30000} value={data.text} onChange={e => set('text', e.target.value)} /></label>
      ) : null}
      {entry.kind === 'decision' ? (
        <>
          <label className="rc-field"><span>Pregunta</span><textarea className="rc-textarea" rows={2} maxLength={1000} value={data.question} onChange={e => set('question', e.target.value)} /></label>
          <label className="rc-field"><span>Opciones (una por línea)</span><textarea className="rc-textarea" rows={4} value={data.options} onChange={e => set('options', e.target.value)} /></label>
        </>
      ) : null}
      <label className="rc-field"><span>Qué cambiaste (queda en el historial)</span><input className="rc-input" maxLength={200} value={note} onChange={e => setNote(e.target.value)} placeholder="Editado" /></label>
      <div className="rc-kb-actions">
        <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="rc-btn rc-btn--primary rc-btn--sm">Guardar como versión nueva</button>
      </div>
    </form>
  );
}

function formData(e: KbEntry): Record<string, string> {
  if (e.kind === 'character') return {
    nameRu: e.data.nameRu, aliases: e.data.aliases.join(', '), look: e.data.look || '', distinct: e.data.distinct.join(', '),
    relations: e.data.relations.map(r => r.label + ': ' + r.to).join('\n'), missing: e.data.missing ? '1' : '',
  };
  if (e.kind === 'unit') return {
    title: e.data.title, pages: e.data.pages ? e.data.pages.join('-') : '', goal: e.data.goal || '',
    grammar: e.data.grammar.join('\n'), expressions: e.data.expressions.join('\n'), notYet: e.data.notYet.join('\n'),
  };
  if (e.kind === 'page') return {text: e.data.text};
  if (e.kind === 'decision') return {question: e.data.question, options: e.data.options.map(o => o.label).join('\n')};
  return {};
}

/** The data of the entry with the form's values; null when a value cannot be read. */
function parseForm(e: KbEntry, f: Record<string, string>): unknown {
  if (e.kind === 'character') {
    const {look: _look, missing: _missing, ...rest} = e.data;
    return {
      ...rest, nameRu: f.nameRu.trim(), aliases: list(f.aliases), distinct: list(f.distinct),
      relations: lines(f.relations).flatMap(l => { const at = l.lastIndexOf(':'); return at > 0 ? [{label: l.slice(0, at).trim(), to: l.slice(at + 1).trim()}] : []; }),
      ...(f.look.trim() ? {look: f.look.trim()} : {}), ...(f.missing ? {missing: true} : {}),
    };
  }
  if (e.kind === 'unit') {
    const m = f.pages.trim() ? f.pages.match(/^(\d+)\s*[-–]\s*(\d+)$/) : null;
    if (f.pages.trim() && !m) return null;
    const {pages: _pages, goal: _goal, ...rest} = e.data;
    return {...rest, title: f.title.trim(), grammar: lines(f.grammar), expressions: lines(f.expressions), notYet: lines(f.notYet), ...(m ? {pages: [Number(m[1]), Number(m[2])]} : {}), ...(f.goal.trim() ? {goal: f.goal.trim()} : {})};
  }
  if (e.kind === 'page') return {...e.data, text: f.text};
  if (e.kind === 'decision') {
    const labels = lines(f.options);
    const options = labels.map((label, i) => e.data.options.find(o => o.label === label) || {id: 'o' + (i + 1) + '-' + Math.random().toString(36).slice(2, 6), label});
    return {...e.data, question: f.question.trim(), options};
  }
  return e.data;
}
