'use client';
import {useEffect, useState} from 'react';
import {toast} from 'sonner';
import {Download, ImagePlus, Wand2, Maximize2, X} from 'lucide-react';
import {useCinema, isActive, type CinemaJob} from '@/store/cinema';
import {useCinemaUi} from '@/store/cinema-ui';
import {ratioValue, imageModel} from '@/lib/cinema/capabilities';
import {retryJob, downloadImage} from '@/lib/cinema/client';
import {errorDetail} from '@/lib/cinema/errors';
import {Tip} from '@/components/ui/tooltip';

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

/** Kie deletes generated files after 14 days: show that plainly instead of a broken image. */
export function KieImage({src, alt, className}: {src: string; alt: string; className?: string}) {
  const [missing, setMissing] = useState(false);
  if (missing) return <span className={'rc-kie-missing ' + (className || '')}>Kie ya no tiene este archivo</span>;
  return <img src={src} alt={alt} className={className} loading="lazy" decoding="async" onError={() => setMissing(true)} />;
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
  return [job.aspect === 'auto' ? 'Auto' : job.aspect, job.resolution, job.credits !== undefined ? credits(job.credits) : null].filter(Boolean).join(' · ');
}

export function JobCard({job, onOpen}: {job: CinemaJob; onOpen: (job: CinemaJob) => void}) {
  const removeJobs = useCinema(s => s.removeJobs);
  const actions = useImageActions();
  const active = isActive(job);
  const failed = job.state === 'error' || job.state === 'fail';
  const url = job.urls[0];
  const ratio = job.aspect === 'auto' ? 1 : ratioValue(job.aspect);

  return (
    <article className="rc-job" data-state={job.state} aria-label={active ? 'Imagen en proceso' : failed ? 'Imagen con error' : 'Imagen generada'}>
      {url ? (
        <button type="button" className="rc-job-media" onClick={() => onOpen(job)} aria-label="Ver imagen">
          <KieImage src={url} alt={job.prompt.slice(0, 120)} />
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
              <p>No pude generar esta imagen.</p>
              <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" onClick={() => void retryJob(job)}>Reintentar</button>
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
              <Tip label="Descargar"><button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label="Descargar" onClick={() => void actions.download(url, job.taskId || job.id)}><Download /></button></Tip>
              <Tip label="Usar como referencia"><button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label="Usar como referencia" onClick={() => actions.addReference(url)}><ImagePlus /></button></Tip>
              <Tip label="Editar"><button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label="Editar esta imagen" onClick={() => actions.editImage(url)}><Wand2 /></button></Tip>
              <Tip label="Ver"><button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label="Ver en grande" onClick={() => onOpen(job)}><Maximize2 /></button></Tip>
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
