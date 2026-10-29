'use client';
import {useEffect, useMemo, useRef, useState} from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import {z} from 'zod';
import {toast} from 'sonner';
import {Check, Crosshair, Images, ListChecks, Sparkles, Square, X} from 'lucide-react';
import {textAnswer} from '@/lib/ai/text-request';
import {errorDetail} from '@/lib/cinema/errors';
import {nextExercise} from '@/lib/manual/compose';
import {renderUnit} from '@/lib/manual/render';
import {getAsset} from '@/lib/manual/store';
import {openPdf} from '@/lib/pdf/viewer';
import {pagePicture} from '@/lib/manual/page-picture';
import {applyFinding, parseReview, reviewRequest, reviewTexts, type ReviewFinding} from '@/lib/manual/review';
import type {Component} from '@/lib/manual/model';
import type {CinemaJob} from '@/store/cinema';
import {useManualReview, type PageReview} from '@/store/manual-review';
import {listEntries, projectOfUnit} from '@/lib/kb/store';
import type {KbEntry, KbProject} from '@/lib/kb/model';
import {libraryEvents} from '@/lib/books/library';
import {ConfirmDialog} from '@/components/ui/dialog';
import {ChatModelPicker, usable, type ChatModel} from '@/components/studio/chat-model-picker';
import {useStoredModel, useTextModels} from '@/components/pdf/use-doc-chat';
import {BookImageDialog} from '@/components/kb/book-image';
import {pageText} from '@/components/kb/editor-book-panel';
import type {ManualApi} from './manual-inspector';
import {pictureComponents, place} from './place';
import {Diff, kindNames} from './review-diff';

type Exercise = Extract<Component, {type: 'exercise'}>;

/** The model a choice means: «Automático» is the fast Gemini model, as on the server. */
const resolved = (models: ChatModel[], id: string) => id === 'auto' ? models.find(m => m.id === 'kie-flash') || models.find(usable) : models.find(m => m.id === id);
const seesImages = (m?: ChatModel) => Boolean(m?.inputs?.includes('image'));

/** PDF Studio → Manual → IA: review the Russian and the English, new exercises, illustrations with speech bubbles. */
export function ManualAiPanel({api, onVersion}: {api: ManualApi; onVersion: (label: string) => Promise<void>}) {
  const {models, failed} = useTextModels();
  const [modelId, setModelId] = useStoredModel('rc-manual-ai-model');
  const model = resolved(models, modelId);
  const sees = seesImages(model);
  return (
    <div className="rc-pdf-form rc-man-ai">
      <div className="rc-field">
        <span>Modelo</span>
        {models.length ? <ChatModelPicker models={models} value={modelId} onChange={setModelId} title="Modelo para revisar y crear" /> : <span className="rc-hint">{failed ? 'No se pudo leer la lista de modelos.' : 'Cargando modelos…'}</span>}
        {model ? <p className="rc-hint">{sees ? model.name + ' ve la imagen de cada página: también lee el texto de las fotos y los globos.' : model.name + ' solo lee el texto de la página: Kie no documenta que reciba imágenes.'}</p> : null}
      </div>
      <ReviewSection api={api} onVersion={onVersion} modelId={modelId} model={model} />
      <ExerciseSection api={api} onVersion={onVersion} modelId={modelId} />
      <BubblesSection api={api} onVersion={onVersion} />
    </div>
  );
}

