'use client';
import {localStore} from '@/lib/books/local-store';
import {AUDIO_PART_BYTES, audioMimes, formatMime, type AudioMime, type UploadedAudio} from './audio-refs';

// Reference audio chosen from this computer. The file stays in this browser (IndexedDB) under `audio:<sha256>`, which
// is what drafts and jobs keep. When a request is sent, it goes to the studio in parts (see audio-refs.ts); the server
// joins them for Kie and deletes them. An audio chosen on another computer is not here: it has to be chosen again.

/** `seconds` 0: this browser could not read the length. */
export type LocalAudio = {sha: string; name: string; mime: AudioMime; size: number; seconds: number};
type Stored = {meta: LocalAudio; blob: Blob};

export class AudioError extends Error {}

const key = (sha: string) => 'audio:' + sha;
export const isLocalAudio = (ref: string) => /^audio:[a-f0-9]{64}$/.test(ref);
const metas = new Map<string, LocalAudio>();

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (data: BufferSource) => hex(await crypto.subtle.digest('SHA-256', data));

/** The type of an audio file, from what the browser says or, failing that, its name («voz.mp3»). */
export function audioMimeOf(file: Pick<File, 'type' | 'name'>): AudioMime | null {
  const t = file.type.toLowerCase();
  const byType: Record<string, AudioMime> = {'audio/mpeg': 'audio/mpeg', 'audio/mp3': 'audio/mpeg', 'audio/wav': 'audio/wav', 'audio/x-wav': 'audio/wav', 'audio/wave': 'audio/wav', 'audio/vnd.wave': 'audio/wav', 'audio/aac': 'audio/aac', 'audio/x-aac': 'audio/aac', 'audio/ogg': 'audio/ogg', 'audio/mp4': 'audio/mp4', 'audio/x-m4a': 'audio/mp4', 'audio/m4a': 'audio/mp4'};
  if (byType[t]) return byType[t];
  const ext = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';
  return formatMime[ext] || null;
}

/** The length of an audio, read by this browser; 0 when it cannot open it. */
function lengthOf(file: Blob): Promise<number> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    const timer = setTimeout(() => done(0), 8000);
    const done = (s: number) => { clearTimeout(timer); URL.revokeObjectURL(url); resolve(s); };
    audio.onerror = () => done(0);
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? Math.round(audio.duration * 10) / 10 : 0);
    audio.src = url;
  });
}

/** Keeps an audio from this computer as a reference. The model's rules are checked by the caller (audioProblem). */
export async function addAudioFile(file: File): Promise<LocalAudio> {
  const mime = audioMimeOf(file);
  if (!mime || !(audioMimes as readonly string[]).includes(mime)) throw new AudioError('«' + file.name + '» no es un audio MP3, WAV, AAC, OGG o M4A.');
  const buffer = await file.arrayBuffer();
  const sha = await sha256(buffer);
  const meta: LocalAudio = {sha, name: file.name.slice(0, 200), mime, size: file.size, seconds: await lengthOf(file)};
  await localStore.set(key(sha), {meta, blob: file} satisfies Stored);
  metas.set(sha, meta);
  return meta;
}

/** What is known of an audio kept in this browser (undefined when it is not on this computer). */
export async function localAudio(ref: string): Promise<LocalAudio | undefined> {
  const sha = ref.slice(6);
  if (metas.has(sha)) return metas.get(sha);
  const stored = await localStore.get<Stored>(key(sha)).catch(() => undefined);
  if (stored) metas.set(sha, stored.meta);
  return stored?.meta;
}

/** A blob URL to listen to a kept audio; null when it is not on this computer. */
export async function audioUrl(ref: string) {
  const stored = await localStore.get<Stored>(key(ref.slice(6))).catch(() => undefined);
  return stored ? URL.createObjectURL(stored.blob) : null;
}

/** Sends a kept audio to the studio in parts (only the parts it does not have yet). */
async function sendParts(sha: string): Promise<UploadedAudio> {
  const stored = await localStore.get<Stored>(key(sha)).catch(() => undefined);
  if (!stored) throw new AudioError('AUDIO_NOT_HERE');
  const bytes = new Uint8Array(await stored.blob.arrayBuffer());
  const parts: {hash: string; bytes: Uint8Array}[] = [];
  for (let at = 0; at < bytes.length; at += AUDIO_PART_BYTES) {
    const part = bytes.slice(at, at + AUDIO_PART_BYTES);
    parts.push({hash: await sha256(part), bytes: part});
  }
  const r = await fetch('/api/sync/assets?missing=' + parts.map(p => p.hash).join(','));
  const missing = new Set<string>(r.ok ? (await r.json()).missing : parts.map(p => p.hash));
  for (const p of parts) {
    if (!missing.has(p.hash)) continue;
    const up = await fetch('/api/sync/assets', {method: 'POST', headers: {'Content-Type': 'application/octet-stream'}, body: p.bytes as BodyInit});
    if (!up.ok) throw new AudioError('UPLOAD_FAILED');
  }
  return {sha, mime: stored.meta.mime, size: bytes.length, ...(stored.meta.seconds ? {seconds: stored.meta.seconds} : {}), parts: parts.map(p => p.hash)};
}

/** The audio files as the request sends them, each in parts. */
export const resolveAudios = (refs: string[]) => Promise.all(refs.filter(isLocalAudio).map(ref => sendParts(ref.slice(6))));
