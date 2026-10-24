'use client';
import {useEffect, useState, type ReactNode} from 'react';
import {toast} from 'sonner';
import {Download, ImagePlus, Wand2, Maximize2, X} from 'lucide-react';
import {useCinema, isActive, type CinemaJob} from '@/store/cinema';
import {useCinemaUi} from '@/store/cinema-ui';
import {ratioValue, imageModel} from '@/lib/cinema/capabilities';
import {retryJob, downloadImage} from '@/lib/cinema/client';
import {errorDetail} from '@/lib/cinema/errors';
import {savedUrl} from '@/lib/cinema/keep';
import {Tip} from '@/components/ui/tooltip';
import {ConfirmDialog} from '@/components/ui/dialog';
import {findModel} from '@/lib/ai/models';

const stateLabel: Record<string, string> = {
  sending: 'Enviando',
  waiting: 'En cola',
  queuing: 'En cola',
  generating: 'Generando',
};

export function credits(n: number) {
  return n.toLocaleString('es-AR') + (n === 1 ? ' crédito' : ' créditos');
}

/** Real elapsed time since the request, mm:ss. */
export function Elapsed({since}: {since: number}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return <span className="rc-cine-elapsed">{String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}</span>;
}

/**
 * Kie deletes generated files after 14 days: the studio's copy is shown then (`fallback`), or that is said plainly
 * instead of a broken image.
 */
export function KieImage({src, alt, className, fallback}: {src: string; alt: string; className?: string; fallback?: string}) {
  const [failed, setFailed] = useState(0);
  const current = failed === 0 ? src : failed === 1 && fallback ? fallback : null;
  if (!current) return <span className={'rc-kie-missing ' + (className || '')}>Kie ya no tiene este archivo</span>;
  return <img src={current} alt={alt} className={className} loading="lazy" decoding="async" onError={() => setFailed(n => n + (n === 0 && !fallback ? 2 : 1))} />;
}

export function useImageActions() {
  const addReference = useCinemaUi(s => s.addReference);
  const editImage = useCinemaUi(s => s.editImage);
  return {
    async download(url: string, name: string) {
      try {
        await downloadImage(url, name);
      } catch {
        toast('No pude descargarla.', {action: {label: 'Abrir original', onClick: () => window.open(url, '_blank', 'noopener,noreferrer')}});
      }
    },
    addReference,
    editImage,
  };
}

export function jobMeta(job: CinemaJob) {
  const model = job.model && job.model !== 'nano-banana-2-1' ? findModel(job.model)?.name : null;
  return [model, job.aspect === 'auto' ? 'Auto' : job.aspect, job.resolution, job.duration ? job.duration + ' s' : null, job.credits !== undefined ? credits(job.credits) : null].filter(Boolean).join(' · ');
}

/**
 * `extra`: more actions of the place showing the card (the Estudio's favorite and project), before the usual ones.
 * `uses`: what «Usar como referencia» and «Editar» do (by default they open the image in the Cinema tabs).
 */
export function JobCard({job, onOpen, extra, uses}: {job: CinemaJob; onOpen: (job: CinemaJob) => void; extra?: ReactNode; uses?: {addReference: (url: string) => void; editImage: (url: string) => void}}) {
  const removeJobs = useCinema(s => s.removeJobs);
  const actions = {...useImageActions(), ...uses};
  const active = isActive(job);
  const failed = job.state === 'error' || job.state === 'fail';
  const url = job.urls[0];
  const ratio = !job.aspect || job.aspect === 'auto' ? 1 : ratioValue(job.aspect);
  const video = job.mode === 'video';
  const [confirmRetry, setConfirmRetry] = useState(false);
  // A request that may already exist at Kie is never repeated without the person agreeing.
  const retry = () => job.error === 'CREATE_UNCERTAIN' ? setConfirmRetry(true) : void retryJob(job);

  return (
    <article className="rc-job" data-state={job.state} aria-label={(video ? 'Video' : 'Imagen') + (active ? ' en proceso' : failed ? ' con error' : ' generado' + (video ? '' : 'a'))}>
      <ConfirmDialog
        open={confirmRetry}
        onClose={() => setConfirmRetry(false)}
        onConfirm={() => { setConfirmRetry(false); void retryJob(job); }}
        title="¿Generar de nuevo?"
        description="Kie no confirmó si recibió el pedido anterior. Si lo recibió, ya lo cobró y la nueva generación se cobra aparte. Revisá el registro de Kie antes de seguir."
        confirmLabel="Generar de nuevo"
      >
        <a className="rc-site-link" href="https://kie.ai/logs" target="_blank" rel="noreferrer">Abrir el registro de Kie</a>
      </ConfirmDialog>
      {url && video ? (
        <div className="rc-job-media rc-job-media--video">
          <video src={url} controls preload="metadata" playsInline aria-label={'Video: ' + job.prompt.slice(0, 120)} />
        </div>
      ) : url ? (
        <button type="button" className="rc-job-media" onClick={() => onOpen(job)} aria-label="Ver imagen">
          <KieImage src={url} alt={job.prompt.slice(0, 120)} fallback={savedUrl(job)} />
        </button>
      ) : (
        <div className="rc-job-frame" style={{aspectRatio: String(ratio)}}>
          {active ? (
            <div className="rc-job-status" role="status">
              <span className="rc-job-pulse" aria-hidden="true" />
              <span>{stateLabel[job.state]}</span>
              <Elapsed since={job.createdAt} />
            </div>
          ) : (
            <div className="rc-job-failed" role={job.finishedAt && Date.now() - job.finishedAt < 60000 ? 'alert' : undefined}>
              <span className="rc-dot rc-dot--danger" aria-hidden="true" />
              <p>{video ? 'No pude generar este video.' : 'No pude generar esta imagen.'}</p>
              <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" onClick={retry}>Reintentar</button>
              <details className="rc-msg-error-details">
                <summary>Detalles</summary>
                <p>{errorDetail(job.error)}{job.failMessage ? ' Kie: «' + job.failMessage + '»' : ''}</p>
              </details>
            </div>
          )}
        </div>
      )}
      <footer className="rc-job-foot">
        <p className="rc-job-prompt" title={job.prompt}>{job.prompt}</p>
        <div className="rc-job-bar">
          <span className="rc-job-meta">{jobMeta(job)}</span>
          {url ? (
            <span className="rc-job-actions">
              {extra}
              <Tip label="Descargar"><button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label="Descargar" onClick={() => void actions.download(url, job.taskId || job.id)}><Download /></button></Tip>
              {/* A video plays in its card and can only be downloaded: it is not a reference or an image to edit. */}
              {!video ? <>
                <Tip label="Usar como referencia"><button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label="Usar como referencia" onClick={() => actions.addReference(url)}><ImagePlus /></button></Tip>
                <Tip label="Editar"><button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label="Editar esta imagen" onClick={() => actions.editImage(url)}><Wand2 /></button></Tip>
              </> : null}
              <Tip label="Ver"><button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label={video ? 'Ver el video en grande' : 'Ver en grande'} onClick={() => onOpen(job)}><Maximize2 /></button></Tip>
            </span>
          ) : failed ? (
            <Tip label="Quitar"><button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label="Quitar esta tarjeta" onClick={() => removeJobs([job.id])}><X /></button></Tip>
          ) : null}
        </div>
      </footer>
    </article>
  );
}

export const modelDetail = (job: CinemaJob) => imageModel.name + ' · ' + jobMeta(job);
