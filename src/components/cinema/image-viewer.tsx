'use client';
import * as RadixDialog from '@radix-ui/react-dialog';
import {Download, ImagePlus, Wand2, RotateCcw, Trash2, X} from 'lucide-react';
import type {CinemaJob} from '@/store/cinema';
import {removeWithUndo} from '@/lib/cinema/client';
import {useCinemaUi} from '@/store/cinema-ui';
import {imageModel, retentionDays} from '@/lib/cinema/capabilities';
import {findModel} from '@/lib/ai/models';
import {credits, useImageActions} from './job-card';

const dateFormat = new Intl.DateTimeFormat('es-AR', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
const dayFormat = new Intl.DateTimeFormat('es-AR', {day: 'numeric', month: 'long'});
const modeName = {create: 'Imagen', edit: 'Edición', shot: 'Plano', video: 'Video'} as const;

/** Large view with every real detail Kie returned, and the actions that exist. */
export function ImageViewer({job, onClose}: {job: CinemaJob | null; onClose: () => void}) {
  const patchImage = useCinemaUi(s => s.patchImage);
  const patchEdit = useCinemaUi(s => s.patchEdit);
  const patchVideo = useCinemaUi(s => s.patchVideo);
  const setTab = useCinemaUi(s => s.setTab);
  const actions = useImageActions();
  const url = job?.urls[0];
  const video = job?.mode === 'video';

  function repeat() {
    if (!job) return;
    if (job.mode === 'edit' && job.source) { patchEdit({source: job.source, instruction: job.prompt, count: 1}); setTab('edit'); }
    else if (job.mode === 'shot') setTab('direct');
    else if (job.mode === 'video') { patchVideo({...(job.model ? {model: job.model} : {}), prompt: job.prompt, aspect: job.aspect, resolution: job.resolution, duration: job.duration || '', references: job.references, videoReferences: job.videoReferences || []}); setTab('video'); }
    else { patchImage({...(job.model ? {model: job.model} : {}), prompt: job.prompt, aspect: job.aspect, resolution: job.resolution, references: job.references, count: 1}); setTab('image'); }
    onClose();
  }

  return (
    <RadixDialog.Root open={Boolean(job && url)} onOpenChange={v => { if (!v) onClose(); }}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="rc-overlay rc-layer" />
        <RadixDialog.Content className="rc-viewer rc-layer" aria-describedby={undefined}>
          {job && url ? (
            <>
              <div className="rc-viewer-stage">
                {video ? <video src={url} controls playsInline preload="metadata" aria-label={'Video: ' + job.prompt.slice(0, 160)} /> : <img src={url} alt={job.prompt.slice(0, 160)} />}
              </div>
              <aside className="rc-viewer-side">
                <RadixDialog.Title className="rc-viewer-title">{modeName[job.mode]}</RadixDialog.Title>
                <RadixDialog.Close asChild>
                  <button type="button" className="rc-icon-btn rc-dialog-close" aria-label="Cerrar"><X /></button>
                </RadixDialog.Close>
                <p className="rc-viewer-prompt">{job.prompt}</p>
                <dl className="rc-facts rc-viewer-facts">
                  <dt>Modelo</dt><dd>{(job.model && findModel(job.model)?.name) || imageModel.name}</dd>
                  {job.aspect ? <><dt>Formato</dt><dd>{job.aspect === 'auto' ? 'Automático' : job.aspect}</dd></> : null}
                  {job.resolution ? <><dt>Resolución</dt><dd>{job.resolution}</dd></> : null}
                  {job.duration ? <><dt>Duración</dt><dd>{job.duration} s</dd></> : null}
                  {job.references.length ? <><dt>{video ? 'Imágenes de partida' : 'Referencias'}</dt><dd>{job.references.length}</dd></> : null}
                  {job.videoReferences?.length ? <><dt>Videos de referencia</dt><dd>{job.videoReferences.length}</dd></> : null}
                  {job.credits !== undefined ? <><dt>Costo</dt><dd>{credits(job.credits)} · informado por Kie</dd></> : null}
                  <dt>Creada</dt><dd>{dateFormat.format(new Date(job.createdAt))}</dd>
                </dl>
                <p className="rc-hint">Kie conserva el archivo {retentionDays} días: hasta aprox. el {dayFormat.format(new Date((job.finishedAt || job.createdAt) + retentionDays * 86400000))}. Descargalo si querés conservarlo.</p>
                <div className="rc-viewer-actions">
                  <button type="button" className="rc-btn rc-btn--primary rc-btn--sm" onClick={() => void actions.download(url, job.taskId || job.id)}><Download />Descargar</button>
                  {!video ? <>
                    <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" onClick={() => { actions.addReference(url); onClose(); }}><ImagePlus />Usar como referencia</button>
                    <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" onClick={() => { actions.editImage(url); onClose(); }}><Wand2 />Editar</button>
                  </> : null}
                  <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={repeat}><RotateCcw />Repetir con estos ajustes</button>
                  <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm rc-viewer-remove" onClick={() => { removeWithUndo([job]); onClose(); }}><Trash2 />Quitar de la galería</button>
                </div>
              </aside>
            </>
          ) : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
