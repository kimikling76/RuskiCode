'use client';
import {useMemo, useState} from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import {X, Plus} from 'lucide-react';
import {useCinema} from '@/store/cinema';
import {useCinemaUi} from '@/store/cinema-ui';
import {imageModel, maxReferences, maxVariants, resolutions} from '@/lib/cinema/capabilities';
import {startGeneration} from '@/lib/cinema/client';
import {AspectPicker, AssistantButton, Field, GenerateBar, ModelRow, Segmented} from './controls';
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
  const count = draft.count;
  const label = count === 1 ? 'Generar' : 'Generar ' + count;

  function generate() {
    void startGeneration({mode: 'create', prompt: draft.prompt.trim(), aspect: draft.aspect, resolution: draft.resolution, references: draft.references, count});
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
          <Field label="Modelo"><ModelRow /></Field>
          <Field label="Formato"><AspectPicker value={draft.aspect} onChange={aspect => patch({aspect})} /></Field>
          <Field label="Resolución">
            <Segmented name="resolution" label="Resolución" value={draft.resolution} onChange={resolution => patch({resolution})} options={resolutions.map(r => ({value: r, label: r}))} />
          </Field>
          <Field label="Variantes" hint="Cada variante es una tarea aparte en Kie.">
            <Segmented name="variants" label="Variantes" value={count} onChange={v => patch({count: v})} options={Array.from({length: maxVariants}, (_, i) => ({value: i + 1, label: String(i + 1)}))} />
          </Field>
          <Field label="Referencias" hint="Imágenes de tu galería. Subir desde el dispositivo llega más adelante.">
            <div className="rc-refs">
              {draft.references.map(url => (
                <span key={url} className="rc-ref">
                  <img src={url} alt="" />
                  <button type="button" className="rc-ref-remove" aria-label="Quitar referencia" onClick={() => patch({references: draft.references.filter(u => u !== url)})}><X /></button>
                </span>
              ))}
              {draft.references.length < maxReferences ? (
                <button type="button" className="rc-ref-add" onClick={() => setPicker(true)} aria-label="Agregar referencias desde la galería"><Plus /></button>
              ) : null}
            </div>
          </Field>
        </div>
        <GenerateBar
          label={label}
          disabled={!draft.prompt.trim()}
          onGenerate={generate}
          facts={[
            ['Modelo', imageModel.name],
            ['Imágenes', String(count)],
            ['Formato', draft.aspect === 'auto' ? 'Automático' : draft.aspect],
            ['Resolución', draft.resolution],
            ...(draft.references.length ? [['Referencias', String(draft.references.length)] as [string, string]] : []),
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
        max={maxReferences}
        initial={draft.references}
        title="Referencias"
        onChoose={references => patch({references})}
      />
      <PromptAssistant open={assistant} onClose={() => setAssistant(false)} initial={draft.prompt} onUse={prompt => patch({prompt})} />
    </div>
  );
}
