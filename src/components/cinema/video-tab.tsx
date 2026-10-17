'use client';
import {useMemo, useState} from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import {ArrowUpRight} from 'lucide-react';
import {videoModels, enabledStatus} from '@/lib/ai/models';
import {useCinema, type CinemaJob} from '@/store/cinema';
import {startGeneration} from '@/lib/cinema/client';
import {AspectPicker, Field, GenerateBar, MediaModelPicker, Segmented} from './controls';
import {JobCard} from './job-card';

/**
 * Video generation through the catalog. Until a video model is verified, the tab says so and lists
 * what is missing for each one: no controls, no simulated progress.
 */
export function VideoTab({onOpen}: {onOpen?: (job: CinemaJob) => void}) {
  const enabled = videoModels.filter(enabledStatus);
  const allJobs = useCinema(s => s.data.jobs);
  const jobs = useMemo(() => allJobs.filter(j => j.mode === 'video'), [allJobs]);
  const [modelId, setModelId] = useState(enabled[0]?.id || '');
  const [prompt, setPrompt] = useState('');
  const model = enabled.find(m => m.id === modelId) || enabled[0];
  const [aspect, setAspect] = useState(model?.options.aspectRatios[0] || '');
  const [resolution, setResolution] = useState(model?.options.resolutions[0] || '');
  const [duration, setDuration] = useState(model?.options.durations[0] || '');

  if (!model) {
    return (
      <div className="rc-cine-empty rc-cine-empty--page">
        <div className="rc-cine-empty-frame rc-cine-empty-frame--wide" aria-hidden="true" />
        <h2>El video todavía no está conectado</h2>
        <p>Ningún modelo de video tiene todavía sus opciones confirmadas en la documentación de Kie. Hasta que lo estén, no se muestran controles.</p>
        <ul className="rc-video-pending">
          {videoModels.map(m => (
            <li key={m.id}>
              <strong>{m.name}</strong> <span className="rc-hint">· {m.provider}</span>
              <p className="rc-hint">{m.missing}</p>
              <a href={m.docs} target="_blank" rel="noreferrer" className="rc-site-link">Documentación<ArrowUpRight aria-hidden="true" /></a>
            </li>
          ))}
        </ul>
        <p className="rc-hint">Mientras tanto, en Dirigir podés armar guion, planos e imágenes por plano.</p>
      </div>
    );
  }

  const o = model.options;
  const facts: [string, string][] = [
    ['Modelo', model.name],
    ...(o.aspectRatios.length ? [['Formato', aspect] as [string, string]] : []),
    ...(o.resolutions.length ? [['Resolución', resolution] as [string, string]] : []),
    ...(o.durations.length ? [['Duración', duration + ' s'] as [string, string]] : []),
  ];

  return (
    <div className="rc-cine-layout">
      <section className="rc-cine-panel" aria-label="Ajustes del video">
        <div className="rc-cine-panel-scroll">
          <Field label="Prompt">
            <TextareaAutosize aria-label="Prompt del video" className="rc-textarea rc-cine-prompt" minRows={4} maxRows={12} maxLength={4000} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Qué pasa, dónde, cómo se mueve la cámara" />
          </Field>
          <Field label="Modelo"><MediaModelPicker category="video" value={model.id} onChange={setModelId} /></Field>
          {o.aspectRatios.length ? <Field label="Formato"><AspectPicker name="video-aspect" value={aspect} onChange={setAspect} options={o.aspectRatios} /></Field> : null}
          {o.resolutions.length ? <Field label="Resolución"><Segmented name="video-resolution" label="Resolución" value={resolution} onChange={setResolution} options={o.resolutions.map(r => ({value: r, label: r}))} /></Field> : null}
          {o.durations.length ? <Field label="Duración"><Segmented name="video-duration" label="Duración" value={duration} onChange={setDuration} options={o.durations.map(d => ({value: d, label: d + ' s'}))} /></Field> : null}
        </div>
        <GenerateBar
          label="Generar video"
          disabled={!prompt.trim()}
          facts={facts}
          onGenerate={() => void startGeneration({mode: 'video', model: model.id, prompt: prompt.trim(), aspect: o.aspectRatios.length ? aspect : '', resolution: o.resolutions.length ? resolution : '', duration: o.durations.length ? duration : undefined, references: [], count: 1})}
        />
      </section>
      <section className="rc-cine-stage" tabIndex={0} aria-label="Videos">
        {jobs.length ? <div className="rc-job-grid">{jobs.map(j => <JobCard key={j.id} job={j} onOpen={onOpen || (() => {})} />)}</div> : (
          <div className="rc-cine-empty"><p className="rc-hint">Los videos que generes aparecen acá, con su estado real.</p></div>
        )}
      </section>
    </div>
  );
}
