'use client';
import {useEffect, useMemo, useRef, useState} from 'react';
import Link from 'next/link';
import TextareaAutosize from 'react-textarea-autosize';
import {z} from 'zod';
import {toast} from 'sonner';
import {BookMarked, Check, Images, TriangleAlert} from 'lucide-react';
import {textAnswer} from '@/lib/ai/text-request';
import {errorDetail} from '@/lib/cinema/errors';
import {addComponent, addPage, updateComponent} from '@/lib/manual/edit';
import {composeComponent, contentWidth, placeOnPage} from '@/lib/manual/compose';
import {imageFromFile} from '@/lib/manual/browser';
import type {CinemaJob} from '@/store/cinema';
import {plainText} from '@/lib/manual/elements';
import type {Block, Component, Page} from '@/lib/manual/model';
import {bookForUnit, usedOf, type BookUsed} from '@/lib/kb/context';
import {buildIndex, findCharacters} from '@/lib/kb/names';
import {listEntries, projectOfUnit} from '@/lib/kb/store';
import type {EntryOf, KbEntry, KbProject} from '@/lib/kb/model';
import {libraryEvents} from '@/lib/books/library';
import {useAssistants, type Assistant} from '@/store/assistants';
import {AssistantSelect} from '@/components/studio/assistant-chooser';
import {MessageMarkdown} from '@/components/studio/message-markdown';
import type {ManualApi} from '@/components/manual/manual-inspector';
import {BookUsedNote} from './book-used';
import {BookImageDialog} from './book-image';

type Exercise = Extract<Component, {type: 'exercise'}>;
const answerSchema = z.object({
  summary: z.string().max(2000),
  changes: z.array(z.string().max(600)).max(20).default([]),
  risks: z.array(z.string().max(600)).max(20).default([]),
  exercise: z.object({
    instruction: z.string().min(1).max(300),
    example: z.array(z.string().max(300)).max(6).default([]),
    items: z.array(z.string().max(300)).min(1).max(40),
    answers: z.array(z.string().max(300)).max(40).default([]),
    columns: z.union([z.literal(1), z.literal(2)]).default(1),
  }),
});
type Proposal = z.infer<typeof answerSchema> & {blockId: string; before: Exercise; used: BookUsed | null};

/** The JSON object in a model answer (it may come inside a code fence). */
function parseProposal(text: string) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { const r = answerSchema.safeParse(JSON.parse(text.slice(start, end + 1))); return r.success ? r.data : null; } catch { return null; }
}

/** The page's text in reading order: top to bottom, then left to right. */
export function pageText(page: Page) {
  const lines = page.blocks.flatMap(b => b.elements).flatMap(e => e.kind === 'text' && plainText(e).trim() ? [{y: e.y, x: e.x, t: plainText(e)}] : []);
  return lines.sort((a, b) => b.y - a.y || a.x - b.x).map(l => l.t).join('\n');
}
const blockText = (b: Block) => b.elements.flatMap(e => e.kind === 'text' ? [plainText(e)] : []).join('\n');
/** The book page number printed in the footer, when the page has one. */
export function printedNumber(page: Page) {
  for (const b of page.blocks) for (const e of b.elements) if (e.kind === 'text' && e.role === 'page-number') { const n = Number(plainText(e).trim()); if (Number.isInteger(n) && n > 0) return n; }
  return undefined;
}
const exerciseText = (c: Exercise) => [
  'Consigna: ' + c.instruction,
  c.example.length ? 'Ejemplo: ' + c.example.join(' | ') : '',
  'Ítems:\n' + c.items.map((x, i) => (i + 1) + '. ' + x + (c.answers?.[i] ? ' → ' + c.answers[i] : '')).join('\n'),
].filter(Boolean).join('\n');

