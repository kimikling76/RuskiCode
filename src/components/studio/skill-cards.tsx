'use client';
import {Fragment, useEffect, useMemo, useRef, useState} from 'react';
import Link from 'next/link';
import TextareaAutosize from 'react-textarea-autosize';
import {toast} from 'sonner';
import {ArrowUpRight, BookOpenCheck, Clapperboard, Download, Film, ImagePlus, RotateCcw, Sparkles, SpellCheck2, X} from 'lucide-react';
import type {PDFDocumentProxy} from 'pdfjs-dist';
import {imageModels, videoModels, enabledStatus, publicModel, findModel} from '@/lib/ai/models';
import {useCinema, isActive, type CinemaJob} from '@/store/cinema';
import {downloadImage} from '@/lib/cinema/client';
import {savedUrl} from '@/lib/cinema/keep';
import {errorDetail} from '@/lib/cinema/errors';
import {retentionDays} from '@/lib/cinema/capabilities';
import {textRequest} from '@/lib/ai/text-request';
import {fetchEditorFonts, type EditorFonts} from '@/lib/manual/fonts';
import {renderUnit} from '@/lib/manual/render';
import {getAsset} from '@/lib/manual/store';
import {drawPage, openPdf} from '@/lib/pdf/viewer';
import type {Unit} from '@/lib/manual/model';
import type {PersonalMessage} from '@/store/personal-chat';
import type {ChatAttachment} from '@/lib/personal-chat/attachments';
import {pictureSlots, refSrc, skillById, type ImageRun, type MediaRef, type PdfRun, type PictureSlot, type ReviewRun, type SkillRun, type VideoRun} from '@/lib/skills/chat';
import {
  addSkillCard, buildPdf, type RunPatch, designUnits, draftNewWords, generatePictures, importPicture, isRunning, missingPictures, pictureJobs, reviewText, savePdf,
  sendMedia, updateRun, waitingPictures, withPicturePrompt, writePdf,
} from '@/lib/skills/run';
import {ChatModelPicker} from './chat-model-picker';
import {AspectPicker, Segmented, aspectName, optionLabel} from '@/components/cinema/controls';
import {Elapsed, KieImage, credits as creditText} from '@/components/cinema/job-card';
import {ConfirmDialog, Dialog} from '@/components/ui/dialog';
import {Tip} from '@/components/ui/tooltip';
import {MessageSources} from './chat-sources';

// What each Chat skill shows in the conversation. Nothing is sent to Kie, and nothing in the manual changes,
// until the author confirms in a dialog that says what is going to happen.

const skillErrors: Record<string, string> = {
  NO_MANUAL: 'Todavía no hay una unidad del manual en tu cuenta. En PDF Studio, en la sección «Manual», tocá «Importar unidad (PDF)» (no «Importar archivo», que crea un documento aparte). Su diseño es la plantilla de las páginas nuevas. Después tocá «Volver a intentar».',
  NO_DESIGN: 'Las unidades del manual que importaste no tienen un encabezado de ejercicio para copiar (la banda con el número y la consigna). Importá una unidad con ejercicios en PDF Studio → Manual, o en el editor elegí un ejercicio y tocá «Usar este encabezado para los ejercicios nuevos». Después tocá «Volver a intentar».',
  INVALID_DRAFT: 'El modelo respondió en un formato que no es el de la plantilla. No se aplicó nada: probá de nuevo o con otro modelo.',
  INVALID_REVIEW: 'El modelo respondió en un formato inesperado. No se aplicó nada: probá de nuevo o con otro modelo.',
  UNIT_MISSING: 'Esa unidad ya no está en este navegador.',
  TARGET_MISSING: 'La unidad de destino ya no está en este navegador.',
  INSUFFICIENT_BALANCE: 'Kie informó saldo insuficiente.',
  RATE_LIMIT: 'Kie o el estudio limitó las solicitudes. Esperá unos segundos.',
  STREAM_INTERRUPTED: 'La respuesta se cortó. Puede haber consumo: revisá los registros de Kie.',
  PROVIDER_AUTH_ERROR: 'Kie rechazó la clave del servidor (KIE_API_KEY en Vercel).',
  MODEL_NOT_CONFIGURED: 'No hay un modelo de Kie configurado para esta selección.',
  SEARCH_NOT_SUPPORTED: 'El modelo elegido no busca en la web en Kie. Elegí uno que diga «busca en la web» o apagá la búsqueda del chat.',
};
const skillError = (code?: string) => (code && skillErrors[code]) || 'El modelo no respondió. Probá más tarde o elegí otro.';
const dateFormat = new Intl.DateTimeFormat('es-AR', {day: 'numeric', month: 'long'});

function Head({run}: {run: SkillRun}) {
  const s = skillById(run.skill)!;
  const Icon = run.skill === 'image-generation' ? ImagePlus : run.skill === 'video-generation' ? Clapperboard : run.skill === 'pdf-generator' ? BookOpenCheck : SpellCheck2;
  return <p className="rc-skill-head"><Icon aria-hidden="true" /><code>{s.command}</code><span>{s.name}</span></p>;
}

function Facts({rows}: {rows: [string, string][]}) {
  return <dl className="rc-facts">{rows.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl>;
}

/** The last cost Kie reported for this model in this studio, per result; never an estimate. */
function useLastCost(model: string) {
  const jobs = useCinema(s => s.data.jobs);
  return useMemo(() => {
    const done = jobs.filter(j => (j.model || 'nano-banana-2-1') === model && j.credits !== undefined && j.state === 'success').sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0))[0];
    return done ? creditText(done.credits!) + ' por resultado (' + dateFormat.format(new Date(done.finishedAt || done.createdAt)) + ')' : 'Kie todavía no informó un costo de este modelo en el estudio. Aparece al terminar.';
  }, [jobs, model]);
}

