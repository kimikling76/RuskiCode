import {z} from 'zod';
import {VIDEO_PART_BYTES} from './video-refs';

// Reference audio (music, a voice, what a person says). Like a video from this computer, the file is too big for one
// request to the studio, so the browser sends it in parts to the person's file store; the server joins them, checks
// the whole file against its SHA-256, gives it to Kie's file upload (a temporary link, 24 h) and deletes the parts.

/** Largest audio the studio passes on, whatever a model's page allows. */
export const MAX_AUDIO_BYTES = 50_000_000;
export const AUDIO_PART_BYTES = VIDEO_PART_BYTES;
export const audioMimes = ['audio/mpeg', 'audio/wav', 'audio/aac', 'audio/ogg', 'audio/mp4'] as const;
export type AudioMime = (typeof audioMimes)[number];
/** The file type a model page names, as the MIME type the studio sends. */
export const formatMime: Record<string, AudioMime> = {mp3: 'audio/mpeg', wav: 'audio/wav', aac: 'audio/aac', ogg: 'audio/ogg', m4a: 'audio/mp4'};
export const mimeFormat = (m: AudioMime) => Object.entries(formatMime).find(([, v]) => v === m)![0];

const hash = z.string().regex(/^[a-f0-9]{64}$/);
/** An audio from this computer, already sent in parts. */
export const uploadedAudioSchema = z.object({
  sha: hash,
  mime: z.enum(audioMimes),
  size: z.number().int().min(1).max(MAX_AUDIO_BYTES),
  seconds: z.number().min(0).max(3600).optional(),
  parts: z.array(hash).min(1).max(Math.ceil(MAX_AUDIO_BYTES / AUDIO_PART_BYTES)),
}).strict().refine(v => v.parts.length === Math.ceil(v.size / AUDIO_PART_BYTES), {message: 'parts do not match the size'});
export type UploadedAudio = z.infer<typeof uploadedAudioSchema>;

/** The limit for one model: its page's, when smaller than the studio's. */
export const audioLimitBytes = (maxMB?: number) => Math.min(MAX_AUDIO_BYTES, maxMB ? Math.floor(maxMB * 1_000_000) : MAX_AUDIO_BYTES);

type AudioRules = {maxAudios?: number; audioSeconds?: readonly [number, number]; audioTotalSeconds?: number; audioFormats?: readonly string[]; audioMaxMB?: number};

/** What is wrong with these audio files for a model ('' when they fit): count, type, size, seconds of each and of all. */
export function audioProblem(o: AudioRules, files: {mime: AudioMime; size: number; seconds?: number; name?: string}[]) {
  if (files.length > (o.maxAudios || 0)) return 'Este modelo toma hasta ' + (o.maxAudios || 0) + (o.maxAudios === 1 ? ' audio.' : ' audios.');
  for (const f of files) {
    const what = f.name ? '«' + f.name + '»' : 'Un audio';
    if (o.audioFormats?.length && !o.audioFormats.includes(mimeFormat(f.mime))) return what + ' es ' + mimeFormat(f.mime).toUpperCase() + ': este modelo acepta ' + o.audioFormats.map(x => x.toUpperCase()).join(', ') + '.';
    if (f.size > audioLimitBytes(o.audioMaxMB)) return what + ' pesa ' + (f.size / 1_000_000).toLocaleString('es-AR', {maximumFractionDigits: 1}) + ' MB: este modelo acepta hasta ' + Math.floor(audioLimitBytes(o.audioMaxMB) / 1_000_000) + ' MB.';
    if (f.seconds && o.audioSeconds && (f.seconds < o.audioSeconds[0] - 0.05 || f.seconds > o.audioSeconds[1] + 0.05)) {
      return what + ' dura ' + f.seconds.toLocaleString('es-AR', {maximumFractionDigits: 1}) + ' s: este modelo acepta ' + (o.audioSeconds[0] ? 'de ' + o.audioSeconds[0] + ' a ' + o.audioSeconds[1] + ' segundos' : 'hasta ' + o.audioSeconds[1] + ' segundos') + '.';
    }
  }
  const total = files.reduce((n, f) => n + (f.seconds || 0), 0);
  if (o.audioTotalSeconds && total > o.audioTotalSeconds + 0.05) return 'Los audios suman ' + total.toLocaleString('es-AR', {maximumFractionDigits: 1}) + ' s: este modelo acepta hasta ' + o.audioTotalSeconds + ' s entre todos.';
  return '';
}

/** The rules of a model's page, in one sentence for the picker. */
export function audioRules(o: AudioRules) {
  const bits = [
    o.audioFormats?.length ? o.audioFormats.map(x => x.toUpperCase()).join(', ') : 'MP3, WAV, AAC, OGG o M4A',
    'hasta ' + Math.floor(audioLimitBytes(o.audioMaxMB) / 1_000_000) + ' MB',
    o.audioSeconds ? (o.audioSeconds[0] ? 'de ' + o.audioSeconds[0] + ' a ' + o.audioSeconds[1] + ' s cada uno' : 'hasta ' + o.audioSeconds[1] + ' s') : '',
    o.audioTotalSeconds ? 'hasta ' + o.audioTotalSeconds + ' s entre todos' : '',
  ].filter(Boolean);
  return bits.join(' · ') + '.';
}

/** What the audio is for, in the author's words. */
export const audioRoleName: Record<NonNullable<import('@/lib/ai/models').MediaOptions['audioRole']>, {title: string; hint: string}> = {
  reference: {title: 'Audio de referencia', hint: 'Música, una voz o un sonido para que el video lo siga o lo imite.'},
  voice: {title: 'Voz de referencia', hint: 'El timbre de la voz del personaje: el video habla con esa voz.'},
  driving: {title: 'Audio que dice el personaje', hint: 'La persona de la imagen dice este audio: mueve los labios y el cuerpo con él.'},
  track: {title: 'Audio del video', hint: 'El video usa este audio como sonido.'},
};
