'use client';
import {useEffect, useMemo, useRef, useState, type DragEvent} from 'react';
import {Check, Film, Loader2, Upload} from 'lucide-react';
import {useCinema, isDone} from '@/store/cinema';
import {Dialog} from '@/components/ui/dialog';
import {addVideoFile, isLocalVideo, localVideo, VideoError, type LocalVideo} from '@/lib/cinema/video-local';
import {clipProblem, defaultClip, videoLimitBytes, type Clip} from '@/lib/cinema/video-refs';
import type {MediaOptions} from '@/lib/ai/models';

const acceptVideos = 'video/mp4,video/quicktime,.mp4,.mov';
const seconds = (s: number) => s.toLocaleString('es-AR', {maximumFractionDigits: 1}) + ' s';

/** A reference video: its still (a video of this computer) or the video itself, muted (a gallery result). */
export function VideoThumb({value, className}: {value: string; className?: string}) {
  const [meta, setMeta] = useState<LocalVideo | null | undefined>(undefined);
  useEffect(() => { if (isLocalVideo(value)) void localVideo(value).then(m => setMeta(m ?? null)); }, [value]);
  if (!isLocalVideo(value)) return <video className={className} src={value} muted playsInline preload="metadata" aria-hidden="true" />;
  if (meta?.poster) return <img className={className} src={meta.poster} alt="" />;
  return <span className={(className || '') + ' rc-video-thumb-empty'} aria-hidden="true"><Film /></span>;
}

/**
 * A note when the chosen videos do not fit the model (after changing models): a file too big, or more seconds
 * than it takes. Only videos of this computer are measured; Kie checks the rest. Empty when they fit.
 */