function useBatch(batchId?: string) {
  const jobs = useCinema(s => s.data.jobs);
  return useMemo(() => batchId ? jobs.filter(j => j.batchId === batchId).sort((a, b) => a.createdAt - b.createdAt) : [], [jobs, batchId]);
}

/** `model`: the text model chosen in the chat, for the skills that write or review. */
export function SkillCard({chatId, message, model, attachments}: {chatId: string; message: PersonalMessage; model: string; attachments?: ChatAttachment[]}) {
  const run = message.skill!;
  return (
    <div className="rc-skill" data-skill={run.skill}>
      <Head run={run} />
      {run.skill === 'image-generation' || run.skill === 'video-generation' ? <MediaCard chatId={chatId} id={message.id} run={run} />
        : run.skill === 'pdf-generator' ? <PdfCard chatId={chatId} id={message.id} run={run} model={model} attachments={attachments} />
          : <ReviewCard chatId={chatId} id={message.id} run={run} model={model} attachments={attachments} />}
    </div>
  );
}

// ---------- /image-generation and /video-generation ----------

// The model a new card starts with: the one used for real (Nano Banana 2.1), Veo 3.1 for video (it takes a
// starting image too), or the first enabled one.
const preferred = {image: 'nano-banana-2-1', video: 'veo-3-1'};
function firstEnabled(video: boolean, withImage: boolean) {
  const list = video ? videoModels : imageModels;
  const fits = (m: (typeof list)[number]) => enabledStatus(m) && (m.options.modes.includes('create') || (video && withImage));
  return list.find(m => m.id === preferred[video ? 'video' : 'image'] && fits(m)) || list.find(m => fits(m) && m.status === 'tested') || list.find(fits);
}

