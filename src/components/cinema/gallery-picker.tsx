'use client';
import {useEffect, useMemo, useState} from 'react';
import {Check} from 'lucide-react';
import {useCinema, isDone} from '@/store/cinema';
import {Dialog} from '@/components/ui/dialog';

/** Choose images that already live in the gallery (Kie-hosted, so Kie can read them as references). */
export function GalleryPicker({open, onClose, max, onChoose, title, initial = []}: {open: boolean; onClose: () => void; max: number; onChoose: (urls: string[]) => void; title: string; initial?: string[]}) {
  const all = useCinema(s => s.data.jobs);
  const jobs = useMemo(() => all.filter(isDone), [all]);
  const [picked, setPicked] = useState<string[]>(initial);
  useEffect(() => { if (open) setPicked(initial); }, [open]); // reset on every opening

  function toggle(url: string) {
    setPicked(p => p.includes(url) ? p.filter(u => u !== url) : max === 1 ? [url] : p.length >= max ? p : [...p, url]);
  }

  return (
    <Dialog open={open} onClose={onClose} wide title={title} description={jobs.length ? (max === 1 ? 'Elegí una imagen.' : 'Elegí hasta ' + max + ' imágenes.') : undefined}>
      {jobs.length ? (
        <div className="rc-picker-grid" role="group" aria-label="Imágenes de la galería">
          {jobs.map(job => {
            const url = job.urls[0];
            const on = picked.includes(url);
            return (
              <button key={job.id} type="button" className="rc-picker-item" aria-pressed={on} onClick={() => toggle(url)} aria-label={(on ? 'Quitar: ' : 'Elegir: ') + job.prompt.slice(0, 80)}>
                <img src={url} alt="" loading="lazy" decoding="async" />
                {on ? <span className="rc-picker-check" aria-hidden="true"><Check /></span> : null}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="rc-hint">La galería está vacía. Generá una imagen primero.</p>
      )}
      <div className="rc-dialog-footer">
        <p className="rc-hint">{picked.length ? picked.length + (picked.length === 1 ? ' elegida' : ' elegidas') : ''}</p>
        <button type="button" className="rc-btn rc-btn--ghost" onClick={onClose}>Cancelar</button>
        <button type="button" className="rc-btn rc-btn--primary" disabled={!picked.length && !initial.length} onClick={() => { onChoose(picked); onClose(); }}>Usar</button>
      </div>
    </Dialog>
  );
}