export function useVideoFit(refs: string[], o?: Pick<MediaOptions, 'videoMaxMB' | 'videoSeconds' | 'videoTotalSeconds'>) {
  const [metas, setMetas] = useState<Record<string, LocalVideo>>({});
  const key = refs.join('|');
  useEffect(() => { for (const r of refs.filter(isLocalVideo)) void localVideo(r).then(m => { if (m) setMetas(x => x[r] ? x : {...x, [r]: m}); }); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!o) return '';
  const list = refs.map((r, i) => ({i, m: metas[r]})).filter(x => x.m);
  const big = list.find(x => x.m!.size > videoLimitBytes(o.videoMaxMB));
  if (big) return 'El video ' + (big.i + 1) + ' pesa ' + (big.m!.size / 1_000_000).toLocaleString('es-AR', {maximumFractionDigits: 1}) + ' MB: este modelo acepta hasta ' + Math.floor(videoLimitBytes(o.videoMaxMB) / 1_000_000) + ' MB. Quitalo o elegí otro.';
  const off = o.videoSeconds && list.find(x => x.m!.seconds && (x.m!.seconds < o.videoSeconds![0] || x.m!.seconds > o.videoSeconds![1]));
  if (off) return 'El video ' + (off.i + 1) + ' dura ' + seconds(off.m!.seconds) + ': este modelo acepta de ' + o.videoSeconds![0] + ' a ' + o.videoSeconds![1] + ' s.';
  const total = list.reduce((n, x) => n + x.m!.seconds, 0);
  if (o.videoTotalSeconds && total > o.videoTotalSeconds) return 'Los videos suman ' + seconds(total) + ': este modelo acepta hasta ' + o.videoTotalSeconds + ' s entre todos.';
  return '';
}

/** What the model's page asks of reference videos, in a sentence. */
export function videoRules(o: Pick<MediaOptions, 'maxVideos' | 'videoMaxMB' | 'videoSeconds' | 'videoTotalSeconds' | 'maxMedia' | 'videoClipSeconds' | 'videoSlots'>) {
  const n = (v: number) => v.toLocaleString('es-AR');
  return [
    'MP4 o MOV',
    'hasta ' + Math.floor(videoLimitBytes(o.videoMaxMB) / 1_000_000) + ' MB cada uno',
    o.videoSeconds ? (o.videoSeconds[0] < 1 ? 'de hasta ' + n(o.videoSeconds[1]) + ' s' : 'de ' + n(o.videoSeconds[0]) + ' a ' + n(o.videoSeconds[1]) + ' s') + ' cada uno' : '',
    o.videoTotalSeconds ? 'hasta ' + n(o.videoTotalSeconds) + ' s entre todos' : '',
    o.videoClipSeconds ? 'se usa un tramo de hasta ' + n(o.videoClipSeconds) + ' s, que elegís' : '',
    o.maxMedia ? (o.videoSlots && o.videoSlots > 1 ? 'cada video cuenta como ' + o.videoSlots + ' imágenes, hasta ' + o.maxMedia + ' en total' : 'hasta ' + o.maxMedia + ' entre imágenes y videos') : '',
  ].filter(Boolean).join(', ') + '.';
}

/**
 * Choose reference videos: from this computer (kept in this browser, sent in parts when generating) or from the
 * gallery's finished videos (their Kie link). In the prompt they are @video1, @video2… in the order chosen.
 */
export function VideoPicker({open, onClose, options, initial = [], onChoose, max}: {open: boolean; onClose: () => void; options: MediaOptions; initial?: string[]; onChoose: (refs: string[]) => void; max: number}) {
  const all = useCinema(s => s.data.jobs);
  const gallery = useMemo(() => all.filter(j => isDone(j) && j.mode === 'video' && j.urls[0]), [all]);
  const [picked, setPicked] = useState<string[]>(initial);
  const [mine, setMine] = useState<string[]>([]);
  const [metas, setMetas] = useState<Record<string, LocalVideo>>({});
  const [reading, setReading] = useState(0);
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    setPicked(initial);
    setMine(m => [...new Set([...initial.filter(isLocalVideo), ...m])]);
    setError('');
    for (const ref of initial.filter(isLocalVideo)) void localVideo(ref).then(meta => { if (meta) setMetas(x => ({...x, [ref]: meta})); });
  }, [open]); // reset on every opening

  const choose = (list: string[], ref: string) => list.includes(ref) ? list : max === 1 ? [ref] : list.length >= max ? list : [...list, ref];
  const toggle = (ref: string) => setPicked(p => p.includes(ref) ? p.filter(x => x !== ref) : choose(p, ref));
  const total = picked.reduce((n, r) => n + (metas[r]?.seconds || 0), 0);
  const tooLong = Boolean(options.videoTotalSeconds && total > options.videoTotalSeconds);

  async function add(files: File[]) {
    setError('');
    const room = max === 1 ? 1 : max - picked.length;
    if (room <= 0) { setError('Ya elegiste ' + max + '. Quitá uno para sumar otro.'); return; }
    const take = files.slice(0, room);
    if (files.length > take.length) setError('Se suman ' + take.length + ' de ' + files.length + ': este modelo acepta hasta ' + max + '.');
    for (const file of take) {
      setReading(n => n + 1);
      try {
        const meta = await addVideoFile(file, {maxBytes: videoLimitBytes(options.videoMaxMB), seconds: options.videoSeconds});
        const ref = 'video:' + meta.sha;
        setMetas(x => ({...x, [ref]: meta}));
        setMine(m => [ref, ...m.filter(x => x !== ref)]);
        setPicked(p => choose(p, ref));
      } catch (e) {
        setError(e instanceof VideoError ? e.message : 'No se pudo leer «' + file.name + '».');
      } finally { setReading(n => n - 1); }
    }
  }
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); void add([...e.dataTransfer.files]); };

  const tile = (ref: string, label: string, detail: string) => {
    const on = picked.includes(ref);
    const n = picked.indexOf(ref) + 1;
    return (
      <button key={ref} type="button" className="rc-picker-item rc-picker-video" aria-pressed={on} onClick={() => toggle(ref)} aria-label={(on ? 'Quitar: ' : 'Elegir: ') + label}>
        <VideoThumb value={ref} />
        <span className="rc-picker-video-info">{detail}</span>
        {on ? <span className="rc-picker-check" aria-hidden="true">{max > 1 ? <span className="rc-picker-order">@video{n}</span> : <Check />}</span> : null}
      </button>
    );
  };

  return (
    <Dialog open={open} onClose={onClose} wide title="Videos de referencia" description={(max === 1 ? 'Elegí un video. ' : 'Elegí hasta ' + max + ' videos. ') + 'Este modelo acepta ' + videoRules(options)}>
      <div className="rc-picker-body" data-over={over || undefined} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
        <div className="rc-picker-upload">
          <button type="button" className="rc-btn rc-btn--secondary" disabled={reading > 0} onClick={() => input.current?.click()}>
            {reading ? <Loader2 className="rc-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
            {reading ? 'Leyendo el video…' : 'Subir video desde tu computadora'}
          </button>
          <p className="rc-hint">O arrastrá videos acá. Quedan en este navegador y se envían a Kie solo cuando generás.</p>
          <input ref={input} type="file" accept={acceptVideos} multiple={max > 1} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={e => { const files = [...(e.target.files || [])]; e.target.value = ''; void add(files); }} />
        </div>
        {error ? <p className="rc-picker-error" role="alert">{error}</p> : null}
        {tooLong ? <p className="rc-picker-error" role="alert">Entre todos suman {seconds(total)}: este modelo acepta hasta {options.videoTotalSeconds} s.</p> : null}
        {mine.length ? (
          <section aria-label="Videos de tu computadora">
            <h3 className="rc-picker-heading">De tu computadora</h3>
            <div className="rc-picker-grid">{mine.map(ref => { const m = metas[ref]; return tile(ref, m?.name || 'video', m ? (m.seconds ? seconds(m.seconds) : 'duración no leída') + ' · ' + (m.size / 1_000_000).toLocaleString('es-AR', {maximumFractionDigits: 1}) + ' MB' : ''); })}</div>
          </section>
        ) : null}
        {gallery.length ? (
          <section aria-label="Videos de la galería">
            <h3 className="rc-picker-heading">De la galería</h3>
            <div className="rc-picker-grid">{gallery.map(job => tile(job.urls[0], job.prompt.slice(0, 80), job.prompt.slice(0, 40)))}</div>
          </section>
        ) : <p className="rc-hint">Tus videos generados aparecen acá; los de Kie se pueden usar durante 14 días.</p>}
      </div>
      <div className="rc-dialog-footer">
        <p className="rc-hint" aria-live="polite">{picked.length ? picked.length + (picked.length === 1 ? ' elegido' : ' elegidos') : ''}</p>
        <button type="button" className="rc-btn rc-btn--ghost" onClick={onClose}>Cancelar</button>
        <button type="button" className="rc-btn rc-btn--primary" disabled={reading > 0 || tooLong || (!picked.length && !initial.length)} onClick={() => { onChoose(picked); onClose(); }}>Usar</button>
      </div>
    </Dialog>
  );
}

