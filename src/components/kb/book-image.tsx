'use client';
import {Fragment, useEffect, useMemo, useState} from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import {toast} from 'sonner';
import {Check, ImageUp, RotateCcw, TriangleAlert} from 'lucide-react';
import {Dialog, ConfirmDialog} from '@/components/ui/dialog';
import {AspectPicker, Field, MediaModelPicker, Segmented, aspectName, optionLabel} from '@/components/cinema/controls';
import {KieImage, Elapsed} from '@/components/cinema/job-card';
import {estimate} from '@/components/studio/chat-model-picker';
import {imageModels, enabledStatus, promptLimit} from '@/lib/ai/models';
import {startGeneration} from '@/lib/cinema/client';
import {errorDetail} from '@/lib/cinema/errors';
import {useCinema, isActive, type CinemaJob} from '@/store/cinema';
import {editEntry, getEntry} from '@/lib/kb/store';
import {storeRefFile, uploadEntryFiles} from '@/lib/kb/files';
import {approvedRefs, bookPicturePrompt, bubbleLines, defaultPicks, pictureWarnings, plannedRefs, type CastPick, type PictureParts} from '@/lib/kb/picture';
import type {EntryOf, KbEntry, KbProject} from '@/lib/kb/model';
import {RefThumb} from './character-refs';

const resultUrl = (job: CinemaJob) => job.saved?.[0] ? '/api/sync/assets?hash=' + job.saved[0].hash : job.urls[0] || '';

/** The result file of a finished job: the studio's copy, or Kie's through the studio. */
export async function resultBlob(job: CinemaJob) {
  const source = job.saved?.[0] ? '/api/sync/assets?hash=' + job.saved[0].hash : job.urls[0] ? '/api/cinema/download?url=' + encodeURIComponent(job.urls[0]) + '&name=' + encodeURIComponent(job.taskId || job.id) : '';
  if (!source) throw Error('NO_RESULT');
  const r = await fetch(source);
  if (!r.ok) throw Error('NO_RESULT');
  return r.blob();
}

