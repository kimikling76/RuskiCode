'use client';
import {useMemo, useState} from 'react';
import {Check, Download, ImagePlus, Search, Wand2} from 'lucide-react';
import {useCinema, isDone, type CinemaJob, type JobMode} from '@/store/cinema';
import {retentionDays} from '@/lib/cinema/capabilities';
import {removeWithUndo} from '@/lib/cinema/client';
import {Tip} from '@/components/ui/tooltip';
import {Segmented} from './controls';
import {KieImage, useImageActions} from './job-card';

type Filter = 'all' | JobMode;
const filters: {value: Filter; label: string}[] = [
  {value: 'all', label: 'Todo'},
  {value: 'create', label: 'Creadas'},
  {value: 'edit', label: 'Editadas'},
  {value: 'shot', label: 'Planos'},
];

export function GalleryTab({onOpen}: {onOpen: (job: CinemaJob) => void}) {
  const allJobs = useCinema(s => s.data.jobs);
  const actions = useImageActions();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);

  const done = useMemo(() => allJobs.filter(isDone), [allJobs]);
  const needle = query.trim().toLocaleLowerCase('es');
  const items = useMemo(() => done.filter(j => (filter === 'all' || j.mode === filter) && (!needle || j.prompt.toLocaleLowerCase('es').includes(needle))), [done, filter, needle]);

  function toggle(id: string) { setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]); }
  function stopSelecting() { setSelecting(false); setSelected([]); }

  async function downloadSelected() {
    setDownloading(true);
    // One at a time: browsers block many simultaneous downloads.
    for (const job of done.filter(j => selected.includes(j.id))) await actions.download(job.urls[0], job.taskId || job.id);
    setDownloading(false);
  }

  return (
    <div className="rc-gallery">
      <div className="rc-gallery-toolbar">
        <label className="rc-gallery-search">
          <Search aria-hidden="true" />
          <input className="rc-input" type="search" aria-label="Buscar por prompt" placeholder="Buscar por prompt" value={query} onChange={e => setQuery(e.target.value)} />
        </label>
        <Segmented name="gallery-filter" label="Filtrar" value={filter} onChange={setFilter} options={filters} />
        <span className="rc-gallery-count">{items.length} {items.length === 1 ? 'imagen' : 'imágenes'}</span>
        {done.length ? (
          <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" aria-pressed={selecting} onClick={() => selecting ? stopSelecting() : setSelecting(true)}>
            {selecting ? 'Listo' : 'Seleccionar'}
          </button>
        ) : null}
      </div>

      {!done.length ? (
        <div className="rc-cine-empty">
          <div className="rc-cine-empty-frame" aria-hidden="true" />
          <p>Todavía no hay imágenes. Lo que generes en Imagen, Editar o Dirigir aparece acá.</p>
        </div>
      ) : !items.length ? (
        <p className="rc-gallery-none" role="status">Ninguna imagen coincide.</p>
      ) : (
        <ul className="rc-masonry" aria-label="Galería">
          {items.map(job => {
            const url = job.urls[0];
            const on = selected.includes(job.id);
            return (
              <li key={job.id} className="rc-tile" data-selected={on ? 'true' : undefined}>
                <button
                  type="button"
                  className="rc-tile-media"
                  aria-pressed={selecting ? on : undefined}
                  aria-label={(selecting ? (on ? 'Quitar de la selección: ' : 'Seleccionar: ') : 'Ver: ') + job.prompt.slice(0, 80)}
                  onClick={() => selecting ? toggle(job.id) : onOpen(job)}
                >
                  {job.mode === 'video' ? <video src={url} muted preload="metadata" playsInline aria-hidden="true" /> : <KieImage src={url} alt="" />}
                  {selecting ? <span className="rc-tile-check" aria-hidden="true">{on ? <Check /> : null}</span> : null}
                </button>
                {!selecting ? (
                  <div className="rc-tile-actions">
                    <Tip label="Descargar"><button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label="Descargar" onClick={() => void actions.download(url, job.taskId || job.id)}><Download /></button></Tip>
                    <Tip label="Usar como referencia"><button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label="Usar como referencia" onClick={() => actions.addReference(url)}><ImagePlus /></button></Tip>
                    <Tip label="Editar"><button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label="Editar" onClick={() => actions.editImage(url)}><Wand2 /></button></Tip>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {done.length ? <p className="rc-hint rc-gallery-note">La galería se guarda en tu cuenta, pero los archivos los guarda Kie solo {retentionDays} días. Descargá lo que quieras conservar.</p> : null}

      {selecting && selected.length ? (
        <div className="rc-selection-bar rc-layer" role="region" aria-label="Selección">
          <span>{selected.length} {selected.length === 1 ? 'seleccionada' : 'seleccionadas'}</span>
          <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" disabled={downloading} onClick={downloadSelected}><Download />{downloading ? 'Descargando…' : 'Descargar'}</button>
          <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => { removeWithUndo(done.filter(j => selected.includes(j.id))); stopSelecting(); }}>Quitar</button>
          <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={stopSelecting}>Cancelar</button>
        </div>
      ) : null}
    </div>
  );
}
