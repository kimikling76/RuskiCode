'use client';
import {useMemo, useState} from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import {ArrowUpRight, ImagePlus, Sparkles, X} from 'lucide-react';
import {videoModels, enabledStatus, publicModel} from '@/lib/ai/models';
import {useCinema, type CinemaJob} from '@/store/cinema';
import {useCinemaUi} from '@/store/cinema-ui';
import {startGeneration} from '@/lib/cinema/client';
import {ChatModelPicker, estimate} from '@/components/studio/chat-model-picker';
import {Tip} from '@/components/ui/tooltip';
import {AskFirst, AspectPicker, Segmented, SettingChip, aspectName, optionLabel, useGenerateConfirm} from './controls';
import {JobCard} from './job-card';
import {GalleryPicker, refSrc} from './gallery-picker';
import {authorImageName} from '@/lib/cinema/mentions';
import {PromptAssistant} from './prompt-assistant';

// Video: the same frame as Image. The results take the screen and the request is written below them; each setting is
// a chip that shows its value. Only what the chosen model offers is shown and sent. A model that animates a picture
// asks for its starting image from the gallery.

const models = videoModels.map(m => publicModel(m, true));

export function VideoTab({onOpen}: {onOpen?: (job: CinemaJob) => void}) {
  const draft = useCinemaUi(s => s.video);
  const patch = useCinemaUi(s => s.patchVideo);
  const allJobs = useCinema(s => s.data.jobs);
  const jobs = useMemo(() => allJobs.filter(j => j.mode === 'video'), [allJobs]);
  const [picker, setPicker] = useState(false);
  const [assistant, setAssistant] = useState(false);
  const enabled = videoModels.filter(enabledStatus);
  // Until one is chosen, the first model that works from a prompt alone.
  const model = enabled.find(m => m.id === draft.model) || enabled.find(m => m.options.modes.includes('create')) || enabled[0];

  const o = model?.options;
  // A value chosen for another model falls back to this model's first option.
  const pick = (value: string, list: readonly string[]) => list.includes(value) ? value : list[0] || '';
  const aspect = pick(draft.aspect, o?.aspectRatios || []);
  const resolution = pick(draft.resolution, o?.resolutions || []);
  // The chosen seconds while the model accepts them; otherwise its documented default.
  const duration = pick(o?.durations.includes(draft.duration || '') ? draft.duration || '' : o?.durationDefault || '', o?.durations || []);
  const references = draft.references.slice(0, o?.maxReferences || 0);
  const resolutionLabel = o?.resolutionLabel || 'Resolución';
  // A model that only animates a picture needs its starting image.
  const animates = Boolean(o && !o.modes.includes('create'));
  const needsImage = animates && !references.length;
  const start = o?.maxReferences === 1;
  const imagesName = start ? 'Imagen inicial' : 'Referencias';
  const ready = Boolean(draft.prompt.trim()) && !needsImage;
  const label = 'Generar video';

  const {request, dialog, busy} = useGenerateConfirm({
    label,
    onGenerate: () => {
      if (!model || !o) return;
      return startGeneration({mode: 'video', model: model.id, prompt: draft.prompt.trim(), aspect: o.aspectRatios.length ? aspect : '', resolution: o.resolutions.length ? resolution : '', duration: o.durations.length ? duration : undefined, references, count: 1});
    },
    facts: model && o ? [
      ['Modelo', model.name],
      ...(o.aspectRatios.length ? [['Formato', aspectName(aspect)] as [string, string]] : []),
      ...(o.resolutions.length ? [[resolutionLabel, optionLabel(resolution)] as [string, string]] : []),
      ...(o.durations.length ? [['Duración', duration + ' s'] as [string, string]] : []),
      ...(references.length ? [[imagesName, String(references.length)] as [string, string]] : []),
      ...(model.price ? [['Costo', estimate(model.price) + '; el real lo informa Kie al terminar'] as [string, string]] : []),
    ] : [],
  });

  if (!model || !o) {
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

  const generate = () => { if (ready) request(); };
  const refsLabel = (start ? 'Imagen inicial' : 'Referencias (hasta ' + o.maxReferences + ')') + ' de tu galería o de tu computadora' + (animates ? '' : ', si querés') + '. En el texto se llama' + (o.maxReferences > 1 ? 'n @image1, @image2…' : ' @image1') + '.';

  return (
    <div className="rc-cine-work">
      <section className="rc-cine-results" tabIndex={0} aria-label="Videos">
        {jobs.length ? (
          <div className="rc-job-grid rc-job-grid--large">
            {jobs.map(job => <JobCard key={job.id} job={job} onOpen={onOpen || (() => {})} />)}
          </div>
        ) : (
          <div className="rc-cine-empty">
            <div className="rc-cine-empty-frame rc-cine-empty-frame--wide" aria-hidden="true" />
            <p>Escribí abajo qué pasa en el video. Los videos aparecen acá, con su estado real, a medida que Kie los termina.</p>
          </div>
        )}
      </section>

      <div className="rc-gen-zone">
        <div className="rc-gen-column">
          {needsImage ? (
            <div className="rc-notice" role="status">
              <span className="rc-dot" aria-hidden="true" />
              <span>{model.name} anima una imagen: elegí la imagen inicial de tu galería o de tu computadora.</span>
            </div>
          ) : null}
          <form className="rc-composer rc-gen" aria-label="Generar video" onSubmit={e => { e.preventDefault(); generate(); }}>
            {references.length ? (
              <div className="rc-gen-refs" aria-label={imagesName} role="group">
                {references.map((url, i) => (
                  <span key={url} className="rc-ref">
                    <img src={refSrc(url)} alt="" />
                    {!o.fields.imagesSingle || i === 0 ? <span className="rc-ref-name">{authorImageName(i + 1)}</span> : null}
                    <button type="button" className="rc-ref-remove" aria-label={start ? 'Quitar la imagen inicial' : 'Quitar referencia'} onClick={() => patch({references: draft.references.filter(u => u !== url)})}><X /></button>
                  </span>
                ))}
              </div>
            ) : null}
            <label className="sr-only" htmlFor="cinema-video-prompt">Prompt del video</label>
            <TextareaAutosize
              id="cinema-video-prompt"
              className="rc-composer-input rc-gen-prompt"
              minRows={2}
              maxRows={8}
              maxLength={4000}
              value={draft.prompt}
              onChange={e => patch({prompt: e.target.value})}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); generate(); } }}
              placeholder="Qué pasa, dónde y cómo se mueve la cámara"
            />
            <div className="rc-gen-bar">
              <div className="rc-gen-chips">
                {o.maxReferences ? (
                  <Tip label={refsLabel}>
                    <button type="button" className="rc-icon-btn" aria-label={(start ? (animates ? 'Elegir' : 'Agregar') + ' la imagen inicial' : 'Agregar referencias') + ' de la galería o de tu computadora'} onClick={() => setPicker(true)}>
                      <ImagePlus />{references.length ? <span className="rc-gen-count" aria-hidden="true">{references.length}</span> : null}
                    </button>
                  </Tip>
                ) : null}
                <Tip label="Ayuda con el prompt">
                  <button type="button" className="rc-icon-btn" aria-label="Ayuda con el prompt" onClick={() => setAssistant(true)}><Sparkles /></button>
                </Tip>
                <ChatModelPicker models={models} value={model.id} onChange={id => patch({model: id})} category="video" allowAuto={false} title="Modelo de video" />
                {o.aspectRatios.length ? (
                  <SettingChip label="Formato" valueText={aspectName(aspect)} value={/^auto$/i.test(aspect) ? 'Auto' : aspect === 'adaptive' ? 'Adapt.' : aspect} wide>
                    {close => <AspectPicker name="video-aspect" value={aspect} onChange={aspect => patch({aspect})} options={o.aspectRatios} onPick={close} />}
                  </SettingChip>
                ) : null}
                {o.resolutions.length ? (
                  <SettingChip label={resolutionLabel} valueText={optionLabel(resolution)}>
                    {close => <Segmented name="video-resolution" label={resolutionLabel} value={resolution} onChange={resolution => patch({resolution})} onPick={close} options={o.resolutions.map(r => ({value: r, label: optionLabel(r)}))} />}
                  </SettingChip>
                ) : null}
                {o.durations.length ? (
                  <SettingChip label="Duración" valueText={duration + ' s'} wide={o.durations.length > 6}>
                    {close => <Segmented name="video-duration" label="Duración" value={duration} onChange={duration => patch({duration})} onPick={close} options={o.durations.map(d => ({value: d, label: d + ' s'}))} />}
                  </SettingChip>
                ) : null}
              </div>
              <div className="rc-gen-actions">
                <AskFirst id="cinema-video-ask-first" />
                <Tip label={ready ? label : needsImage ? 'Elegí la imagen inicial' : 'Escribí el prompt'} shortcut={ready ? 'Ctrl+Enter' : undefined}>
                  <span className="rc-gen-submit">
                    <button type="submit" className="rc-btn rc-btn--primary" disabled={!ready || busy}>{label}</button>
                  </span>
                </Tip>
              </div>
            </div>
          </form>
          {dialog}
        </div>
      </div>

      <GalleryPicker
        open={picker}
        onClose={() => setPicker(false)}
        max={o.maxReferences}
        initial={references}
        title={imagesName}
        upload
        onChoose={references => patch({references})}
      />
      <PromptAssistant open={assistant} onClose={() => setAssistant(false)} initial={draft.prompt} onUse={prompt => patch({prompt})} video />
    </div>
  );
}