/** What the provider got for each reference: the file name, and whether the hash of the bytes sent matches it. */
export function SentList({job}: {job: CinemaJob}) {
  if (!job.sent?.length) return job.references.length ? <p className="rc-hint">Referencias enviadas: {job.references.length} (sin detalle de la subida).</p> : <p className="rc-hint">Sin imágenes de referencia: solo el texto.</p>;
  const names = new Map(job.book?.characters.flatMap(c => c.refs.map(r => [r.hash, c.name + ' · ' + r.name] as [string, string])) || []);
  return (
    <ul className="rc-kb-sent">
      {job.sent.map((s, i) => {
        const hash = s.reference.startsWith('asset:') ? s.reference.slice(6) : '';
        const ok = Boolean(hash && s.sha256 === hash);
        return <li key={i} data-ok={ok || undefined}><strong>Imagen {i + 1}</strong> · {names.get(hash) || (hash ? 'archivo del estudio' : 'enlace de Kie')}{hash ? <span className="rc-hint"> · sha256 recibido {s.sha256?.slice(0, 12)}… {ok ? '(es el archivo elegido)' : '(no coincide)'}{s.size ? ' · ' + (s.size / 1_000_000).toLocaleString('es-AR', {maximumFractionDigits: 2}) + ' MB' : ''}</span> : null}</li>;
      })}
    </ul>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  /** The unit's book, when it has one: its characters can be chosen with their approved pictures. */
  project: KbProject | null;
  entries: KbEntry[];
  /** Speech bubbles drawn by the image model, with their Russian text inside. */
  bubbles?: boolean;
  /** Characters chosen when the dialog opens (entry ids). */
  initial: string[];
  /** Puts an approved result where the dialog was opened from (a page of the manual). */
  onInsert?: (blob: Blob, job: CinemaJob) => Promise<void> | void;
  insertLabel?: string;
};

/**
 * A picture of the book's characters with their real reference files: the image model from the catalog, the
 * characters and files to send (within the model's limit), the prompt with who, what, where and how, the cost when
 * Kie publishes it, a confirmation every time, and a review of the result before it goes anywhere.
 */
export function BookImageDialog({open, onClose, project, entries, initial, onInsert, insertLabel = 'Insertar en la página', bubbles: withBubbles = false}: Props) {
  const characters = useMemo(() => entries.filter((e): e is EntryOf<'character'> => e.kind === 'character' && e.status !== 'superseded').sort((a, b) => a.title.localeCompare(b.title)), [entries]);
  const [modelId, setModelId] = useState('nano-banana-2-1');
  const [picks, setPicks] = useState<CastPick[]>([]);
  const [parts, setParts] = useState<PictureParts>({action: '', scene: '', composition: '', style: withBubbles ? 'Bright, friendly comic-style illustration with clean lines, as in a modern language textbook.' : 'Bright, friendly, realistic photograph with natural light, as in a modern language textbook.', bubbles: ''});
  const [custom, setCustom] = useState<string | null>(null);
  const [aspect, setAspect] = useState('4:3');
  const [resolution, setResolution] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [batch, setBatch] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    setPicks(defaultPicks(characters.filter(c => initial.includes(c.id))));
    setBatch(null); setCustom(null); setConfirm(false); setQuery('');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const model = imageModels.find(m => m.id === modelId && enabledStatus(m)) || imageModels.find(m => enabledStatus(m) && m.options.maxReferences > 0) || imageModels[0];
  const o = model.options;
  const shownAspect = o.aspectRatios.includes(aspect) ? aspect : o.aspectRatios[0];
  const shownResolution = o.resolutions.includes(resolution) ? resolution : o.resolutions[0];
  const chosen = picks.map(p => characters.find(c => c.id === p.id)).filter((c): c is EntryOf<'character'> => Boolean(c));
  const {sent, left} = plannedRefs(characters, picks, o.maxReferences);
  const prompt = custom ?? bookPicturePrompt(chosen, sent, withBubbles ? parts : {...parts, bubbles: ''});
  const limit = promptLimit(o, 'image');
  const lines = withBubbles ? bubbleLines(parts.bubbles) : [];
  const warnings = pictureWarnings(chosen, sent, left, o.maxReferences);
  const needsImage = !o.modes.includes('create') && !sent.length;
  const jobs = useCinema(s => s.data.jobs).filter(j => batch && j.batchId === batch);

  const toggle = (c: EntryOf<'character'>) => setPicks(p => p.some(x => x.id === c.id) ? p.filter(x => x.id !== c.id) : [...p, ...defaultPicks([c])]);
  const toggleRef = (id: string, hash: string) => setPicks(p => p.map(x => x.id !== id ? x : {...x, refs: x.refs.includes(hash) ? x.refs.filter(h => h !== hash) : [...x.refs, hash]}));

  async function generate() {
    setSending(true);
    try {
      // The files go to the account first (if this computer has not synced them yet): the server reads them from there.
      for (const c of chosen) await uploadEntryFiles(c);
      const id = await startGeneration({
        mode: 'create', model: model.id, prompt, aspect: shownAspect as never, resolution: shownResolution as never, count: 1,
        references: sent.map(s => 'asset:' + s.ref.hash),
        ...(project ? {tag: 'book:' + project.id, book: {project: project.id, name: project.name, characters: chosen.map(c => ({id: c.id, name: c.title, refs: sent.filter(s => s.character === c.id).map(s => ({hash: s.ref.hash, name: s.ref.name}))}))}} : {}),
      });
      setBatch(id);
    } catch (e) {
      toast(e instanceof Error && e.message ? errorDetail(e.message) : 'No se pudo enviar el pedido.');
    } finally { setSending(false); }
  }

  const visible = characters.filter(c => !query.trim() || (c.title + ' ' + c.data.aliases.join(' ')).toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <Dialog open={open} onClose={onClose} wide title={withBubbles ? 'Ilustración con globos de diálogo' : 'Ilustración con personajes del libro'}
      description={(withBubbles ? 'El modelo de imagen dibuja la escena y los globos, con el texto ruso adentro. ' : '') + 'Elegís el modelo' + (project ? ', los personajes y las imágenes aprobadas que se envían' : '') + '. Cada generación se confirma y consume créditos de Kie. El resultado se revisa antes de usarlo.'}>
      <div className="rc-dialog-body rc-kb-picture">
        {batch ? <Results jobs={jobs} onInsert={onInsert} insertLabel={insertLabel} onAgain={() => setBatch(null)} /> : (
          <>
            <Field label="Modelo de imagen"><MediaModelPicker category="image" value={model.id} onChange={setModelId} /></Field>
            <p className="rc-hint">{o.maxReferences ? 'Acepta hasta ' + o.maxReferences + (o.maxReferences === 1 ? ' imagen de referencia' : ' imágenes de referencia') + ' según su documentación.' : 'No acepta imágenes de referencia: solo recibe el texto.'}{o.modes.includes('create') ? '' : ' Necesita al menos una imagen.'}</p>

            {withBubbles ? (
              <Field label="Globos de diálogo" hint="Uno por renglón, hasta 6. «Nombre: texto» indica quién habla.">
                <TextareaAutosize className="rc-textarea" minRows={3} maxRows={8} maxLength={1200} value={parts.bubbles} onChange={e => { setParts(p => ({...p, bubbles: e.target.value})); setCustom(null); }} placeholder={'Иван: Приве́т! Как дела́?\nАнна: Хорошо́, спаси́бо!'} aria-label="Globos de diálogo" />
                <p className="rc-kb-warning">Los modelos de imagen a veces escriben mal las letras rusas, y el texto queda dentro de la imagen: no se corrige como texto. Revisá el resultado antes de insertarlo; «Revisar con IA» también lee el texto de las imágenes.</p>
              </Field>
            ) : null}

            {project ? <Field label="Personajes">
              <input className="rc-input" type="search" placeholder="Buscar personaje" aria-label="Buscar personaje" value={query} onChange={e => setQuery(e.target.value)} />
              <ul className="rc-kb-cast">
                {visible.map(c => {
                  const on = picks.find(p => p.id === c.id);
                  const refs = approvedRefs(c);
                  return (
                    <li key={c.id} data-on={on ? '' : undefined}>
                      <label className="rc-kb-check"><input type="checkbox" checked={Boolean(on)} onChange={() => toggle(c)} />{c.title}<span className="rc-hint">{c.data.missing ? ' · sin imagen verificada' : refs.length ? ' · ' + refs.length + (refs.length === 1 ? ' imagen aprobada' : ' imágenes aprobadas') : ' · sin imagen aprobada'}</span></label>
                      {on && refs.length ? (
                        <div className="rc-kb-cast-refs">
                          {refs.map(r => (
                            <label key={r.hash} className="rc-kb-cast-ref">
                              <input type="checkbox" checked={on.refs.includes(r.hash)} disabled={Boolean(r.chunks)} onChange={() => toggleRef(c.id, r.hash)} />
                              <RefThumb file={r} label={c.title + ': ' + r.name} />
                              <span>{r.hash === c.data.mainRef ? 'Principal · ' : ''}{r.name}{r.chunks ? ' · más de 4 MB, no se puede enviar' : ''}</span>
                            </label>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </Field> : <p className="rc-hint">Esta unidad no está vinculada a un libro: sin personajes ni imágenes de referencia. Describí a las personas en «Qué pasa».</p>}

            <div className="rc-kb-parts">
              {([['action', 'Qué pasa'], ['scene', 'Dónde y cuándo'], ['composition', 'Encuadre y luz'], ['style', 'Estilo']] as const).map(([k, label]) => (
                <label key={k} className="rc-field"><span>{label}</span><input className="rc-input" maxLength={400} value={parts[k]} onChange={e => { setParts(p => ({...p, [k]: e.target.value})); setCustom(null); }} /></label>
              ))}
            </div>
            {o.aspectRatios.length ? <Field label="Formato"><AspectPicker value={shownAspect as never} onChange={v => setAspect(v)} options={o.aspectRatios as never} name="book-aspect" /></Field> : null}
            {o.resolutions.length > 1 ? <Field label={o.resolutionLabel || 'Resolución'}><Segmented name="book-resolution" label={o.resolutionLabel || 'Resolución'} value={shownResolution} onChange={setResolution} options={o.resolutions.map(r => ({value: r, label: optionLabel(r)}))} /></Field> : null}

            <Field label={'Imágenes que se envían (' + sent.length + (o.maxReferences ? ' de ' + o.maxReferences : '') + ')'}>
              {sent.length ? <ol className="rc-kb-sending">{sent.map(s => <li key={s.ref.hash}>Imagen {s.index}: {s.name} · {s.ref.name} · sha256 {s.ref.hash.slice(0, 12)}…</li>)}</ol> : <p className="rc-hint">Ninguna.</p>}
            </Field>
            <Field label="Prompt" action={custom !== null ? <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => setCustom(null)}><RotateCcw aria-hidden="true" />Volver a armarlo</button> : undefined}>
              <TextareaAutosize className="rc-textarea" minRows={5} maxRows={14} maxLength={limit} value={prompt} onChange={e => setCustom(e.target.value)} aria-label="Prompt" />
            </Field>
            {warnings.length ? <ul className="rc-kb-consequences rc-kb-warnings">{warnings.map(w => <li key={w}>{w}</li>)}</ul> : null}
            <div className="rc-dialog-footer rc-dialog-footer--end">
              <button type="button" className="rc-btn rc-btn--ghost" onClick={onClose}>Cancelar</button>
              <button type="button" className="rc-btn rc-btn--primary" disabled={sending || needsImage || !prompt.trim() || prompt.length > limit || (!chosen.length && !parts.action.trim() && !lines.length)} onClick={() => setConfirm(true)}>{sending ? 'Enviando…' : 'Generar…'}</button>
            </div>
          </>
        )}
      </div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => { setConfirm(false); void generate(); }} title="¿Generar en Kie?" confirmLabel="Generar"
        description="Es una tarea paga en Kie. El costo real aparece al terminar, cuando Kie lo informa.">
        <dl className="rc-facts">
          {([
            ['Modelo', model.name],
            ['Personajes', chosen.map(c => c.title).join(', ') || 'ninguno'],
            ...(lines.length ? [['Globos', lines.length + (lines.length === 1 ? ' globo con texto ruso' : ' globos con texto ruso')]] : []),
            ['Imágenes de referencia', sent.length ? sent.map(s => s.ref.name).join(', ') : 'ninguna'],
            ...(o.aspectRatios.length ? [['Formato', aspectName(shownAspect)]] : []),
            ...(o.resolutions.length ? [[o.resolutionLabel || 'Resolución', optionLabel(shownResolution)]] : []),
            ['Costo', model.price ? estimate(model.price) + '; el real lo informa Kie al terminar' : 'Kie no publica el precio de este modelo: lo informa al terminar'],
          ] as [string, string][]).map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}
        </dl>
      </ConfirmDialog>
    </Dialog>
  );
}

function Results({jobs, onInsert, insertLabel, onAgain}: {jobs: CinemaJob[]; onInsert?: Props['onInsert']; insertLabel: string; onAgain: () => void}) {
  const updateJob = useCinema(s => s.updateJob);
  const [busy, setBusy] = useState('');
  if (!jobs.length) return <p className="rc-hint" role="status">Enviando…</p>;
  async function keep(job: CinemaJob, characterId: string) {
    setBusy('keep:' + characterId);
    try {
      const blob = await resultBlob(job);
      const entry = await getEntry(job.book!.project, characterId);
      if (!entry || entry.kind !== 'character') throw Error();
      const mime = (['image/png', 'image/jpeg', 'image/webp'].includes(blob.type) ? blob.type : 'image/png') as 'image/png';
      const ref = await storeRefFile('generada-' + (job.model || 'kie') + '-' + new Date(job.createdAt).toISOString().slice(0, 10) + '.' + mime.split('/')[1], mime, new Uint8Array(await blob.arrayBuffer()), null, 'other');
      if (entry.data.refs.some(r => r.hash === ref.hash)) { toast('Esa imagen ya está en la biblioteca.'); return; }
      const note = 'Generada con ' + (job.model || 'Kie') + (job.review === 'consistent' ? '; revisada como consistente' : job.review === 'changed' ? '; cambió rasgos aprobados' : '; sin revisar');
      await editEntry(entry.project, entry.id, {data: {...entry.data, refs: [...entry.data.refs, {...ref, note}]}}, 'Agregada una imagen generada (sin aprobar)');
      toast('Guardada en la biblioteca de ' + entry.title + ' como «sin revisar». No es una referencia aprobada.');
    } catch { toast('No se pudo traer la imagen de Kie.'); }
    finally { setBusy(''); }
  }
  async function insert(job: CinemaJob) {
    if (!onInsert) return;
    setBusy('insert');
    try { await onInsert(await resultBlob(job), job); } catch { toast('No se pudo insertar la imagen.'); } finally { setBusy(''); }
  }
  return (
    <div className="rc-kb-results">
      {jobs.map(job => (
        <article key={job.id} className="rc-kb-result">
          {job.state === 'success' && resultUrl(job) ? <KieImage src={resultUrl(job)} fallback={job.urls[0]} alt="Resultado" className="rc-kb-result-img" />
            : job.state === 'fail' || job.state === 'error' ? <p className="rc-form-error">{errorDetail(job.error || 'PROVIDER_UNAVAILABLE')}{job.failMessage ? ' · ' + job.failMessage : ''}</p>
            : <p className="rc-hint" role="status">{isActive(job) ? <>Generando en Kie… <Elapsed since={job.createdAt} /></> : 'Esperando…'}</p>}
          <div className="rc-kb-result-info">
            <strong>Qué recibió el proveedor</strong>
            <SentList job={job} />
            {job.credits !== undefined ? <p className="rc-hint">Kie informó {job.credits} créditos.</p> : null}
            {job.state === 'success' ? (
              <>
                {job.book?.characters.length ? (
                  <p className="rc-kb-question">¿Mantiene el rostro y el cuerpo de las referencias aprobadas?</p>
                ) : <p className="rc-kb-question">¿Está bien? Mirá la escena y, si tiene globos, que cada letra rusa esté bien escrita.</p>}
                <span className="rc-kb-actions">
                  <button type="button" className="rc-btn rc-btn--sm rc-btn--secondary" aria-pressed={job.review === 'consistent'} onClick={() => updateJob(job.id, {review: 'consistent'})}><Check aria-hidden="true" />{job.book?.characters.length ? 'Sí, consistente' : 'Sí, está bien'}</button>
                  <button type="button" className="rc-btn rc-btn--sm rc-btn--ghost" aria-pressed={job.review === 'changed'} onClick={() => updateJob(job.id, {review: 'changed'})}><TriangleAlert aria-hidden="true" />{job.book?.characters.length ? 'No, cambió rasgos' : 'No, tiene errores'}</button>
                </span>
                {job.review === 'changed' ? <p className="rc-kb-warning">{job.book?.characters.length ? 'Marcada como no consistente: no se use como referencia del personaje.' : 'Marcada con errores: mejor generar otra.'}</p> : null}
                <span className="rc-kb-actions">
                  {onInsert ? <button type="button" className="rc-btn rc-btn--primary rc-btn--sm" disabled={Boolean(busy) || !job.review} onClick={() => void insert(job)}><ImageUp aria-hidden="true" />{busy === 'insert' ? 'Insertando…' : insertLabel}</button> : null}
                  {job.book?.characters.map(c => <button key={c.id} type="button" className="rc-btn rc-btn--ghost rc-btn--sm" disabled={Boolean(busy) || job.review !== 'consistent'} onClick={() => void keep(job, c.id)}>Guardar en la biblioteca de {c.name}</button>)}
                </span>
                {!job.review ? <p className="rc-hint">Revisala primero: insertar o guardar se habilita después de responder.</p> : null}
              </>
            ) : null}
          </div>
        </article>
      ))}
      <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={onAgain}>Otra ilustración</button>
    </div>
  );
}