function ReviewSection({api, onVersion, modelId, model}: {api: ManualApi; onVersion: (label: string) => Promise<void>; modelId: string; model?: ChatModel}) {
  const {pages, done, put, mark} = useManualReview();
  const [running, setRunning] = useState<{index: number; of: number[]} | null>(null);
  const [error, setError] = useState<{page: number; code: string} | null>(null);
  const [askAll, setAskAll] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const versioned = useRef(false);
  useEffect(() => () => abort.current?.abort(), []);

  const unit = api.unit;
  const current = pages[unit.id + ':' + api.page.id];
  const open = (r?: PageReview) => (r?.findings || []).filter(f => !done[f.key]);
  const reviewed = unit.pages.map((p, i) => ({i, r: pages[unit.id + ':' + p.id]})).filter(x => x.r);
  const sees = seesImages(model);

  async function reviewPage(index: number, signal: AbortSignal): Promise<PageReview> {
    const page = api.unit.pages[index];
    const texts = reviewTexts(page);
    const attachments = sees ? [await pagePicture(api.unit, api.fonts, index)] : [];
    const at = Date.now();
    if (!texts.length && !attachments.length) return {pageId: page.id, summary: 'La página no tiene texto.', findings: [], model: model?.name || '', picture: false, at};
    const r = await textAnswer('manual-review', reviewRequest(texts, {unit: api.unit.title, page: index + 1, pages: api.unit.pages.length, picture: attachments.length > 0}), {signal, model: modelId, attachments});
    const parsed = parseReview(r.text, texts, page.id);
    if (!parsed) throw Error('INVALID_ANSWER');
    return {pageId: page.id, summary: parsed.summary, findings: parsed.findings, model: r.model || model?.name || '', picture: attachments.length > 0, credits: r.credits, at};
  }

  async function run(indexes: number[]) {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setError(null);
    for (const index of indexes) {
      if (controller.signal.aborted) break;
      setRunning({index, of: indexes});
      try {
        put(unit.id, await reviewPage(index, controller.signal));
      } catch (e) {
        if (!controller.signal.aborted) setError({page: index, code: e instanceof Error ? e.message : 'PROVIDER_UNAVAILABLE'});
        break;
      }
    }
    setRunning(null);
  }

  /** One correction, or all those of this page: a version first (once per session), then letter by letter. */
  async function apply(list: ReviewFinding[]) {
    if (!versioned.current) { await onVersion('Antes de la revisión con IA'); versioned.current = true; }
    let next = api.unit;
    const failedOnes: string[] = [];
    let applied = 0;
    for (const f of list) {
      if (!f.apply) continue;
      const out = applyFinding(api.fonts, next, api.page.id, f.apply);
      if ('error' in out) { failedOnes.push(out.error); continue; }
      next = out.unit; applied++;
      mark(f.key, 'applied');
    }
    if (applied) api.change(next);
    if (failedOnes.length) toast(failedOnes[0] + (failedOnes.length > 1 ? ' (y ' + (failedOnes.length - 1) + ' más)' : ''), {duration: 8000});
    else if (applied > 1) toast(applied + ' correcciones aplicadas. Se pueden deshacer, y la versión anterior está en «Versiones».');
  }

  const reveal = (f: ReviewFinding) => {
    const t = f.text?.target;
    if (t) api.reveal({block: t.blockId, element: t.kind === 'element' ? t.elementId : null});
  };

  const shown = open(current);
  const applicable = shown.filter(f => f.apply);
  const busy = Boolean(running);
  const credits = reviewed.reduce((n, x) => n + (x.r.credits || 0), 0);

  return (
    <section className="rc-field rc-man-ai-section" aria-label="Revisar con IA">
      <span>Revisar con IA</span>
      <p className="rc-hint">Revisa el ruso y las traducciones al inglés: ortografía, gramática, tildes de acento, letras latinas mezcladas y traducciones que no coinciden. El español no se revisa. Nada cambia hasta que tocás «Aplicar», y los bloques aprobados nunca se cambian desde acá.</p>
      <span className="rc-pdf-inline">
        <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" disabled={busy || !model} onClick={() => void run([api.pageIndex])}><ListChecks aria-hidden="true" />Revisar esta página</button>
        <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" disabled={busy || !model} onClick={() => setAskAll(true)}>Revisar toda la unidad ({unit.pages.length})</button>
      </span>
      {running ? (
        <p className="rc-hint rc-man-ai-progress" role="status">
          Revisando la página {running.index + 1}{running.of.length > 1 ? ' (' + (running.of.indexOf(running.index) + 1) + ' de ' + running.of.length + ')' : ''}…
          <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => abort.current?.abort()}><Square aria-hidden="true" />Detener</button>
        </p>
      ) : null}
      {error ? (
        <div className="rc-msg-error" role="alert">
          <span className="rc-dot rc-dot--danger" aria-hidden="true" />
          <span className="rc-msg-error-text">No se pudo revisar la página {error.page + 1}.</span>
          <details className="rc-msg-error-details"><summary>Detalles</summary><p>{error.code === 'INVALID_ANSWER' ? 'El modelo respondió con un formato inesperado. Probá de nuevo u otro modelo.' : error.code === 'IMAGES_NOT_SUPPORTED' ? 'Este modelo no recibe imágenes en Kie.' : errorDetail(error.code)}</p></details>
        </div>
      ) : null}

      {reviewed.length > 1 || (reviewed.length === 1 && reviewed[0].i !== api.pageIndex) ? (
        <div className="rc-man-ai-pages">
          <span className="rc-hint">Páginas revisadas{credits ? ' · Kie informó ' + credits.toLocaleString('es-AR', {maximumFractionDigits: 2}) + ' créditos' : ''}:</span>
          <p className="rc-kb-quick">{reviewed.map(({i, r}) => {
            const n = open(r).length;
            return <button key={i} type="button" className="rc-chip" aria-current={i === api.pageIndex ? 'page' : undefined} onClick={() => api.goToPage(i)}>Pág. {i + 1}: {n ? n + (n === 1 ? ' hallazgo' : ' hallazgos') : 'sin pendientes'}</button>;
          })}</p>
        </div>
      ) : null}

      {current ? (
        <div className="rc-man-ai-results" aria-label={'Hallazgos de la página ' + (api.pageIndex + 1)}>
          <p className="rc-pdf-result-summary">{current.summary || 'Revisión terminada.'}</p>
          <p className="rc-hint">{current.model}{current.picture ? ' · con la imagen de la página' : ' · solo el texto'}{current.credits !== undefined ? ' · ' + current.credits + ' créditos' : ''}</p>
          {!shown.length ? <p className="rc-hint">{current.findings.length ? 'No quedan hallazgos pendientes en esta página.' : 'No encontró problemas en el ruso ni en el inglés de esta página.'}</p> : null}
          {applicable.length > 1 ? <button type="button" className="rc-btn rc-btn--primary rc-btn--sm" onClick={() => void apply(applicable)}><Check aria-hidden="true" />Aplicar las {applicable.length} correcciones de esta página</button> : null}
          {shown.map(f => (
            <article key={f.key} className="rc-man-finding" data-note={f.apply ? undefined : 'true'}>
              <header>
                <span className="rc-chip">{kindNames[f.kind] || f.kind}</span>
                <span className="rc-hint">{f.lang === 'en' ? 'Inglés' : 'Ruso'} · {f.text ? f.text.block : 'Texto dentro de una imagen'}</span>
              </header>
              <p>{f.problem}</p>
              {f.apply ? <Diff before={f.apply.before} after={f.apply.after} /> : (
                <p className="rc-pdf-quote" lang={f.lang}>«{f.quote}»{f.fix && f.fix !== f.quote ? <> → «{f.fix}»</> : null}</p>
              )}
              {f.note ? <p className="rc-hint">{f.note}</p> : null}
              <span className="rc-pdf-inline">
                {f.apply ? <button type="button" className="rc-btn rc-btn--primary rc-btn--sm" onClick={() => void apply([f])}><Check aria-hidden="true" />Aplicar</button> : null}
                {f.text ? <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => reveal(f)}><Crosshair aria-hidden="true" />Ver en la página</button> : null}
                <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => mark(f.key, 'dismissed')}><X aria-hidden="true" />{f.apply ? 'Descartar' : 'Listo'}</button>
              </span>
            </article>
          ))}
        </div>
      ) : null}

      <ConfirmDialog open={askAll} onClose={() => setAskAll(false)} onConfirm={() => { setAskAll(false); void run(unit.pages.map((_, i) => i)); }}
        title="¿Revisar toda la unidad?" confirmLabel="Revisar"
        description={'Son ' + unit.pages.length + ' pedidos a Kie, uno por página, con ' + (model?.name || 'el modelo elegido') + (sees ? ' y la imagen de cada página' : '') + '. Consumen créditos: Kie informa el costo real al terminar cada uno. Podés detenerlo en cualquier momento.'} />
    </section>
  );
}

