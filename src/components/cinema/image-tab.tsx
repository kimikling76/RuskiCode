'use client';
import {useMemo, useState} from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import {X, ImagePlus, Sparkles} from 'lucide-react';
import {useCinema} from '@/store/cinema';
import {useCinemaUi} from '@/store/cinema-ui';
import {imageModels, enabledStatus, publicModel, promptLimit} from '@/lib/ai/models';
import {startGeneration} from '@/lib/cinema/client';
import {ChatModelPicker, estimate} from '@/components/studio/chat-model-picker';
import {Tip} from '@/components/ui/tooltip';
import {AskFirst, AspectPicker, PromptCount, Segmented, SettingChip, aspectName, optionLabel, useGenerateConfirm} from './controls';
import {JobCard} from './job-card';
import {GalleryPicker, refSrc} from './gallery-picker';
import {authorImageName} from '@/lib/cinema/mentions';
import {PromptAssistant} from './prompt-assistant';
import type {CinemaJob} from '@/store/cinema';

// Image: the results take the screen and the request is written below them, as in the Chat. Each setting is a chip
// that shows its value; its options open from it. Only what the chosen model offers is shown and sent.

const models = imageModels.map(m => publicModel(m, true));

export function ImageTab({onOpen}: {onOpen: (job: CinemaJob) => void}) {
  const draft = useCinemaUi(s => s.image);
  const patch = useCinemaUi(s => s.patchImage);
  const allJobs = useCinema(s => s.data.jobs);
  const jobs = useMemo(() => allJobs.filter(j => j.mode === 'create'), [allJobs]);
  const [picker, setPicker] = useState(false);
  const [assistant, setAssistant] = useState(false);
  // Options always come from the chosen model's catalog entry.
  const model = imageModels.find(m => m.id === draft.model && enabledStatus(m)) || imageModels[0];
  const o = model.options;
  const count = Math.min(draft.count, o.maxVariants);
  const label = count === 1 ? 'Generar' : 'Generar ' + count;
  // Only what this model offers is sent: a value from another model falls back to this one's first option.
  const aspect = o.aspectRatios.includes(draft.aspect) ? draft.aspect : o.aspectRatios[0];
  const resolution = o.resolutions.includes(draft.resolution) ? draft.resolution : o.resolutions[0];
  const references = draft.references.slice(0, o.maxReferences);
  const resolutionLabel = o.resolutionLabel || 'Resolución';
  // A model that only edits needs at least one reference image.
  const edits = !o.modes.includes('create');
  const needsImage = edits && !references.length;
  const limit = promptLimit(o);
  const ready = Boolean(draft.prompt.trim()) && !needsImage && draft.prompt.trim().length <= limit;

  const {request, dialog, busy} = useGenerateConfirm({
    label,
    onGenerate: () => startGeneration({mode: 'create', model: model.id, prompt: draft.prompt.trim(), aspect, resolution, references, count}),
    facts: [
      ['Modelo', model.name],
      ['Imágenes', String(count)],
      ...(o.aspectRatios.length ? [['Formato', aspectName(aspect)] as [string, string]] : []),
      ...(o.resolutions.length ? [[resolutionLabel, optionLabel(resolution)] as [string, string]] : []),
      ...(references.length ? [['Referencias', String(references.length)] as [string, string]] : []),
      ...(model.price ? [['Costo', estimate(model.price) + '; el real lo informa Kie al terminar'] as [string, string]] : []),
    ],
  });
  const generate = () => { if (ready) request(); };
  const refsLabel = (edits ? 'Imagen a editar' : 'Referencias') + ' de tu galería o de tu computadora (hasta ' + o.maxReferences + '). En el texto se llaman @image1, @image2…';

  return (
    <div className="rc-cine-work">
      <section className="rc-cine-results" tabIndex={0} aria-label="Resultados">
        {jobs.length ? (
          <div className="rc-job-grid rc-job-grid--large">
            {jobs.map(job => <JobCard key={job.id} job={job} onOpen={onOpen} />)}
          </div>
        ) : (
          <div className="rc-cine-empty">
            <div className="rc-cine-empty-frame" aria-hidden="true" />
            <p>Escribí abajo qué querés ver. Las imágenes aparecen acá a medida que Kie las termina.</p>
          </div>
        )}
      </section>

      <div className="rc-gen-zone">
        <div className="rc-gen-column">
          {needsImage ? (
            <div className="rc-notice" role="status">
              <span className="rc-dot" aria-hidden="true" />
              <span>{model.name} edita una imagen: elegí al menos una de tu galería o de tu computadora.</span>
            </div>
          ) : null}
          <form className="rc-composer rc-gen" aria-label="Generar imágenes" onSubmit={e => { e.preventDefault(); generate(); }}>
            {references.length ? (
              <div className="rc-gen-refs" aria-label={edits ? 'Imagen a editar' : 'Referencias'} role="group">
                {references.map((url, i) => (
                  <span key={url} className="rc-ref">
                    <img src={refSrc(url)} alt="" />
                    {!o.fields.imagesSingle || i === 0 ? <span className="rc-ref-name">{authorImageName(i + 1)}</span> : null}
                    <button type="button" className="rc-ref-remove" aria-label="Quitar referencia" onClick={() => patch({references: draft.references.filter(u => u !== url)})}><X /></button>
                  </span>
                ))}
              </div>
            ) : null}
            <label className="sr-only" htmlFor="cinema-prompt">Prompt</label>
            <TextareaAutosize
              id="cinema-prompt"
              className="rc-composer-input rc-gen-prompt"
              minRows={2}
              maxRows={8}
              maxLength={limit}
              value={draft.prompt}
              onChange={e => patch({prompt: e.target.value})}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); generate(); } }}
              placeholder="Qué querés ver: sujeto, lugar, encuadre, luz y estilo"
            />
            <PromptCount length={draft.prompt.trim().length} limit={limit} model={model.name} />
            <div className="rc-gen-bar">
              <div className="rc-gen-chips">
                {o.maxReferences ? (
                  <Tip label={refsLabel}>
                    <button type="button" className="rc-icon-btn" aria-label={(edits ? 'Elegir la imagen a editar' : 'Agregar referencias') + ' de la galería o de tu computadora'} onClick={() => setPicker(true)}>
                      <ImagePlus />{references.length ? <span className="rc-gen-count" aria-hidden="true">{references.length}</span> : null}
                    </button>
                  </Tip>
                ) : null}
                <Tip label="Ayuda con el prompt">
                  <button type="button" className="rc-icon-btn" aria-label="Ayuda con el prompt" onClick={() => setAssistant(true)}><Sparkles /></button>
                </Tip>
                <ChatModelPicker models={models} value={model.id} onChange={id => patch({model: id})} category="image" allowAuto={false} title="Modelo de imagen" />
                {o.aspectRatios.length ? (
                  <SettingChip label="Formato" valueText={aspectName(aspect)} value={aspect === 'auto' ? 'Auto' : aspect === 'adaptive' ? 'Adapt.' : aspect} wide>
                    {close => <AspectPicker value={aspect} onChange={aspect => patch({aspect})} options={o.aspectRatios} onPick={close} />}
                  </SettingChip>
                ) : null}
                {o.resolutions.length ? (
                  <SettingChip label={resolutionLabel} valueText={optionLabel(resolution)}>
                    {close => <Segmented name="resolution" label={resolutionLabel} value={resolution} onChange={resolution => patch({resolution})} onPick={close} options={o.resolutions.map(r => ({value: r, label: optionLabel(r)}))} />}
                  </SettingChip>
                ) : null}
                {o.maxVariants > 1 ? (
                  <SettingChip label="Imágenes" valueText={String(count)} hint="Cada imagen es una tarea aparte en Kie y se cobra por separado.">
                    {close => <Segmented name="variants" label="Imágenes" value={count} onChange={v => patch({count: v})} onPick={close} options={Array.from({length: o.maxVariants}, (_, i) => ({value: i + 1, label: String(i + 1)}))} />}
                  </SettingChip>
                ) : null}
              </div>
              <div className="rc-gen-actions">
                <AskFirst />
                <Tip label={ready ? label : needsImage ? 'Elegí la imagen a editar' : draft.prompt.trim().length > limit ? 'Acortá el texto' : 'Escribí el prompt'} shortcut={ready ? 'Ctrl+Enter' : undefined}>
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
        initial={draft.references}
        title={edits ? 'Imagen a editar' : 'Referencias'}
        upload
        onChoose={references => patch({references})}
      />
      <PromptAssistant open={assistant} onClose={() => setAssistant(false)} initial={draft.prompt} onUse={prompt => patch({prompt})} />
    </div>
  );
}
