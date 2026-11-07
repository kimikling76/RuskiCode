'use client';
import {useEffect, useState} from 'react';
import {toast} from 'sonner';
import {Music, Plus, X} from 'lucide-react';
import {Dialog} from '@/components/ui/dialog';
import type {MediaOptions} from '@/lib/ai/models';
import {addAudioFile, audioUrl, AudioError, localAudio, type LocalAudio} from '@/lib/cinema/audio-local';
import {audioProblem, audioRoleName, audioRules, formatMime} from '@/lib/cinema/audio-refs';
import {authorAudioName} from '@/lib/cinema/mentions';

// Reference audio for the video models that take it: music, a voice, what a person in the image says. The files come
// from this computer and stay in this browser until a request sends them (see cinema/audio-local).

const seconds = (s: number) => s ? s.toLocaleString('es-AR', {maximumFractionDigits: 1}) + ' s' : 'largo desconocido';

/** What is known of the chosen audio files (kept in this browser), in order. */
export function useAudios(refs: string[]) {
  const [list, setList] = useState<LocalAudio[]>([]);
  const key = refs.join(',');
  useEffect(() => {
    let alive = true;
    Promise.all(refs.map(r => localAudio(r))).then(all => { if (alive) setList(all.filter((a): a is LocalAudio => Boolean(a))); });
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return list;
}

/** Why these audio files cannot go to this model ('' when they can), counting what has to go with them. */
export function audioNeed(o: MediaOptions | undefined, audios: LocalAudio[], images: number, videos: number) {
  if (!o?.fields.audios) return '';
  if (o.audiosRequired && !audios.length) return audioRoleName.driving.hint + ' Elegí el audio con el botón de la nota musical.';
  if (o.audioNeedsMedia && audios.length && !images && !videos) return 'Este modelo no usa el audio solo: agregá también una imagen o un video de referencia.';
  return audioProblem(o, audios);
}

/** The button that opens the picker, with how many are chosen. */
export function AudioButton({o, count, onClick, className = 'rc-icon-btn'}: {o: MediaOptions; count: number; onClick: () => void; className?: string}) {
  const role = audioRoleName[o.audioRole || 'reference'];
  return (
    <button type="button" className={className} aria-label={role.title + ': elegir de tu computadora'} title={role.title + ' (' + audioRules(o) + ')'} onClick={onClick}>
      <Music />{count ? <span className="rc-gen-count" aria-hidden="true">{count}</span> : null}
    </button>
  );
}

/** The chosen audio files above the prompt, with their name in it («@audio1») and a way to take each out. */
export function AudioChips({audios, onRemove}: {audios: LocalAudio[]; onRemove: (sha: string) => void}) {
  if (!audios.length) return null;
  return (
    <div className="rc-gen-refs rc-audio-chips" role="group" aria-label="Audios de referencia">
      {audios.map((a, i) => (
        <span key={a.sha} className="rc-audio-chip">
          <Music aria-hidden="true" />
          <span className="rc-audio-chip-text"><strong>{authorAudioName(i + 1)}</strong> {a.name} · {seconds(a.seconds)}</span>
          <button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label={'Quitar el audio ' + (i + 1)} onClick={() => onRemove(a.sha)}><X /></button>
        </span>
      ))}
    </div>
  );
}

function Listen({sha}: {sha: string}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let made: string | null = null, alive = true;
    audioUrl('audio:' + sha).then(u => { made = u; if (alive) setUrl(u); else if (u) URL.revokeObjectURL(u); });
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [sha]);
  return url ? <audio className="rc-audio-player" controls preload="metadata" src={url} /> : null;
}

/** Choose the audio files for this model, from this computer, checked against its page's rules as they are added. */
export function AudioPicker({open, onClose, o, initial, onChoose}: {open: boolean; onClose: () => void; o: MediaOptions; initial: string[]; onChoose: (refs: string[]) => void}) {
  const [list, setList] = useState<LocalAudio[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    Promise.all(initial.map(r => localAudio(r))).then(all => setList(all.filter((a): a is LocalAudio => Boolean(a))));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const max = o.maxAudios || 1;
  const role = audioRoleName[o.audioRole || 'reference'];
  const accept = (o.audioFormats?.length ? o.audioFormats : Object.keys(formatMime)).flatMap(x => ['.' + x, formatMime[x]]).join(',');

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    let next = [...list];
    try {
      for (const file of [...files]) {
        if (next.length >= max) { toast('Este modelo toma hasta ' + max + (max === 1 ? ' audio.' : ' audios.')); break; }
        try {
          const a = await addAudioFile(file);
          const problem = audioProblem(o, [...next.filter(x => x.sha !== a.sha), a]);
          if (problem) { toast(problem, {duration: 8000}); continue; }
          if (!next.some(x => x.sha === a.sha)) next = max === 1 ? [a] : [...next, a];
        } catch (e) { toast(e instanceof AudioError ? e.message : 'No se pudo leer «' + file.name + '».'); }
      }
      setList(next);
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} title={role.title} description={role.hint + ' ' + audioRules(o)}>
      <div className="rc-dialog-body rc-audio-picker">
        {list.length ? (
          <ol className="rc-audio-list">
            {list.map((a, i) => (
              <li key={a.sha}>
                <div className="rc-audio-row">
                  <span><strong>{authorAudioName(i + 1)}</strong> · {a.name} · {seconds(a.seconds)} · {(a.size / 1_000_000).toLocaleString('es-AR', {maximumFractionDigits: 1})} MB</span>
                  <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => setList(l => l.filter(x => x.sha !== a.sha))}>Quitar</button>
                </div>
                <Listen sha={a.sha} />
              </li>
            ))}
          </ol>
        ) : <p className="rc-hint">Todavía no elegiste ningún audio.</p>}
        {list.length < max ? (
          <label className="rc-btn rc-btn--secondary rc-btn--sm" aria-disabled={busy}>
            <Plus aria-hidden="true" />{busy ? 'Leyendo…' : max === 1 ? 'Elegir un audio de tu computadora' : 'Agregar audios de tu computadora'}
            <input type="file" accept={accept} multiple={max > 1} className="sr-only" disabled={busy} onChange={e => { const f = e.target.files; void add(f).finally(() => { e.target.value = ''; }); }} />
          </label>
        ) : null}
        {max > 1 ? <p className="rc-hint">En el texto se llaman @audio1, @audio2… en este orden.</p> : <p className="rc-hint">En el texto se llama @audio1.</p>}
        <div className="rc-dialog-footer rc-dialog-footer--end">
          <button type="button" className="rc-btn rc-btn--ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="rc-btn rc-btn--primary" onClick={() => { onChoose(list.map(a => 'audio:' + a.sha)); onClose(); }}>Listo</button>
        </div>
      </div>
    </Dialog>
  );
}
