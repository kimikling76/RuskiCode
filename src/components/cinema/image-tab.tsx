'use client';
import {useMemo, useState} from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import {X, Plus} from 'lucide-react';
import {useCinema} from '@/store/cinema';
import {useCinemaUi} from '@/store/cinema-ui';
import {imageModels, enabledStatus} from '@/lib/ai/models';
import {startGeneration} from '@/lib/cinema/client';
import {estimate} from '@/components/studio/chat-model-picker';
import {AspectPicker, AssistantButton, Field, GenerateBar, MediaModelPicker, Segmented, aspectName, optionLabel} from './controls';
import {JobCard} from './job-card';
import {GalleryPicker} from './gallery-picker';
import {PromptAssistant} from './prompt-assistant';
import type {CinemaJob} from '@/store/cinema';

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
  const needsImage = !o.modes.includes('create') && !references.length;

  function generate() {
    void startGeneration({mode: 'create', model: model.id, prompt: draft.prompt.trim(), aspect, resolution, references, count});
  }

  return (
    <div className="rc-cine-layout">
      <section className="rc-cine-panel" aria-label="Ajustes de la imagen">
        <div className="rc-cine-panel-scroll">
          <Field label="Prompt" action={<AssistantButton onClick={() => setAssistant(true)} />}>
            <TextareaAutosize
              id="cinema-prompt"
              aria-label="Prompt"
              className="rc-textarea rc-cine-prompt"
              minRows={4}
              maxRows={12}
              maxLength={4000}
              value={draft.prompt}
              onChange={e => patch({prompt: e.target.value})}
              placeholder="Qué querés ver: sujeto, lugar, encuadre, luz y estilo"
            />
          </Field>
          <Field label="Modelo"><MediaModelPicker category="image" value={model.id} onChange={id => patch({model: id})} /></Field>
          {o.aspectRatios.length ? <Field label="Formato"><AspectPicker value={aspect} onChange={aspect => patch({aspect})} options={o.aspectRatios} /></Field> : null}
          {o.resolutions.length ? (
            <Field label={resolutionLabel}>
              <Segmented name="resolution" label={resolutionLabel} value={resolution} onChange={resolution => patch({resolution})} options={o.resolutions.map(r => ({value: r, label: optionLabel(r)}))} />
            </Field>
          ) : null}
          {o.maxVariants > 1 ? (
            <Field label="Variantes" hint="Cada variante es una tarea aparte en Kie.">
              <Segmented name="variants" label="Variantes" value={count} onChange={v => patch({count: v})} options={Array.from({length: o.maxVariants}, (_, i) => ({value: i + 1, label: String(i + 1)}))} />
            </Field>
          ) : null}
          {o.maxReferences ? <Field label={o.modes.includes('create') ? 'Referencias' : 'Imagen a editar'} hint={(o.modes.includes('create') ? '' : 'Este modelo edita una imagen: elegí al menos una. ') + 'Imágenes de tu galería. Subir desde el dispositivo llega más adelante.'}>
            <div className="rc-refs">
              {draft.references.map(url => (
                <span key={url} className="rc-ref">
                  <img src={url} alt="" />
                  <button type="button" className="rc-ref-remove" aria-label="Quitar referencia" onClick={() => patch({references: draft.references.filter(u => u !== url)})}><X /></button>
                </span>
              ))}
              {draft.references.length < o.maxReferences ? (
                <button type="button" className="rc-ref-add" onClick={() => setPicker(true)} aria-label="Agregar referencias desde la galería"><Plus /></button>
              ) : null}
            </div>
          </Field> : null}
        </div>
        <GenerateBar
          label={label}
          disabled={!draft.prompt.trim() || needsImage}
          onGenerate={generate}
          facts={[
            ['Modelo', model.name],
            ['Imágenes', String(count)],
            ...(o.aspectRatios.length ? [['Formato', aspectName(aspect)] as [string, string]] : []),
            ...(o.resolutions.length ? [[resolutionLabel, optionLabel(resolution)] as [string, string]] : []),
            ...(references.length ? [['Referencias', String(references.length)] as [string, string]] : []),
            ...(model.price ? [['Costo', estimate(model.price) + '; el real lo informa Kie al terminar'] as [string, string]] : []),
          ]}
        />
      </section>

      <section className="rc-cine-stage" tabIndex={0} aria-label="Resultados">
        {jobs.length ? (
          <div className="rc-job-grid">
            {jobs.map(job => <JobCard key={job.id} job={job} onOpen={onOpen} />)}
          </div>
        ) : (
          <div className="rc-cine-empty">
            <div className="rc-cine-empty-frame" aria-hidden="true" />
            <p>Las imágenes aparecen acá a medida que Kie las termina.</p>
          </div>
        )}
      </section>

      <GalleryPicker
        open={picker}
        onClose={() => setPicker(false)}
        max={o.maxReferences}
        initial={draft.references}
        title="Referencias"
        onChoose={references => patch({references})}
      />
      <PromptAssistant open={assistant} onClose={() => setAssistant(false)} initial={draft.prompt} onUse={prompt => patch({prompt})} />
    </div>
  );
}