/** What changes beyond the text, found without the model: the recorded audio, the teacher's answers, the size. */
export function consequences(before: Exercise, after: Proposal['exercise'], locked: boolean) {
  const out: string[] = [];
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  if (locked) out.push('El bloque está aprobado (bloqueado): el cambio modifica material aprobado.');
  if (before.audio && (!same(before.items, after.items) || !same(before.example, after.example) || before.instruction !== after.instruction)) out.push('El audio ' + before.audio + ' se grabó con el ejercicio anterior: si se aplica, la grabación ya no coincide.');
  if (!same(before.answers || [], after.answers)) out.push('Cambian las respuestas para el profesor.');
  if (before.items.length !== after.items.length) out.push('Pasa de ' + before.items.length + ' a ' + after.items.length + ' ítems: el bloque cambia de alto en la página.');
  out.push('Se cambia solo este ejercicio: el resto de la página, el encabezado, el pie y las ilustraciones quedan como están. El número y el código de audio se conservan.');
  return out;
}

const quick = [
  '¿Qué sabe el alumno hasta esta página?',
  'Revisá el ruso, los acentos y la tipografía de esta página.',
  'Buscá contradicciones con el canon (parentesco, apariencia, historia, numeración).',
  'Proponé cómo seguir en la página siguiente, compatible con lo visto.',
  'Sugerí mejoras de legibilidad y composición sin salir de la plantilla.',
];
const modes = [
  ['Más difícil', 'Hacelo más difícil para este nivel, explicando qué cambia.'],
  ['Más entretenido', 'Hacelo más entretenido sin agregar dificultad.'],
  ['Más variado', 'Hacelo más variado (tipos de ítem, contextos) sin agregar dificultad.'],
  ['Corregir ruso y acentos', 'Corregí el ruso, los acentos y la tipografía sin cambiar el contenido.'],
] as const;

