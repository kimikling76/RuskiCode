'use client';
import {localStore} from '@/lib/books/local-store';
import {VIDEO_PART_BYTES, videoMimes, type UploadedVideo, type VideoRef} from './video-refs';
import {isMP4} from './video-reference';

// Reference videos chosen from this computer. The file stays in this browser (IndexedDB) under `video:<sha256>`,
// which is what drafts and jobs keep. When a request is sent, the video goes to the studio in parts (see
// video-refs.ts); the server joins them for Kie and deletes them. A video chosen on another computer is not here:
// it has to be chosen again there.

/** `seconds` 0: this browser could not read the length. */
export type LocalVideo = {sha: string; name: string; mime: (typeof videoMimes)[number]; size: number; seconds: number; width: number; height: number; poster?: string};
type Stored = {meta: LocalVideo; blob: Blob};

export class VideoError extends Error {}

const key = (sha: string) => 'video:' + sha;
export const isLocalVideo = (ref: string) => /^video:[a-f0-9]{64}$/.test(ref);
const metas = new Map<string, LocalVideo>();

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (data: BufferSource) => hex(await crypto.subtle.digest('SHA-256', data));

/**
 * Length, size and a still of the video, read by the browser itself; null when this browser cannot open it (some
 * builds have no H.264, Firefox opens few MOV files). Kie still checks the video when it gets it.
 */
function inspect(file: Blob): Promise<{seconds: number; width: number; height: number; poster?: string} | null> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const timer = setTimeout(() => done(), 8000);
    const done = (value?: {seconds: number; width: number; height: number; poster?: string}) => { clearTimeout(timer); URL.revokeObjectURL(url); resolve(value ?? null); };
    video.onerror = () => done();
    video.onloadedmetadata = () => {
      const base = {seconds: Math.round(video.duration * 10) / 10, width: video.videoWidth, height: video.videoHeight};
      if (!Number.isFinite(base.seconds) || !base.width) { done(); return; }
      video.currentTime = Math.min(0.5, video.duration / 3);
      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          const scale = Math.min(1, 320 / Math.max(base.width, base.height));
          canvas.width = Math.round(base.width * scale); canvas.height = Math.round(base.height * scale);
          canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
          done({...base, poster: canvas.toDataURL('image/jpeg', 0.7)});
        } catch { done(base); }
      };
    };
    video.src = url;
  });
}

const secondsText = (s: number) => s.toLocaleString('es-AR', {maximumFractionDigits: 1}) + ' s';

/**
 * Keeps a video from this computer as a reference, after checking what the model's page allows: MP4 or MOV, the
 * size per file and the seconds per video. Returns the reference to keep (`video:<sha256>`).
 */
export async function addVideoFile(file: File, limits: {maxBytes: number; seconds?: readonly [number, number]}): Promise<LocalVideo> {
  const mime = file.type === 'video/quicktime' ? 'video/quicktime' : file.type === 'video/mp4' ? 'video/mp4' : null;
  if (!mime) throw new VideoError('Solo se pueden usar videos MP4 o MOV.');
  if (file.size > limits.maxBytes) throw new VideoError('«' + file.name + '» pesa ' + (file.size / 1_000_000).toLocaleString('es-AR', {maximumFractionDigits: 1}) + ' MB: este modelo acepta hasta ' + Math.floor(limits.maxBytes / 1_000_000) + ' MB por video.');
  const info = await inspect(file) ?? {seconds: 0, width: 0, height: 0};
  if (limits.seconds && info.seconds && (info.seconds < limits.seconds[0] || info.seconds > limits.seconds[1])) {
    throw new VideoError('«' + file.name + '» dura ' + secondsText(info.seconds) + ': este modelo acepta videos de ' + limits.seconds[0] + ' a ' + limits.seconds[1] + ' segundos.');
  }
  const buffer = await file.arrayBuffer();
  if (mime === 'video/mp4' && !isMP4(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 4096)))) throw new VideoError('«' + file.name + '» no es un MP4 válido. Si usás otro formato, exportalo a MP4 primero.');
  const sha = await sha256(buffer);
  const meta: LocalVideo = {sha, name: file.name.slice(0, 200), mime, size: file.size, ...info};
  await localStore.set(key(sha), {meta, blob: file} satisfies Stored);
  metas.set(sha, meta);
  return meta;
}

/** What is known of a reference video kept in this browser (undefined when it is not on this computer). */
export async function localVideo(ref: string): Promise<LocalVideo | undefined> {
  const sha = ref.slice(6);
  if (metas.has(sha)) return metas.get(sha);
  const stored = await localStore.get<Stored>(key(sha)).catch(() => undefined);
  if (stored) metas.set(sha, stored.meta);
  return stored?.meta;
}

/** Sends a kept video to the studio in parts (only the parts it does not have yet). */
async function sendParts(sha: string): Promise<UploadedVideo> {
  const stored = await localStore.get<Stored>(key(sha)).catch(() => undefined);
  if (!stored) throw new VideoError('VIDEO_NOT_HERE');
  const bytes = new Uint8Array(await stored.blob.arrayBuffer());
  const parts: {hash: string; bytes: Uint8Array}[] = [];
  for (let at = 0; at < bytes.length; at += VIDEO_PART_BYTES) {
    const part = bytes.slice(at, at + VIDEO_PART_BYTES);
    parts.push({hash: await sha256(part), bytes: part});
  }
  const r = await fetch('/api/sync/assets?missing=' + parts.map(p => p.hash).join(','));
  const missing = new Set<string>(r.ok ? (await r.json()).missing : parts.map(p => p.hash));
  for (const p of parts) {
    if (!missing.has(p.hash)) continue;
    const up = await fetch('/api/sync/assets', {method: 'POST', headers: {'Content-Type': 'application/octet-stream'}, body: p.bytes as BodyInit});
    if (!up.ok) throw new VideoError('UPLOAD_FAILED');
  }
  return {sha, mime: stored.meta.mime, size: bytes.length, parts: parts.map(p => p.hash)};
}

/** The videos as the request sends them: gallery links as they are, videos of this computer in parts. */
export function resolveVideos(refs: string[]): Promise<VideoRef[]> {
  // Gallery links and videos already stored in the studio (`asset:`) go as they are.
  return Promise.all(refs.map(ref => isLocalVideo(ref) ? sendParts(ref.slice(6)) : Promise.resolve(ref)));
}
