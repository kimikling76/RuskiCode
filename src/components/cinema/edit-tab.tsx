'use client';
import {useEffect, useMemo, useState} from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import {ReactCompareSlider, ReactCompareSliderImage} from 'react-compare-slider';
import {ImageIcon} from 'lucide-react';
import {useCinema, isDone, type CinemaJob} from '@/store/cinema';
import {useCinemaUi} from '@/store/cinema-ui';
import {imageModel, maxVariants, resolutions, type Resolution} from '@/lib/cinema/capabilities';
import {startGeneration} from '@/lib/cinema/client';
import {Field, GenerateBar, ModelRow, Segmented} from './controls';
import {JobCard} from './job-card';
import {GalleryPicker, refSrc} from './gallery-picker';

export function EditTab({onOpen}: {onOpen: (job: CinemaJob) => void}) {
  const draft = useCinemaUi(s => s.edit);
  const patch = useCinemaUi(s => s.patchEdit);
  const allJobs = useCinema(s => s.data.jobs);
  const [picker, setPicker] = useState(false);
  const [resolution, setResolution] = useState<Resolution>('1K');
  const [chosen, setChosen] = useState<string | null>(null);
  const [view, setView] = useState<'compare' | 'variants'>('compare');

  const edits = useMemo(() => allJobs.filter(j => j.mode === 'edit' && j.source === draft.source), [allJobs, draft.source]);
  const results = useMemo(() => edits.filter(isDone), [edits]);
  const latestBatch = edits[0]?.batchId;
  const batch = useMemo(() => edits.filter(j => j.batchId === latestBatch), [edits, latestBatch]);
  const current = results.find(j => j.id === chosen) || results[0];

  // A new batch selects its first finished result.
  useEffect(() => { setChosen(null); }, [latestBatch, draft.source]);

  function generate() {
    if (!draft.source) return;
    return startGeneration({mode: 'edit', prompt: draft.instruction.trim(), aspect: 'auto', resolution, references: [draft.source], count: draft.count, source: draft.source});
  }

  const doneInBatch = batch.filter(isDone);

  return (
    <div className="rc-cine-layout">
      <section className="rc-cine-panel" aria-label="Ajustes de la edición">
        <div className="rc-cine-panel-scroll">
          <Field label="Imagen original" hint="De tu galería o de tu computadora.">
            <button type="button" className="rc-edit-source" onClick={() => setPicker(true)} aria-label={draft.source ? 'Cambiar imagen original' : 'Elegir o subir la imagen original'}>
              {draft.source ? <img src={refSrc(draft.source)} alt="" /> : <span><ImageIcon aria-hidden="true" />Elegir o subir una imagen</span>}
            </button>
          </Field>
          <Field label="Instrucción">
            <TextareaAutosize
              aria-label="Instrucción de edición"
              className="rc-textarea rc-cine-prompt"
              minRows={3}
              maxRows={10}
              maxLength={4000}
              value={draft.instruction}
              onChange={e => patch({instruction: e.target.value})}
              placeholder="Qué cambiar: «que sea de noche», «quitá el cartel», «estilo acuarela»"
            />
          </Field>
          <Field label="Modelo"><ModelRow detail="formato automático" /></Field>
          <Field label="Resolución">
            <Segmented name="edit-resolution" label="Resolución" value={resolution} onChange={setResolution} options={resolutions.map(r => ({value: r, label: r}))} />
          </Field>
          <Field label="Variantes">
            <Segmented name="edit-variants" label="Variantes" value={draft.count} onChange={count => patch({count})} options={Array.from({length: maxVariants}, (_, i) => ({value: i + 1, label: String(i + 1)}))} />
          </Field>
        </div>
        <GenerateBar
          label={draft.count === 1 ? 'Editar' : 'Editar · ' + draft.count}
          disabled={!draft.source || !draft.instruction.trim()}
          onGenerate={generate}
          facts={[['Modelo', imageModel.name], ['Variantes', String(draft.count)], ['Resolución', resolution]]}
        />
      </section>

      <section className="rc-cine-stage" tabIndex={0} aria-label="Comparación">
        {!draft.source ? (
          <div className="rc-cine-empty">
            <div className="rc-cine-empty-frame" aria-hidden="true" />
            <p>Elegí una imagen de la galería, o subí una de tu computadora, para editarla.</p>
          </div>
        ) : (
          <div className="rc-edit-stage">
            {doneInBatch.length > 1 ? (
              <div className="rc-edit-switch">
                <div className="rc-segmented rc-segmented--compact" role="radiogroup" aria-label="Vista">
                  <label><input type="radio" name="edit-view" checked={view === 'compare'} onChange={() => setView('compare')} /><strong>Antes y después</strong></label>
                  <label><input type="radio" name="edit-view" checked={view === 'variants'} onChange={() => setView('variants')} /><strong>Variantes</strong></label>
                </div>
              </div>
            ) : null}

            {view === 'variants' && doneInBatch.length > 1 ? (
              <div className="rc-variants" data-count={doneInBatch.length}>
                {doneInBatch.map((job, i) => (
                  <button key={job.id} type="button" className="rc-variant" aria-pressed={current?.id === job.id} onClick={() => { setChosen(job.id); setView('compare'); }}>
                    <img src={job.urls[0]} alt={'Variante ' + (i + 1)} />
                    <span>{String(i + 1).padStart(2, '0')}</span>
                  </button>
                ))}
              </div>
            ) : current ? (
              <figure className="rc-compare">
                <ReactCompareSlider
                  itemOne={<ReactCompareSliderImage src={draft.source} alt="Antes" />}
                  itemTwo={<ReactCompareSliderImage src={current.urls[0]} alt="Después" />}
                  keyboardIncrement="5%"
                />
                <figcaption><span>Antes</span><span>Después</span></figcaption>
              </figure>
            ) : (
              <figure className="rc-compare rc-compare--single">
                <img src={refSrc(draft.source)} alt="Imagen original" />
              </figure>
            )}

            {edits.length ? (
              <div className="rc-edit-strip">
                {edits.map(job => isDone(job) ? (
                  <button key={job.id} type="button" className="rc-strip-item" aria-pressed={current?.id === job.id} onClick={() => { setChosen(job.id); setView('compare'); }} aria-label={'Comparar: ' + job.prompt.slice(0, 80)}>
                    <img src={job.urls[0]} alt="" />
                  </button>
                ) : (
                  <div key={job.id} className="rc-strip-card"><JobCard job={job} onOpen={onOpen} /></div>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </section>

      <GalleryPicker
        open={picker}
        onClose={() => setPicker(false)}
        max={1}
        initial={draft.source ? [draft.source] : []}
        title="Imagen original"
        upload
        onChoose={urls => patch({source: urls[0] || null})}
      />
    </div>
  );
}