/** PDF Studio → Manual → Libro: the book context of the open unit, and the assistant that uses it. */
export function EditorBookPanel({api, onVersion}: {api: ManualApi; onVersion: (label: string) => Promise<void>}) {
  const [project, setProject] = useState<KbProject | null | undefined>(undefined);
  const [entries, setEntries] = useState<KbEntry[]>([]);
  const [request, setRequest] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [answer, setAnswer] = useState<{text: string; used: BookUsed | null} | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState('');
  const [agree, setAgree] = useState(false);
  const [assistant, setAssistant] = useState<Assistant | null>(null);
  const [picture, setPicture] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const hydrateAssistants = useAssistants(s => s.hydrate);
  useEffect(() => { hydrateAssistants(); }, [hydrateAssistants]);
  useEffect(() => () => abort.current?.abort(), []);

  useEffect(() => {
    let alive = true;
    const load = () => projectOfUnit(api.unit.id).then(async p => {
      if (!alive) return;
      setProject(p);
      setEntries(p ? await listEntries(p.id) : []);
    }).catch(() => { if (alive) setProject(null); });
    void load();
    libraryEvents?.addEventListener('change', load);
    libraryEvents?.addEventListener('synced', load);
    return () => { alive = false; libraryEvents?.removeEventListener('change', load); libraryEvents?.removeEventListener('synced', load); };
  }, [api.unit.id]);

  const text = useMemo(() => pageText(api.page), [api.page]);
  const block = api.page.blocks.find(b => b.id === api.selection.block) || null;
  const exercise = block?.component?.type === 'exercise' ? block.component : null;
  const unitNumber = project ? project.units[api.unit.id] || undefined : undefined;
  const unitEntry = entries.find((e): e is EntryOf<'unit'> => e.kind === 'unit' && e.data.number === unitNumber);
  const bookPage = printedNumber(api.page) ?? (unitEntry?.data.pages ? unitEntry.data.pages[0] + api.pageIndex : undefined);
  const characters = useMemo(() => {
    const chars = entries.filter((e): e is EntryOf<'character'> => e.kind === 'character' && e.status !== 'superseded');
    const index = buildIndex(chars.map(c => ({id: c.id.replace(/^char\./, ''), nameRu: c.data.nameRu || c.title, aliases: c.data.aliases})));
    const found = findCharacters(text + '\n' + (block ? blockText(block) : ''), index);
    return {list: found.ids.map(id => chars.find(c => c.id === 'char.' + id)!).filter(Boolean), ambiguous: found.ambiguous};
  }, [entries, text, block]);
  const affects = new Set([...characters.list.map(c => c.id), 'unit.' + unitNumber, 'page.' + bookPage]);
  const decisions = entries.filter((e): e is EntryOf<'decision'> => e.kind === 'decision' && e.status === 'pending' && e.data.affects.some(a => affects.has(a)));

  if (project === undefined) return <p className="rc-hint">Buscando el libro de esta unidad…</p>;
  if (!project) return (
    <div className="rc-pdf-form">
      <p className="rc-hint">Esta unidad no pertenece a ningún libro, así que el asistente no recibe contexto de libro aquí. Para usarlo, vinculala en <Link href="/workspace/libro" className="rc-kb-link">Contexto del libro → Unidades y asistentes</Link>.</p>
    </div>
  );

  async function run<T>(kind: string, purpose: 'book-assist' | 'book-exercise', ask: string, content: string, read: (text: string, used: BookUsed | null) => T | null, apply: (v: T) => void) {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(kind); setError(''); setAnswer(null); setProposal(null); setAgree(false);
    try {
      const book = await bookForUnit(api.unit.id, {query: ask, page: bookPage, context: content});
      const used = book ? usedOf(book) : null;
      const r = await textAnswer(purpose, content, {signal: controller.signal, assistant, book: book?.payload});
      const value = read(r.text, used);
      if (value === null) throw Error('INVALID_ANSWER');
      apply(value);
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'PROVIDER_UNAVAILABLE');
    } finally { setBusy(null); }
  }

  const ask = (q: string) => {
    const content = q + '\n\nPÁGINA ' + (bookPage ?? api.pageIndex + 1) + ' (texto del editor):\n' + text.slice(0, 12000) + (block ? '\n\nBLOQUE ELEGIDO (' + block.label + '):\n' + blockText(block).slice(0, 4000) : '');
    void run('ask', 'book-assist', q, content, (t, used) => t ? {text: t, used} : null, setAnswer);
  };
  const improve = (how: string) => {
    if (!block || !exercise) return;
    const before = exercise;
    const content = 'PEDIDO: ' + how + '\n\nEJERCICIO ' + before.number + (before.audio ? ' (audio ' + before.audio + ')' : '') + ':\n' + exerciseText(before) + '\n\nPÁGINA ' + (bookPage ?? api.pageIndex + 1) + ':\n' + text.slice(0, 8000);
    void run('improve', 'book-exercise', how, content, (t, used) => { const p = parseProposal(t); return p ? {...p, blockId: block.id, before, used} : null; }, setProposal);
  };

  async function applyProposal(p: Proposal) {
    const current = api.page.blocks.find(b => b.id === p.blockId);
    if (!current || current.component?.type !== 'exercise') { toast('El ejercicio ya no está en esta página.'); return; }
    await onVersion('Antes del cambio del asistente en el ejercicio ' + p.before.number);
    const next: Exercise = {...current.component, instruction: p.exercise.instruction, example: p.exercise.example, items: p.exercise.items, answers: p.exercise.answers, columns: p.exercise.columns};
    api.change(updateComponent(api.fonts, api.unit, api.page.id, p.blockId, next));
    setProposal(null);
    toast('Cambio aplicado en el ejercicio ' + p.before.number + '. La versión anterior quedó guardada en «Versiones».', {duration: 8000});
  }

  const locked = Boolean(proposal && api.page.blocks.find(b => b.id === proposal.blockId)?.locked);

  /** A reviewed picture goes on this page as a new photo, where it fits; the rest of the page is left as it is. */
  async function insertPicture(blob: Blob, job: CinemaJob, onNewPage = false) {
    const image = await imageFromFile(new File([blob], 'ilustracion', {type: blob.type || 'image/png'}));
    const full = contentWidth(api.unit.template, api.page);
    const picture = (w: number): Component => ({type: 'image', image, width: w, height: w * image.height / image.width, rounded: true, prompt: job.prompt.slice(0, 2000)});
    const fit = (page: Page) => {
      for (const share of [0.6, 0.45, 0.3]) {
        const c = picture(full * share);
        const probe = composeComponent({fonts: api.fonts, template: api.unit.template, page, idPrefix: 'probe', z: 0}, c, [0, page.height]);
        const at = placeOnPage(api.fonts, api.unit.template, page, probe.height);
        if (at) return {c, at};
      }
      return null;
    };
    // On this page if it fits (smaller if needed), never over other content. A new page changes the numbers of the
    // pages after it, so it is only made when the author asks for it.
    let unit = api.unit, target = api.page, index = api.pageIndex, place = onNewPage ? null : fit(api.page);
    if (!place && !onNewPage) {
      toast('No entra en lo que queda de esta página.', {duration: 12000, action: {label: 'En una página nueva', onClick: () => { void insertPicture(blob, job, true); }}, description: 'Una página nueva después de esta cambia el número de las siguientes.'});
      return;
    }
    if (onNewPage) {
      const made = addPage(api.fonts, api.unit, api.pageIndex);
      unit = made.unit; target = made.page; index = api.pageIndex + 1; place = fit(made.page);
    }
    if (!place) { toast('La imagen no entra en una página del manual.'); return; }
    await onVersion('Antes de insertar una ilustración generada');
    const {unit: out, block} = addComponent(api.fonts, unit, target.id, place.c, place.at);
    api.change(out);
    if (index !== api.pageIndex) api.goToPage(index);
    if (block) api.select({block: block.id, element: null});
    setPicture(false);
    toast((onNewPage ? 'Ilustración insertada en una página nueva. ' : 'Ilustración insertada. ') + 'La versión anterior quedó guardada en «Versiones».', {duration: 8000});
  }

  return (
    <div className="rc-pdf-form rc-kb-editor">
      <div className="rc-pdf-form-head"><span className="rc-pdf-kind"><BookMarked aria-hidden="true" /> {project.name}</span></div>
      <p className="rc-kb-editor-where">
        Unidad {unitNumber ?? '¿?'}{unitEntry?.data.title ? ' · ' + unitEntry.data.title : ''} · página {bookPage ?? '¿?'}
        {unitEntry ? <span className="rc-hint"> · {unitEntry.status === 'approved' ? 'aprobada' : 'sin aprobar'}</span> : null}
      </p>
      <p className="rc-hint"><Link href={'/workspace/libro?p=' + project.id} className="rc-kb-link">Abrir el contexto del libro</Link></p>
      <div className="rc-field">
        <span>Personajes en esta página</span>
        {characters.list.length ? (
          <p className="rc-kb-chips">{characters.list.map(c => <Link key={c.id} href={'/workspace/libro?p=' + project.id + '&e=' + c.id} className="rc-chip" data-status={c.status}>{c.title}{c.data.missing ? ' · sin imagen' : ''}</Link>)}</p>
        ) : <p className="rc-hint">El texto de la página no nombra personajes del libro.</p>}
        {characters.ambiguous.map(a => <p key={a.alias} className="rc-kb-warning">«{a.alias}» puede ser más de un personaje: se pregunta antes de suponer.</p>)}
      </div>
      {decisions.length ? (
        <div className="rc-field"><span>Decisiones pendientes que tocan esta página</span>
          <ul className="rc-kb-editor-decisions">{decisions.map(d => <li key={d.id}><Link href={'/workspace/libro?p=' + project.id + '&e=' + d.id} className="rc-kb-link">{d.title}</Link></li>)}</ul>
        </div>
      ) : null}

      <p className="rc-hint">Cada pedido lleva tus palabras, esta página y solo los datos del libro que correspondan (unidad, personajes nombrados, reglas y decisiones), como material de referencia. Usa un modelo de texto de Kie: puede consumir créditos. Nada cambia hasta que lo apliques.</p>
      <AssistantSelect scope="pdf" value={assistant?.id || null} onChange={setAssistant} />
      <div className="rc-field">
        <span>Preguntale al asistente del libro</span>
        <p className="rc-kb-quick">{quick.map(q => <button key={q} type="button" className="rc-chip" disabled={Boolean(busy)} onClick={() => ask(q)}>{q}</button>)}</p>
        <TextareaAutosize className="rc-textarea rc-pdf-text" minRows={2} maxRows={6} maxLength={2000} value={request} onChange={e => setRequest(e.target.value)} placeholder="Por ejemplo: «¿Esta página usa algo que la unidad todavía no enseñó?»" />
        <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" disabled={Boolean(busy) || !request.trim()} onClick={() => ask(request.trim())}>{busy === 'ask' ? 'Pensando…' : 'Preguntar'}</button>
      </div>

      <div className="rc-field">
        <span>Ilustración</span>
        <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" onClick={() => setPicture(true)}><Images aria-hidden="true" />Ilustración con personajes del libro…</button>
        <p className="rc-hint">Con las imágenes aprobadas de la biblioteca como referencia. Se revisa antes de insertarla en esta página.</p>
      </div>
      <BookImageDialog open={picture} onClose={() => setPicture(false)} project={project} entries={entries} initial={characters.list.map(c => c.id)} onInsert={insertPicture} />

      <div className="rc-field">
        <span>Cambiar el ejercicio elegido</span>
        {exercise ? (
          <>
            <p className="rc-pdf-quote">Ejercicio {exercise.number}: {exercise.instruction}</p>
            <p className="rc-kb-quick">{modes.map(([label, how]) => <button key={label} type="button" className="rc-chip" disabled={Boolean(busy)} onClick={() => improve(how)}>{label}</button>)}</p>
          </>
        ) : block ? <p className="rc-hint">Este bloque viene del PDF importado: el asistente puede sugerir cambios con «Preguntar», y el texto se corrige con las herramientas de «Selección». Las propuestas con vista previa y «Aplicar» son para los ejercicios hechos en el editor.</p>
          : <p className="rc-hint">Elegí en la página un ejercicio hecho en el editor.</p>}
      </div>

      {busy === 'improve' ? <p className="rc-hint" role="status">Preparando la propuesta…</p> : null}
      {error ? (
        <div className="rc-msg-error" role="alert">
          <span className="rc-dot rc-dot--danger" aria-hidden="true" />
          <span className="rc-msg-error-text">No pude completar el pedido.</span>
          <details className="rc-msg-error-details"><summary>Detalles</summary><p>{error === 'INVALID_ANSWER' ? 'El modelo respondió con un formato inesperado. Probá de nuevo.' : errorDetail(error)}</p></details>
        </div>
      ) : null}

      {answer ? (
        <section className="rc-pdf-result" aria-label="Respuesta del asistente">
          <div className="rc-kb-answer"><MessageMarkdown content={answer.text} /></div>
          {answer.used ? <p className="rc-hint"><BookUsedNote used={answer.used} /></p> : null}
        </section>
      ) : null}

      {proposal ? (
        <section className="rc-pdf-result" aria-label="Cambio propuesto">
          <p className="rc-pdf-result-summary">{proposal.summary}</p>
          {proposal.changes.length ? <ul className="rc-kb-list-plain">{proposal.changes.map((c, i) => <li key={i}>{c}</li>)}</ul> : null}
          <div className="rc-kb-compare">
            <div><span className="rc-hint">Antes</span><strong>{proposal.before.instruction}</strong><ol>{proposal.before.items.map((x, i) => <li key={i}>{x}{proposal.before.answers?.[i] ? <em> → {proposal.before.answers[i]}</em> : null}</li>)}</ol></div>
            <div><span className="rc-hint">Después</span><strong>{proposal.exercise.instruction}</strong>{proposal.exercise.example.length ? <p className="rc-hint">{proposal.exercise.example.join(' · ')}</p> : null}<ol>{proposal.exercise.items.map((x, i) => <li key={i}>{x}{proposal.exercise.answers[i] ? <em> → {proposal.exercise.answers[i]}</em> : null}</li>)}</ol></div>
          </div>
          <div className="rc-kb-consequences">
            <strong><TriangleAlert aria-hidden="true" /> Qué cambia al aplicar</strong>
            <ul>{[...consequences(proposal.before, proposal.exercise, locked), ...proposal.risks].map((c, i) => <li key={i}>{c}</li>)}</ul>
          </div>
          {proposal.used ? <p className="rc-hint"><BookUsedNote used={proposal.used} /></p> : null}
          {locked ? <label className="rc-kb-check"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />Entiendo que cambia material aprobado</label> : null}
          <span className="rc-pdf-inline">
            <button type="button" className="rc-btn rc-btn--primary rc-btn--sm" disabled={locked && !agree} onClick={() => void applyProposal(proposal)}><Check aria-hidden="true" />Guardar versión y aplicar</button>
            <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => setProposal(null)}>Descartar</button>
          </span>
        </section>
      ) : null}
    </div>
  );
}