const exerciseAnswer = z.object({
  summary: z.string().max(1000).default(''),
  exercise: z.object({
    instruction: z.string().min(1).max(300),
    example: z.array(z.string().max(300)).max(6).default([]),
    items: z.array(z.string().max(300)).min(1).max(40),
    answers: z.array(z.string().max(300)).max(40).default([]),
    columns: z.union([z.literal(1), z.literal(2)]).catch(1),
  }),
});

/** The exercise in a model answer (the JSON object may come inside a code fence). */
export function parseExercise(text: string) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { const r = exerciseAnswer.safeParse(JSON.parse(text.slice(start, end + 1))); return r.success ? r.data : null; } catch { return null; }
}

const ideas = ['Completar con la forma correcta del verbo', 'Traducir del inglés al ruso', 'Unir cada pregunta con su respuesta', 'Ordenar las palabras para formar frases'];

function ExerciseSection({api, onVersion, modelId}: {api: ManualApi; onVersion: (label: string) => Promise<void>; modelId: string}) {
  const [request, setRequest] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [proposal, setProposal] = useState<{summary: string; component: Exercise; newPage: boolean} | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const unitText = useMemo(() => api.unit.pages.map((p, i) => '— Página ' + (i + 1) + ' —\n' + pageText(p)).join('\n\n').slice(0, 14000), [api.unit]);
  const placed = useMemo(() => proposal ? place(api.fonts, api.unit, api.pageIndex, () => [proposal.component], proposal.newPage) : null, [proposal, api.fonts, api.unit, api.pageIndex]);

  // The preview: the page as it will print with the new exercise, drawn with the unit's template.
  useEffect(() => {
    const c = canvas.current;
    if (!c || !placed) return;
    let alive = true;
    void renderUnit(placed.unit, {fonts: api.fonts, asset: getAsset, pages: [placed.pageIndex]}).then(async r => {
      const doc = await openPdf(r.bytes.slice().buffer);
      try {
        const page = await doc.getPage(1);
        const base = page.getViewport({scale: 1});
        const viewport = page.getViewport({scale: 640 / base.width});
        if (!alive) return;
        c.width = Math.floor(viewport.width); c.height = Math.floor(viewport.height);
        await page.render({canvas: c, viewport}).promise;
      } finally { void doc.loadingTask.destroy(); }
    }).catch(() => {});
    return () => { alive = false; };
  }, [placed, api.fonts]);

  async function propose(ask: string) {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true); setError(''); setProposal(null);
    try {
      const r = await textAnswer('manual-exercise', 'PEDIDO DEL AUTOR: ' + ask + '\n\nUNIDAD «' + api.unit.title + '» (texto de sus páginas):\n' + unitText, {signal: controller.signal, model: modelId});
      const p = parseExercise(r.text);
      if (!p) throw Error('INVALID_ANSWER');
      const {number, audio} = nextExercise(api.unit);
      const component: Exercise = {type: 'exercise', number, audio, instruction: p.exercise.instruction, example: p.exercise.example, items: p.exercise.items, answers: p.exercise.answers.slice(0, p.exercise.items.length), columns: p.exercise.columns};
      const here = place(api.fonts, api.unit, api.pageIndex, () => [component], false);
      setProposal({summary: p.summary, component, newPage: !here});
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'PROVIDER_UNAVAILABLE');
    } finally { setBusy(false); }
  }

  async function insert() {
    if (!proposal || !placed) return;
    await onVersion('Antes de insertar el ejercicio ' + proposal.component.number + ' creado con IA');
    api.change(placed.unit);
    if (placed.pageIndex !== api.pageIndex) api.goToPage(placed.pageIndex);
    setProposal(null);
    toast('Ejercicio ' + proposal.component.number + ' insertado' + (proposal.newPage ? ' en una página nueva' : '') + '. La versión anterior quedó en «Versiones».', {duration: 8000});
  }

  const c = proposal?.component;
  return (
    <section className="rc-field rc-man-ai-section" aria-label="Crear ejercicio con IA">
      <span>Crear ejercicio con IA</span>
      <p className="rc-hint">La IA escribe la consigna, el ejemplo, los ítems y las respuestas con el vocabulario de la unidad. El número ({nextExercise(api.unit).number}) y el código de audio los pone el Manual, y se dibuja con el encabezado, los colores y las medidas de la unidad.</p>
      <p className="rc-kb-quick">{ideas.map(q => <button key={q} type="button" className="rc-chip" disabled={busy} onClick={() => setRequest(q)}>{q}</button>)}</p>
      <TextareaAutosize className="rc-textarea rc-pdf-text" minRows={2} maxRows={6} maxLength={2000} value={request} onChange={e => setRequest(e.target.value)} aria-label="Qué ejercicio querés" placeholder="Por ejemplo: «8 ítems con verbos de movimiento, en dos columnas, con un ejemplo»" />
      <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" disabled={busy || !request.trim()} onClick={() => void propose(request.trim())}><Sparkles aria-hidden="true" />{busy ? 'Escribiendo…' : 'Proponer ejercicio'}</button>
      {error ? <p className="rc-form-error" role="alert">{error === 'INVALID_ANSWER' ? 'El modelo respondió con un formato inesperado. Probá de nuevo.' : errorDetail(error)}</p> : null}
      {proposal && c ? (
        <div className="rc-pdf-result" aria-label="Ejercicio propuesto">
          {proposal.summary ? <p className="rc-pdf-result-summary">{proposal.summary}</p> : null}
          <p className="rc-hint">Ejercicio {c.number} · audio {c.audio} · {c.items.length} ítems{c.answers?.length ? ' con sus respuestas para el profesor' : ''}{proposal.newPage ? ' · no entra en esta página: va en una página nueva después de esta (cambia el número de las siguientes)' : ''}.</p>
          {placed ? <canvas ref={canvas} className="rc-man-ai-preview" role="img" aria-label={'Vista previa de la página con el ejercicio ' + c.number} /> : <p className="rc-form-error">El ejercicio no entra ni en una página nueva: pedilo más corto.</p>}
          {c.answers?.length ? <details><summary>Respuestas</summary><ol>{c.answers.map((a, i) => <li key={i}>{a}</li>)}</ol></details> : null}
          <span className="rc-pdf-inline">
            <button type="button" className="rc-btn rc-btn--primary rc-btn--sm" disabled={!placed} onClick={() => void insert()}><Check aria-hidden="true" />{proposal.newPage ? 'Insertar en una página nueva' : 'Insertar en esta página'}</button>
            <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" disabled={busy} onClick={() => void propose(request.trim() || 'Otro ejercicio')}>Otra propuesta</button>
            <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => setProposal(null)}>Descartar</button>
          </span>
        </div>
      ) : null}
    </section>
  );
}