function MediaCard({chatId, id, run}: {chatId: string; id: string; run: ImageRun | VideoRun}) {
  const video = run.skill === 'video-generation';
  const jobs = useBatch(run.batchId);
  const refs: MediaRef[] = run.skill === 'image-generation' ? run.refs : run.start ? [run.start] : [];
  const list = video ? videoModels : imageModels;
  const chosen = list.find(m => m.id === run.model && enabledStatus(m));
  const model = chosen && (!video || chosen.options.modes.includes('create') || refs.length) ? chosen : firstEnabled(video, refs.length > 0);
  const [prompt, setPrompt] = useState(run.prompt);
  const [improving, setImproving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const lastCost = useLastCost(model?.id || '');
  useEffect(() => { if (model && model.id !== run.model) updateRun(chatId, id, {model: model.id}); }, [model?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (run.batchId) return <MediaResults chatId={chatId} run={run} jobs={jobs} />;
  if (!model) return <p className="rc-hint">No hay un modelo de {video ? 'video' : 'imagen'} habilitado en el estudio.</p>;

  const o = model.options;
  const pick = (value: string, options: readonly string[]) => options.includes(value) ? value : options[0] || '';
  const aspect = pick(run.aspect, o.aspectRatios), resolution = pick(run.resolution, o.resolutions);
  const duration = run.skill === 'video-generation' ? pick(run.duration, o.durations) : '';
  const count = run.skill === 'image-generation' ? Math.min(run.count, o.maxVariants) : 1;
  const usedRefs = refs.slice(0, o.maxReferences);
  const ignored = refs.length - usedRefs.length;
  const needsImage = !o.modes.includes('create') && !usedRefs.length;
  const set = (patch: RunPatch<ImageRun> | RunPatch<VideoRun>) => updateRun(chatId, id, patch);
  const pickerModels = list.map(m => {
    const p = publicModel(m, true);
    // A model that needs a starting image is offered only when there is one.
    return video && !m.options.modes.includes('create') && !refs.length ? {...p, available: false, missing: 'Necesita una imagen de inicio: adjuntá una o usá «Animar» en una imagen generada.'} : p;
  });
  const facts: [string, string][] = [
    ['Modelo', model.name + (model.status === 'tested' ? '' : ' (sin prueba real desde el estudio)')],
    ...(o.aspectRatios.length ? [['Formato', aspectName(aspect)] as [string, string]] : []),
    ...(o.resolutions.length ? [[o.resolutionLabel || 'Resolución', optionLabel(resolution)] as [string, string]] : []),
    ...(o.durations.length ? [['Duración', duration + ' s'] as [string, string]] : []),
    ...(!video ? [['Cantidad', count + (count === 1 ? ' imagen' : ' imágenes')] as [string, string]] : []),
    ...(usedRefs.length ? [[video ? 'Imagen de inicio' : 'Referencias', usedRefs.length + (usedRefs.length === 1 ? ' imagen' : ' imágenes')] as [string, string]] : []),
    ['Último costo', lastCost],
  ];

  async function improve() {
    setImproving(true);
    try {
      const text = await textRequest('prompt', prompt);
      if (text) { setPrompt(text); set({prompt: text}); }
    } catch (e) {
      toast(skillError(e instanceof Error ? e.message : ''));
    } finally { setImproving(false); }
  }

  function generate() {
    setConfirm(false);
    const current = {...run, prompt: prompt.trim(), model: model!.id, aspect: o.aspectRatios.length ? aspect : '', resolution: o.resolutions.length ? resolution : ''} as ImageRun | VideoRun;
    if (current.skill === 'image-generation') { current.count = count; current.refs = usedRefs; } else { current.duration = o.durations.length ? duration : ''; current.start = usedRefs[0]; }
    updateRun(chatId, id, current);
    void sendMedia(chatId, id, current);
  }

  return (
    <div className="rc-skill-body">
      <label className="rc-field"><span>Prompt</span>
        <TextareaAutosize className="rc-textarea" minRows={2} maxRows={10} maxLength={4000} value={prompt} onChange={e => setPrompt(e.target.value)} onBlur={() => set({prompt})} />
      </label>
      <div className="rc-skill-row">
        <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" disabled={improving || !prompt.trim()} onClick={() => void improve()}><Sparkles aria-hidden="true" />{improving ? 'Mejorando…' : 'Mejorar el prompt con IA'}</button>
        <span className="rc-hint">Usa el modelo de texto automático; cuesta pocos créditos.</span>
      </div>
      <div className="rc-field"><span>Modelo de {video ? 'video' : 'imagen'}</span>
        <div className="rc-cine-model-picker"><ChatModelPicker models={pickerModels} value={model.id} onChange={m => set({model: m})} category={video ? 'video' : 'image'} allowAuto={false} title={video ? 'Modelo de video' : 'Modelo de imagen'} /></div>
      </div>
      {o.aspectRatios.length ? <div className="rc-field"><span>Formato</span><AspectPicker name={'aspect-' + id} value={aspect} onChange={v => set({aspect: v})} options={o.aspectRatios} /></div> : null}
      {o.resolutions.length ? <div className="rc-field"><span>{o.resolutionLabel || 'Resolución'}</span><Segmented name={'res-' + id} label={o.resolutionLabel || 'Resolución'} value={resolution} onChange={v => set({resolution: v})} options={o.resolutions.map(r => ({value: r, label: optionLabel(r)}))} /></div> : null}
      {o.durations.length ? <div className="rc-field"><span>Duración</span><Segmented name={'dur-' + id} label="Duración" value={duration} onChange={v => set({duration: v})} options={o.durations.map(d => ({value: d, label: d + ' s'}))} /></div> : null}
      {!video && o.maxVariants > 1 ? <div className="rc-field"><span>Cantidad</span><Segmented name={'count-' + id} label="Cantidad de imágenes" value={count} onChange={v => set({count: v})} options={Array.from({length: Math.min(4, o.maxVariants)}, (_, i) => ({value: i + 1, label: String(i + 1)}))} /></div> : null}
      {refs.length ? (
        <div className="rc-field"><span>{video ? 'Imagen de inicio' : 'Imágenes de referencia'}</span>
          <ul className="rc-skill-refs">
            {refs.map((r, i) => (
              <li key={i} data-unused={i >= o.maxReferences ? 'true' : undefined}>
                <img src={refSrc(r)} alt="" />
                <button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label="Quitar esta imagen" onClick={() => set(run.skill === 'image-generation' ? {refs: refs.filter((_, k) => k !== i)} : {start: undefined})}><X /></button>
              </li>
            ))}
          </ul>
          {ignored > 0 ? <p className="rc-pdf-warn">{o.maxReferences ? 'Este modelo acepta hasta ' + o.maxReferences + (o.maxReferences === 1 ? ' imagen' : ' imágenes') + ': las demás no se envían.' : 'Este modelo no usa imágenes: no se envían.'}</p> : null}
        </div>
      ) : null}
      {needsImage ? <p className="rc-pdf-warn">Este modelo necesita una imagen{video ? ' de inicio' : ' para editar'}: adjuntá una en el mensaje.</p> : null}
      <div className="rc-skill-row">
        <button type="button" className="rc-btn rc-btn--primary rc-btn--sm" disabled={!prompt.trim() || needsImage} onClick={() => setConfirm(true)}>
          {video ? <Film aria-hidden="true" /> : <ImagePlus aria-hidden="true" />}{video ? 'Generar el video…' : count === 1 ? 'Generar la imagen…' : 'Generar ' + count + ' imágenes…'}
        </button>
        <span className="rc-hint">Nada se pide a Kie hasta que confirmes.</span>
      </div>
      <ConfirmDialog
        open={confirm} onClose={() => setConfirm(false)} onConfirm={generate} confirmLabel={video ? 'Generar el video' : 'Generar'}
        title={video ? '¿Generar el video en Kie?' : '¿Generar en Kie?'}
        description={'Cada resultado es una tarea en Kie y consume créditos. El costo real aparece al terminar. ' + (video ? 'Un video tarda varios minutos: podés seguir trabajando.' : 'Las imágenes quedan guardadas en el estudio y en la galería de Cinema.')}
      >
        <Facts rows={facts} />
      </ConfirmDialog>
    </div>
  );
}

function MediaResults({chatId, run, jobs}: {chatId: string; run: ImageRun | VideoRun; jobs: CinemaJob[]}) {
  const video = run.skill === 'video-generation';
  const model = findModel(run.model);
  const again = () => addSkillCard(chatId, {...run, batchId: undefined, sentAt: undefined} as SkillRun, (video ? '/video-generation ' : '/image-generation ') + run.prompt);
  const animate = (job: CinemaJob, url: string, i: number) => {
    const start: MediaRef = job.saved?.[i] ? {kind: 'asset', hash: job.saved[i].hash, mime: job.saved[i].mime, name: 'imagen generada'} : {kind: 'url', url};
    const card: VideoRun = {skill: 'video-generation', prompt: run.prompt, model: '', aspect: '', resolution: '', duration: '', start};
    if (addSkillCard(chatId, card, '/video-generation ' + run.prompt)) toast('Listo: elegí el modelo de video en la tarjeta nueva, al final del chat.');
  };
  if (!jobs.length) return <p className="rc-hint">Esta generación ya no está en la galería de este navegador.</p>;
  return (
    <div className="rc-skill-body">
      <p className="rc-hint">{model?.name || run.model} · «{run.prompt.slice(0, 160)}{run.prompt.length > 160 ? '…' : ''}»</p>
      <ul className="rc-skill-results" data-video={video ? 'true' : undefined}>
        {jobs.map(job => {
          const url = job.urls[0];
          const failed = job.state === 'error' || job.state === 'fail';
          return (
            <li key={job.id}>
              {url && video ? <video src={url} controls preload="metadata" playsInline aria-label={'Video: ' + job.prompt.slice(0, 100)} />
                : url ? <KieImage src={url} alt={job.prompt.slice(0, 120)} fallback={savedUrl(job)} />
                  : isActive(job) ? <div className="rc-skill-wait" role="status"><span className="rc-job-pulse" aria-hidden="true" /><span>{job.state === 'sending' ? 'Enviando' : job.state === 'generating' ? 'Generando' : 'En cola'}</span><Elapsed since={job.createdAt} /></div>
                    : <div className="rc-skill-wait"><span className="rc-dot rc-dot--danger" aria-hidden="true" /><span>{failed ? errorDetail(job.error) + (job.failMessage ? ' Kie: «' + job.failMessage + '»' : '') : ''}</span></div>}
              {url ? (
                <div className="rc-skill-result-bar">
                  <Tip label="Descargar"><button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label="Descargar" onClick={() => void downloadImage(url, job.taskId || job.id).catch(() => window.open(url, '_blank', 'noopener,noreferrer'))}><Download /></button></Tip>
                  {!video ? <Tip label="Animar con /video-generation"><button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label="Animar esta imagen con /video-generation" onClick={() => animate(job, url, 0)}><Film /></button></Tip> : null}
                  <span className="rc-hint">
                    {job.credits !== undefined ? creditText(job.credits) + ' · ' : ''}
                    {video ? 'Kie lo guarda hasta el ' + dateFormat.format(new Date((job.finishedAt || job.createdAt) + retentionDays * 864e5)) + ': descargalo antes.' : job.saved?.length ? 'Guardada en el estudio' : 'Guardándola en el estudio…'}
                  </span>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="rc-skill-row">
        <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={again}><RotateCcw aria-hidden="true" />Generar otra vez</button>
        <Link href="/workspace?studio=cinema" className="rc-btn rc-btn--ghost rc-btn--sm">Ver en Cinema<ArrowUpRight aria-hidden="true" /></Link>
      </div>
    </div>
  );
}

// ---------- /pdf-generator ----------

function usePreview(run: PdfRun) {
  const [state, setState] = useState<{fonts: EditorFonts; units: Unit[]; models: Unit[]} | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [built, setBuilt] = useState<ReturnType<typeof buildPdf>>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    void Promise.all([fetchEditorFonts(), designUnits()]).then(([fonts, d]) => { if (alive) setState({fonts, ...d}); }).catch(() => setFailed(true));
    return () => { alive = false; };
  }, []);
  const key = JSON.stringify([run.draft, run.target, run.pictures, run.imageStyle]);
  useEffect(() => {
    if (!state || !run.draft || !run.target || run.state === 'saved') return;
    let alive = true;
    let opened: PDFDocumentProxy | null = null;
    try {
      const b = buildPdf(state.fonts, state.units, run);
      setBuilt(b);
      if (!b) return;
      void renderUnit(b.unit, {fonts: state.fonts, asset: getAsset, pages: b.pages}).then(r => openPdf(r.bytes.slice().buffer)).then(d => {
        if (!alive) { void d.loadingTask.destroy(); return; }
        opened = d; setDoc(d);
      }).catch(() => setFailed(true));
    } catch { setFailed(true); }
    return () => { alive = false; void opened?.loadingTask.destroy(); };
  }, [state, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return {state, doc, built, failed};
}

function PageCanvas({doc, index, width, label}: {doc: PDFDocumentProxy; index: number; width: number; label: string}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let task: {cancel: () => void} | null = null;
    void doc.getPage(index + 1).then(p => { if (canvas.current) { const r = drawPage(p, canvas.current, width); task = r.task; return r.task.promise; } }).catch(() => {});
    return () => task?.cancel();
  }, [doc, index, width]);
  return <canvas ref={canvas} className="rc-skill-page" aria-label={label} />;
}

/** A small page; a click shows it large, to read it before saving. */
function PageThumb({doc, index, page}: {doc: PDFDocumentProxy; index: number; page: number}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="rc-skill-page-btn" onClick={() => setOpen(true)} aria-label={'Ver grande la página ' + page}>
        <PageCanvas doc={doc} index={index} width={240} label={'Vista previa de la página ' + page} />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={'Página ' + page} description="Así queda en el PDF, con el diseño de la unidad." wide>
        <div className="rc-skill-page-large"><PageCanvas doc={doc} index={index} width={680} label={'Página ' + page + ' en grande'} /></div>
      </Dialog>
    </>
  );
}

/** Picture slots of a draft and their state; the images an author attached go with every picture as references. */
function PdfPictures({chatId, id, run, refs}: {chatId: string; id: string; run: PdfRun; refs: MediaRef[]}) {
  const allJobs = useCinema(s => s.data.jobs);
  const slots = useMemo(() => run.draft ? pictureSlots(run.draft) : [], [run.draft]);
  const jobs = useMemo(() => pictureJobs(run, allJobs), [run, allJobs]);
  const chosen = imageModels.find(m => m.id === run.pictureModel && enabledStatus(m) && m.options.modes.includes('create'));
  const model = chosen || firstEnabled(false, false);
  const lastCost = useLastCost(model?.id || '');
  const [confirm, setConfirm] = useState<PictureSlot[] | null>(null);
  const [style, setStyle] = useState(run.imageStyle ?? run.draft?.imageStyle ?? '');
  const waiting = waitingPictures(id);
  // Finished pictures come into the draft (and its preview) as soon as the studio has its copy.
  useEffect(() => {
    for (const slot of slots) {
      const job = jobs.get(slot.key);
      if (job?.state === 'success' && job.saved?.length && run.pictures?.[slot.key]?.job !== job.id) void importPicture(chatId, id, slot, job);
    }
  }, [jobs, slots, run.pictures, chatId, id]);
  if (!slots.length) return null;
  if (!model) return <p className="rc-pdf-warn">El borrador pide {slots.length} imágenes, pero no hay un modelo de imagen habilitado en el estudio.</p>;

  const o = model.options;
  const resolution = o.resolutions.includes(run.pictureResolution || '') ? run.pictureResolution! : o.resolutions.find(r => r === '2K') || o.resolutions[0] || '';
  const busy = (key: string) => waiting.has(key) || Boolean(jobs.get(key) && isActive(jobs.get(key)!));
  const done = slots.filter(s => run.pictures?.[s.key]?.image && run.pictures[s.key].prompt === s.prompt).length;
  const toSend = missingPictures(run).filter(s => !busy(s.key));
  const usedRefs = o.maxReferences ? refs.slice(0, o.maxReferences) : [];
  const pickerModels = imageModels.map(m => {
    const p = publicModel(m, true);
    return m.options.modes.includes('create') ? p : {...p, available: false, missing: 'Solo edita una imagen: para las imágenes del borrador hace falta un modelo que las cree desde texto.'};
  });

  function send() {
    const list = confirm || [];
    setConfirm(null);
    if (style !== (run.imageStyle ?? run.draft?.imageStyle ?? '')) updateRun<PdfRun>(chatId, id, {imageStyle: style});
    void generatePictures(chatId, id, {model: model!.id, resolution, refs: usedRefs, slots: list.map(s => s.key)});
  }

  return (
    <section className="rc-skill-pictures" aria-label="Imágenes del borrador">
      <p className="rc-skill-subtitle">Imágenes · {done} de {slots.length}</p>
      <p className="rc-hint">Las crea un modelo de imagen de Kie a partir de lo que pediste; no se buscan en internet. Los textos de las etiquetas y los globos los pone el estudio, así se pueden corregir.</p>
      <ul className="rc-skill-picture-grid">
        {slots.map(slot => {
          const have = run.pictures?.[slot.key];
          const image = have?.image && have.prompt === slot.prompt ? have.image : undefined;
          const job = jobs.get(slot.key);
          const failed = !busy(slot.key) && job && (job.state === 'error' || job.state === 'fail');
          return (
            <li key={slot.key}>
              <div className="rc-skill-picture" data-shape={slot.aspect}>
                {image ? <img src={'/api/sync/assets?hash=' + image.asset} alt={slot.label + ': ' + slot.prompt.slice(0, 100)} loading="lazy" /> : null}
                {busy(slot.key) ? <span className="rc-skill-picture-state" role="status"><span className="rc-job-pulse" aria-hidden="true" />{waiting.has(slot.key) || job?.state === 'sending' ? 'Enviando' : 'Generando'}</span>
                  : failed ? <span className="rc-skill-picture-state" title={errorDetail(job!.error) + (job!.failMessage ? ' Kie: «' + job!.failMessage + '»' : '')}><span className="rc-dot rc-dot--danger" aria-hidden="true" />No se pudo</span>
                    : !image ? <span className="rc-skill-picture-state">Pendiente</span> : null}
              </div>
              <span className="rc-skill-picture-label" lang="ru">{slot.label}</span>
              {(image || failed) && !busy(slot.key) ? (
                <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => setConfirm([slot])}><RotateCcw aria-hidden="true" />{failed ? 'Reintentar' : 'Otra versión'}</button>
              ) : null}
              <details className="rc-skill-picture-prompt">
                <summary>Prompt</summary>
                <TextareaAutosize className="rc-textarea" minRows={2} maxRows={8} maxLength={1200} defaultValue={slot.prompt} aria-label={'Prompt de ' + slot.label}
                  onBlur={e => { const v = e.target.value.trim(); if (v && v !== slot.prompt) updateRun<PdfRun>(chatId, id, {draft: withPicturePrompt(run, slot.key, v)}); }} />
              </details>
            </li>
          );
        })}
      </ul>
      <div className="rc-field"><span>Modelo de imagen</span>
        <div className="rc-cine-model-picker"><ChatModelPicker models={pickerModels} value={model.id} onChange={m => updateRun<PdfRun>(chatId, id, {pictureModel: m})} category="image" allowAuto={false} title="Modelo de imagen" /></div>
      </div>
      {o.resolutions.length ? <div className="rc-field"><span>{o.resolutionLabel || 'Resolución'}</span><Segmented name={'pic-res-' + id} label={o.resolutionLabel || 'Resolución'} value={resolution} onChange={v => updateRun<PdfRun>(chatId, id, {pictureResolution: v})} options={o.resolutions.map(r => ({value: r, label: optionLabel(r)}))} /></div> : null}
      <label className="rc-field"><span>Estilo de todas las imágenes</span>
        <TextareaAutosize className="rc-textarea" minRows={1} maxRows={4} maxLength={400} value={style} onChange={e => setStyle(e.target.value)} onBlur={() => updateRun<PdfRun>(chatId, id, {imageStyle: style})} placeholder="Por ejemplo: fotos realistas y luminosas, luz natural, gente amable en una escuela" />
      </label>
      {refs.length ? <p className="rc-hint">{usedRefs.length ? usedRefs.length + (usedRefs.length === 1 ? ' imagen adjunta va' : ' imágenes adjuntas van') + ' como referencia con cada imagen (personajes, lugares).' : 'Este modelo no usa imágenes de referencia: las adjuntas no se envían.'}</p> : null}
      <div className="rc-skill-row">
        <button type="button" className="rc-btn rc-btn--primary rc-btn--sm" disabled={!toSend.length} onClick={() => setConfirm(toSend)}>
          <ImagePlus aria-hidden="true" />{toSend.length ? (toSend.length === 1 ? 'Generar la imagen que falta…' : 'Generar las ' + toSend.length + ' imágenes que faltan…') : done === slots.length ? 'Todas las imágenes están listas' : 'Generando…'}
        </button>
        <span className="rc-hint">Nada se pide a Kie hasta que confirmes.</span>
      </div>
      <ConfirmDialog
        open={Boolean(confirm)} onClose={() => setConfirm(null)} onConfirm={send} confirmLabel="Generar"
        title={confirm?.length === 1 ? '¿Generar esta imagen en Kie?' : '¿Generar ' + (confirm?.length || 0) + ' imágenes en Kie?'}
        description="Cada imagen es una tarea en Kie y consume créditos. El costo real aparece al terminar. Quedan guardadas en el estudio y en la galería de Cinema, y entran solas en la vista previa."
      >
        <Facts rows={[
          ['Modelo', model.name + (model.status === 'tested' ? '' : ' (sin prueba real desde el estudio)')],
          ['Imágenes', String(confirm?.length || 0)],
          ...(o.aspectRatios.length ? [['Formato', 'el de cada imagen del borrador'] as [string, string]] : []),
          ...(o.resolutions.length ? [[o.resolutionLabel || 'Resolución', optionLabel(resolution)] as [string, string]] : []),
          ['Referencias', usedRefs.length ? String(usedRefs.length) : 'Ninguna'],
          ['Último costo', lastCost],
        ]} />
      </ConfirmDialog>
    </section>
  );
}

/** After saving: the pictures that went into the unit, to see them (they are changed in the editor). */
function SavedPictures({run}: {run: PdfRun}) {
  const slots = run.draft ? pictureSlots(run.draft) : [];
  const shown = slots.filter(s => run.pictures?.[s.key]?.image && run.pictures[s.key].prompt === s.prompt);
  if (!shown.length) return null;
  return (
    <ul className="rc-skill-picture-grid" aria-label="Imágenes guardadas en la unidad">
      {shown.map(s => (
        <li key={s.key}>
          <div className="rc-skill-picture" data-shape={s.aspect}><img src={'/api/sync/assets?hash=' + run.pictures![s.key].image!.asset} alt={s.label + ': ' + s.prompt.slice(0, 100)} loading="lazy" /></div>
          <span className="rc-skill-picture-label" lang="ru">{s.label}</span>
        </li>
      ))}
    </ul>
  );
}

function PdfCard({chatId, id, run, model, attachments}: {chatId: string; id: string; run: PdfRun; model: string; attachments?: ChatAttachment[]}) {
  const {state, doc, built, failed} = usePreview(run);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const writing = run.state === 'writing' && isRunning(id);

  if (run.state === 'writing') {
    return writing
      ? <p className="rc-skill-wait" role="status"><span className="rc-job-pulse" aria-hidden="true" />Escribiendo las páginas con el modelo de texto…</p>
      : <div className="rc-skill-row"><span className="rc-hint">Se interrumpió antes de terminar.</span><button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" onClick={() => void writePdf(chatId, id, model)}>Volver a intentar</button></div>;
  }
  if (run.state === 'error') {
    return (
      <div className="rc-skill-body" role="alert">
        <p className="rc-skill-error"><span className="rc-dot rc-dot--danger" aria-hidden="true" />{skillError(run.error)}</p>
        <div className="rc-skill-row">
          {run.error === 'NO_MANUAL' || run.error === 'NO_DESIGN' ? <Link href="/workspace?studio=pdf" className="rc-btn rc-btn--secondary rc-btn--sm">Ir a PDF Studio<ArrowUpRight aria-hidden="true" /></Link> : null}
          <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" onClick={() => void writePdf(chatId, id, model)}>Volver a intentar</button>
        </div>
      </div>
    );
  }
  const draft = run.draft!;
  const target = run.target!;
  const exercises = draft.blocks.filter(b => b.type === 'exercise').length;
  const words = state ? draftNewWords(run, state.units) : [];
  const targetUnit = state?.models.find(u => u.id === target.unitId);
  const pictures = pictureSlots(draft).length;
  const pending = missingPictures(run).length;
  const refs: MediaRef[] = (attachments || []).filter(a => a.kind === 'image').map(a => ({kind: 'asset', hash: a.hash, mime: a.mime, name: a.name}));

  async function save() {
    setConfirm(false);
    setSaving(true);
    try {
      const saved = await savePdf(chatId, id);
      toast('Guardado en PDF Studio: «' + saved.title + '».');
    } catch (e) {
      toast(skillError(e instanceof Error ? e.message : ''));
    } finally { setSaving(false); }
  }

  return (
    <div className="rc-skill-body">
      <p className="rc-skill-title">{draft.title}</p>
      {draft.summary ? <p className="rc-hint">{draft.summary}</p> : null}
      <p className="rc-hint">{draft.blocks.length} bloques · {exercises} {exercises === 1 ? 'ejercicio' : 'ejercicios'}{pictures ? ' · ' + pictures + (pictures === 1 ? ' imagen' : ' imágenes') : ''}{run.model ? ' · escrito con ' + run.model : ''}{run.webSearch ? ' · con búsqueda web' : ''}{run.credits !== undefined ? ' · ' + creditText(run.credits) : ''}</p>
      {run.sources?.length ? <MessageSources sources={run.sources} /> : null}
      {run.state === 'saved' && run.saved ? (
        <>
          <div className="rc-notice" role="status">
            <span>Guardado en «{run.saved.title}».</span>
            <Link href={'/workspace/manual?id=' + run.saved.unitId + '&page=' + run.saved.page} className="rc-btn rc-btn--secondary rc-btn--sm">Abrir en PDF Studio<ArrowUpRight aria-hidden="true" /></Link>
          </div>
          <SavedPictures run={run} />
        </>
      ) : (
        <>
          {state ? (
            <div className="rc-skill-target">
              <Segmented name={'target-' + id} label="Dónde va" value={target.mode} onChange={mode => updateRun<PdfRun>(chatId, id, {target: {...target, mode}})} options={[{value: 'new', label: 'Unidad nueva'}, {value: 'append', label: 'Al final de una unidad'}]} />
              <label className="rc-field"><span>{target.mode === 'new' ? 'Con el diseño de' : 'Unidad'}</span>
                <select className="rc-input" value={target.unitId} onChange={e => updateRun<PdfRun>(chatId, id, {target: {...target, unitId: e.target.value}})}>
                  {state.models.map(u => <option key={u.id} value={u.id}>{u.title}</option>)}
                </select>
              </label>
            </div>
          ) : null}
          {failed ? <p className="rc-pdf-warn">No se pudo armar la vista previa en este navegador.</p> : null}
          {built ? (
            <>
              <p className="rc-hint">{target.mode === 'new' ? 'Unidad ' + (built.unit.number || '') + ' nueva' : 'Páginas ' + (built.pages[0] + 1) + ' a ' + (built.pages[built.pages.length - 1] + 1) + ' de «' + targetUnit?.title + '»'} · {built.pages.length} {built.pages.length === 1 ? 'página' : 'páginas'}. Los números de ejercicio y los códigos de audio los pone el estudio.</p>
              <div className="rc-skill-pages">{doc ? built.pages.map((p, i) => <PageThumb key={i + ':' + doc.fingerprints[0]} doc={doc} index={i} page={p + 1} />) : <span className="rc-skeleton" />}</div>
              {built.overflow.length ? <p className="rc-pdf-warn">No entra en una página y queda cortado: {built.overflow.join(', ')}. Pedí que lo acorte.</p> : null}
            </>
          ) : null}
          {words.length ? (
            <details className="rc-skill-words">
              <summary>{words.length} {words.length === 1 ? 'palabra que no aparece' : 'palabras que no aparecen'} en las unidades del manual</summary>
              <p>{words.slice(0, 80).join(', ')}{words.length > 80 ? '…' : ''}</p>
              <p className="rc-hint">Pueden ser vocabulario nuevo o una forma nueva de una palabra conocida. Revisalas antes de guardar.</p>
            </details>
          ) : null}
          <PdfPictures chatId={chatId} id={id} run={run} refs={refs} />
          <div className="rc-skill-row">
            <button type="button" className="rc-btn rc-btn--primary rc-btn--sm" disabled={!built || saving} onClick={() => setConfirm(true)}><BookOpenCheck aria-hidden="true" />{saving ? 'Guardando…' : 'Guardar en PDF Studio…'}</button>
            <span className="rc-hint">Para cambiar algo, escribilo en el chat con /pdf-generator.</span>
          </div>
          <ConfirmDialog
            open={confirm} onClose={() => setConfirm(false)} onConfirm={() => void save()} confirmLabel="Guardar"
            title={target.mode === 'new' ? '¿Crear la unidad nueva?' : '¿Agregar las páginas a la unidad?'}
            description={target.mode === 'new'
              ? 'Se crea «' + draft.title + '» con el diseño de «' + (targetUnit?.title || '') + '». Queda en PDF Studio → Manual, con una versión, y llega a tus otras computadoras.'
              : 'Se agregan ' + (built?.pages.length || 0) + ' páginas al final de «' + (targetUnit?.title || '') + '». Antes se guarda una versión de la unidad, para poder volver.'}
          >
            <Facts rows={[['Páginas', String(built?.pages.length || 0)], ['Ejercicios', String(exercises)], ...(pictures ? [['Imágenes', (pictures - pending) + ' de ' + pictures] as [string, string]] : []), ['Palabras nuevas', String(words.length)]]} />
            {pending ? <p className="rc-pdf-warn">{pending === 1 ? 'Falta 1 imagen: queda' : 'Faltan ' + pending + ' imágenes: quedan'} como recuadro «Imagen pendiente». Podés generarlas antes de guardar, o poner una imagen después en el editor.</p> : null}
          </ConfirmDialog>
        </>
      )}
    </div>
  );
}

// ---------- /revisar-ruso ----------

function ReviewCard({chatId, id, run, model, attachments}: {chatId: string; id: string; run: ReviewRun; model: string; attachments: PersonalMessage['attachments']}) {
  const [units, setUnits] = useState<Unit[] | null>(null);
  const source = run.source.kind === 'unit' ? run.source : null;
  const [unitId, setUnitId] = useState(source?.unitId || '');
  const [from, setFrom] = useState(source?.from || 1);
  const [to, setTo] = useState(source?.to || 10);
  useEffect(() => { void designUnits().then(d => { setUnits(d.units); if (!unitId && d.units[0]) { setUnitId(d.units[0].id); setTo(Math.min(10, d.units[0].pages.length)); } }).catch(() => setUnits([])); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const unit = units?.find(u => u.id === unitId);

  function start() {
    if (!unit) return;
    updateRun<ReviewRun>(chatId, id, {source: {kind: 'unit', unitId: unit.id, title: unit.title, from: Math.max(1, from), to: Math.max(from, Math.min(to, unit.pages.length))}});
    void reviewText(chatId, id, model, []);
  }

  if (run.state === 'choose') {
    if (units && !units.length) return <p className="rc-hint">Pegá el texto en el mensaje o adjuntalo. Las unidades del manual aparecen acá cuando importes una en PDF Studio.</p>;
    return (
      <div className="rc-skill-body">
        <p className="rc-hint">No había texto en el mensaje: elegí qué páginas del manual revisar.</p>
        <label className="rc-field"><span>Unidad</span>
          <select className="rc-input" value={unitId} onChange={e => {
            const next = units?.find(u => u.id === e.target.value);
            setUnitId(e.target.value); setFrom(1); setTo(Math.min(10, next?.pages.length || 1));
          }}>{(units || []).map(u => <option key={u.id} value={u.id}>{u.title} · {u.pages.length} páginas</option>)}</select>
        </label>
        <div className="rc-pdf-two">
          <label className="rc-field"><span>Desde la página</span><input className="rc-input" type="number" min={1} max={unit?.pages.length || 1} value={from} onChange={e => setFrom(Number(e.target.value) || 1)} /></label>
          <label className="rc-field"><span>Hasta la página</span><input className="rc-input" type="number" min={from} max={unit?.pages.length || 1} value={to} onChange={e => setTo(Number(e.target.value) || from)} /></label>
        </div>
        <div className="rc-skill-row">
          <button type="button" className="rc-btn rc-btn--primary rc-btn--sm" disabled={!unit} onClick={start}><SpellCheck2 aria-hidden="true" />Revisar con IA</button>
          <span className="rc-hint">Usa el modelo de texto elegido en el chat. Solo informa: no cambia la unidad.</span>
        </div>
      </div>
    );
  }
  if (run.state === 'reviewing') {
    return isRunning(id)
      ? <p className="rc-skill-wait" role="status"><span className="rc-job-pulse" aria-hidden="true" />Revisando el texto…</p>
      : <div className="rc-skill-row"><span className="rc-hint">Se interrumpió antes de terminar.</span><button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" onClick={() => void reviewText(chatId, id, model, attachments || [])}>Volver a intentar</button></div>;
  }
  const link = (page: number | null | undefined) => run.source.kind === 'unit' && page ? '/workspace/manual?id=' + run.source.unitId + '&page=' + page : null;
  return (
    <div className="rc-skill-body">
      {run.source.kind === 'unit' ? <p className="rc-hint">«{run.source.title}», páginas {run.source.from} a {run.source.to}.</p> : null}
      {run.auto?.length ? (
        <div className="rc-skill-review">
          <p className="rc-skill-title">Revisión automática <small>sin IA, gratis</small></p>
          <ul>{run.auto.map((a, i) => <ReviewItem key={'a' + i} kind="automático" page={a.page} quote={a.quote} problem={a.problem} suggestion={a.suggestion} href={link(a.page)} />)}</ul>
        </div>
      ) : null}
      {run.state === 'error' ? (
        <div role="alert" className="rc-skill-row">
          <p className="rc-skill-error"><span className="rc-dot rc-dot--danger" aria-hidden="true" />{skillError(run.error)}</p>
          <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" onClick={() => void reviewText(chatId, id, model, attachments || [])}>Volver a intentar</button>
        </div>
      ) : run.result ? (
        <div className="rc-skill-review">
          <p className="rc-skill-title">Revisión con IA <small>{run.model || ''}{run.webSearch ? ' · con búsqueda web' : ''}{run.credits !== undefined ? ' · ' + creditText(run.credits) : ''}</small></p>
          <p>{run.result.summary}</p>
          {run.result.issues.length ? <ul>{run.result.issues.map((x, i) => <ReviewItem key={i} kind={x.kind} page={x.page ?? null} quote={x.quote} problem={x.problem} suggestion={x.suggestion} href={link(x.page)} />)}</ul> : <p className="rc-hint">No encontró problemas.</p>}
          {run.sources?.length ? <MessageSources sources={run.sources} /> : null}
          <p className="rc-hint">Es la opinión del modelo: revisala antes de corregir. Nada se cambió en el texto ni en el manual.</p>
        </div>
      ) : null}
    </div>
  );
}

function ReviewItem({kind, page, quote, problem, suggestion, href}: {kind: string; page: number | null; quote: string; problem: string; suggestion: string; href: string | null}) {
  return (
    <li className="rc-skill-issue">
      <span className="rc-skill-kind">{kind}</span>
      {page ? (href ? <Link href={href} className="rc-skill-page-link">Página {page}<ArrowUpRight aria-hidden="true" /></Link> : <span className="rc-hint">Página {page}</span>) : null}
      {quote ? <q lang="ru">{quote}</q> : null}
      <p>{problem}</p>
      {suggestion ? <p className="rc-skill-suggestion"><span>Sugerencia:</span> <span lang="ru">{suggestion}</span></p> : null}
    </li>
  );
}