/**
 * The part of each video to use, for a model that takes clips (Gemini Omni: up to 10 s of a video of up to 30 s).
 * `stored` is what the author set, by video; the rest start at the beginning. `problem` blocks generating.
 */
export function useClips(refs: string[], stored: Record<string, Clip> | undefined, o?: Pick<MediaOptions, 'fields' | 'videoClipSeconds' | 'videoSeconds'>) {
  const [lengths, setLengths] = useState<Record<string, number>>({});
  const key = refs.join('|');
  useEffect(() => { for (const r of refs.filter(isLocalVideo)) void localVideo(r).then(m => { if (m?.seconds) setLengths(x => x[r] ? x : {...x, [r]: m.seconds}); }); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!o?.fields.videoClips) return {clips: [] as Clip[], problem: '', lengths};
  const clips = refs.map(r => stored?.[r] ?? defaultClip(o, lengths[r]));
  const at = clips.findIndex((c, i) => clipProblem(c, o, lengths[refs[i]]));
  return {clips, problem: at < 0 ? '' : '@video' + (at + 1) + ': ' + clipProblem(clips[at], o, lengths[refs[at]]), lengths};
}

/** «Tramo de @video1: desde … hasta … s», for each video of a model that takes clips. */
export function ClipFields({refs, clips, onChange, o, lengths}: {refs: string[]; clips: Clip[]; onChange: (ref: string, clip: Clip) => void; o: Pick<MediaOptions, 'videoClipSeconds'>; lengths: Record<string, number>}) {
  return (
    <div className="rc-clip-fields">
      {refs.map((ref, i) => {
        const c = clips[i];
        const set = (k: 'start' | 'ends', v: string) => { const n = Math.max(0, Math.round(Number(v.replace(',', '.')) * 10) / 10); if (Number.isFinite(n)) onChange(ref, {...c, [k]: n}); };
        return (
          <fieldset key={ref} className="rc-clip-field">
            <legend>Tramo de @video{i + 1}{lengths[ref] ? ' (el video dura ' + seconds(lengths[ref]) + ')' : ''}</legend>
            <label>Desde <input className="rc-input" type="number" inputMode="decimal" min={0} step={0.5} value={c.start} onChange={e => set('start', e.target.value)} aria-label={'Comienzo del tramo de @video' + (i + 1) + ', en segundos'} /> s</label>
            <label>hasta <input className="rc-input" type="number" inputMode="decimal" min={0} step={0.5} value={c.ends} onChange={e => set('ends', e.target.value)} aria-label={'Final del tramo de @video' + (i + 1) + ', en segundos'} /> s</label>
            {o.videoClipSeconds ? <span className="rc-hint">hasta {o.videoClipSeconds} s de video</span> : null}
          </fieldset>
        );
      })}
    </div>
  );
}