function BubblesSection({api, onVersion}: {api: ManualApi; onVersion: (label: string) => Promise<void>}) {
  const [open, setOpen] = useState(false);
  const [project, setProject] = useState<KbProject | null>(null);
  const [entries, setEntries] = useState<KbEntry[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => projectOfUnit(api.unit.id).then(async p => {
      if (!alive) return;
      setProject(p);
      setEntries(p ? await listEntries(p.id) : []);
    }).catch(() => {});
    void load();
    libraryEvents?.addEventListener('change', load);
    return () => { alive = false; libraryEvents?.removeEventListener('change', load); };
  }, [api.unit.id]);

  async function insert(blob: Blob, job: CinemaJob, onNewPage = false) {
    const make = await pictureComponents(blob, job.prompt, api.unit);
    const placed = place(api.fonts, api.unit, api.pageIndex, make, onNewPage);
    if (!placed && !onNewPage) {
      toast('No entra en lo que queda de esta página.', {duration: 12000, action: {label: 'En una página nueva', onClick: () => { void insert(blob, job, true); }}, description: 'Una página nueva después de esta cambia el número de las siguientes.'});
      return;
    }
    if (!placed) { toast('La imagen no entra en una página del manual.'); return; }
    await onVersion('Antes de insertar una ilustración con globos');
    api.change(placed.unit);
    if (placed.pageIndex !== api.pageIndex) api.goToPage(placed.pageIndex);
    if (placed.blockId) api.reveal({block: placed.blockId, element: null});
    setOpen(false);
    toast('Ilustración insertada. La versión anterior quedó en «Versiones».', {duration: 8000});
  }

  return (
    <section className="rc-field rc-man-ai-section" aria-label="Ilustración con globos de diálogo">
      <span>Ilustración con globos de diálogo</span>
      <p className="rc-hint">Un modelo de imagen dibuja la escena con los globos y el texto ruso adentro, como en las ilustraciones del manual.{project ? ' Podés elegir personajes del libro con sus imágenes aprobadas.' : ''} Cada generación se confirma y consume créditos.</p>
      <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" onClick={() => setOpen(true)}><Images aria-hidden="true" />Crear ilustración con globos…</button>
      <BookImageDialog open={open} onClose={() => setOpen(false)} project={project} entries={entries} initial={[]} onInsert={insert} bubbles />
    </section>
  );
}
