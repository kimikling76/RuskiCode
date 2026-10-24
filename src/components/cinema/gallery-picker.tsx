'use client';
import {useEffect, useMemo, useRef, useState, type DragEvent} from 'react';
import {Check, Loader2, Upload} from 'lucide-react';
import {useCinema, isDone} from '@/store/cinema';
import {Dialog} from '@/components/ui/dialog';
import {AttachError, attachFile, localPreview} from '@/lib/personal-chat/attach-browser';

/** Where a chosen picture is shown: a gallery result (its Kie link) or one uploaded to the studio (`asset:<sha256>`). */
export const refSrc = (ref: string) => ref.startsWith('asset:') ? localPreview(ref.slice(6)) || '/api/sync/assets?hash=' + ref.slice(6) : ref;

const acceptImages = 'image/png,image/jpeg,image/webp,image/gif,image/avif';

/**
 * Choose pictures for a request: results from the gallery (Kie-hosted) and, with `upload`, pictures from this computer.
 * An uploaded picture is scaled down in this browser and stored in the studio like a Chat attachment (`asset:<sha256>`);
 * it reaches Kie only when something is generated with it.
 */
export function GalleryPicker({open, onClose, max, onChoose, title, initial = [], upload}: {open: boolean; onClose: () => void; max: number; onChoose: (urls: string[]) => void; title: string; initial?: string[]; upload?: boolean}) {
  const all = useCinema(s => s.data.jobs);
  // Only pictures: a video cannot be a reference or a starting image.
  const jobs = useMemo(() => all.filter(j => isDone(j) && j.mode !== 'video'), [all]);
  const [picked, setPicked] = useState<string[]>(initial);
  // Pictures uploaded from this computer, newest first; the ones already chosen come back when the picker reopens.
  const [mine, setMine] = useState<string[]>([]);
  const [sending, setSending] = useState(0);
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    setPicked(initial);
    setMine(m => [...new Set([...initial.filter(r => r.startsWith('asset:')), ...m])]);
    setError('');
  }, [open]); // reset on every opening

  const choose = (list: string[], ref: string) => list.includes(ref) ? list : max === 1 ? [ref] : list.length >= max ? list : [...list, ref];
  function toggle(url: string) {
    setPicked(p => p.includes(url) ? p.filter(u => u !== url) : choose(p, url));
  }

  async function add(files: File[]) {
    setError('');
    const images = files.filter(f => f.type.startsWith('image/'));
    if (images.length < files.length) setError('Solo se pueden subir imágenes: PNG, JPEG, WebP, GIF o AVIF.');
    const room = max === 1 ? 1 : max - picked.length;
    if (room <= 0) { setError('Ya elegiste ' + max + '. Quitá una para sumar otra.'); return; }
    const take = images.slice(0, room);
    if (images.length > take.length) setError('Se suman ' + take.length + ' de ' + images.length + ': el límite de este modelo es ' + max + '.');
    for (const file of take) {
      setSending(n => n + 1);
      try {
        const {hash} = await attachFile(file);
        const ref = 'asset:' + hash;
        setMine(m => [ref, ...m.filter(x => x !== ref)]);
        setPicked(p => choose(p, ref));
      } catch (e) {
        setError(e instanceof AttachError ? e.message : 'No se pudo subir «' + file.name + '». Probá de nuevo.');
      } finally {
        setSending(n => n - 1);
      }
    }
  }
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); if (upload) void add([...e.dataTransfer.files]); };

  const tile = (ref: string, key: string, label: string, src: string) => {
    const on = picked.includes(ref);
    return (
      <button key={key} type="button" className="rc-picker-item" aria-pressed={on} onClick={() => toggle(ref)} aria-label={(on ? 'Quitar: ' : 'Elegir: ') + label}>
        <img src={src} alt="" loading="lazy" decoding="async" />
        {on ? <span className="rc-picker-check" aria-hidden="true"><Check /></span> : null}
      </button>
    );
  };

  return (
    <Dialog open={open} onClose={onClose} wide title={title} description={max === 1 ? 'Elegí una imagen.' : 'Elegí hasta ' + max + ' imágenes.'}>
      <div
        className="rc-picker-body"
        data-over={over || undefined}
        onDragOver={upload ? e => { e.preventDefault(); setOver(true); } : undefined}
        onDragLeave={upload ? () => setOver(false) : undefined}
        onDrop={upload ? drop : undefined}
      >
        {upload ? (
          <div className="rc-picker-upload">
            <button type="button" className="rc-btn rc-btn--secondary" disabled={sending > 0} onClick={() => input.current?.click()}>
              {sending ? <Loader2 className="rc-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
              {sending ? 'Subiendo…' : 'Subir desde tu computadora'}
            </button>
            <p className="rc-hint">O arrastrá imágenes acá. Se guardan en tu estudio y se envían a Kie solo cuando generás.</p>
            <input ref={input} type="file" accept={acceptImages} multiple={max > 1} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={e => { const files = [...(e.target.files || [])]; e.target.value = ''; void add(files); }} />
          </div>
        ) : null}
        {error ? <p className="rc-picker-error" role="alert">{error}</p> : null}
        {mine.length ? (
          <section aria-label="Subidas desde tu computadora">
            <h3 className="rc-picker-heading">Subidas desde tu computadora</h3>
            <div className="rc-picker-grid">{mine.map((ref, k) => tile(ref, ref, 'imagen subida ' + (mine.length - k), refSrc(ref)))}</div>
          </section>
        ) : null}
        {jobs.length ? (
          <section aria-label="Imágenes de la galería">
            {upload ? <h3 className="rc-picker-heading">De la galería</h3> : null}
            <div className="rc-picker-grid">{jobs.map(job => tile(job.urls[0], job.id, job.prompt.slice(0, 80), job.urls[0]))}</div>
          </section>
        ) : (
          <p className="rc-hint">{upload ? 'La galería está vacía: subí una imagen o generá una primero.' : 'La galería está vacía. Generá una imagen primero.'}</p>
        )}
      </div>
      <div className="rc-dialog-footer">
        <p className="rc-hint" aria-live="polite">{picked.length ? picked.length + (picked.length === 1 ? ' elegida' : ' elegidas') : ''}</p>
        <button type="button" className="rc-btn rc-btn--ghost" onClick={onClose}>Cancelar</button>
        <button type="button" className="rc-btn rc-btn--primary" disabled={sending > 0 || (!picked.length && !initial.length)} onClick={() => { onChoose(picked); onClose(); }}>Usar</button>
      </div>
    </Dialog>
  );
}
