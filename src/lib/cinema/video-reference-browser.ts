'use client';
import {isMP4, MAX_VIDEO_BYTES} from './video-reference';

export type VideoLimits = {minSeconds: number; maxSeconds: number};

/** Read actual media metadata, without playing or sending it to Kie. */
export async function checkVideo(src: string, limits: VideoLimits) {
  const duration = await new Promise<number>((resolve, reject) => {
    const video = document.createElement('video');
    const timer = setTimeout(() => finish(new Error('No pude leer el video. Probá con otro archivo MP4.')), 15000);
    function finish(error?: Error) {
      clearTimeout(timer);
      video.onloadedmetadata = null;
      video.onerror = null;
      const seconds = video.duration;
      video.removeAttribute('src');
      video.load();
      if (error) reject(error); else resolve(seconds);
    }
    video.preload = 'metadata';
    video.onloadedmetadata = () => finish();
    video.onerror = () => finish(new Error('No pude leer el video. El archivo puede haber vencido o no ser compatible.'));
    video.src = src;
  });
  if (!Number.isFinite(duration) || duration < limits.minSeconds || duration > limits.maxSeconds) {
    throw new Error('Este modelo acepta videos de ' + limits.minSeconds + ' a ' + limits.maxSeconds + ' segundos. Recortá el clip e intentá de nuevo.');
  }
}

/** Stores the original MP4 in the existing private asset store. Kie receives it only on Generate. */
export async function attachVideo(file: File, limits: VideoLimits) {
  if (!file.size || file.size > MAX_VIDEO_BYTES) throw new Error('El límite de subida del estudio es 4 MB por video. Comprimilo o recortalo antes de subirlo.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isMP4(bytes)) throw new Error('Elegí un archivo MP4. Si usás otro formato, exportalo a MP4 primero.');
  const src = URL.createObjectURL(new Blob([bytes], {type: 'video/mp4'}));
  try { await checkVideo(src, limits); } finally { URL.revokeObjectURL(src); }
  const response = await fetch('/api/sync/assets', {method: 'POST', headers: {'Content-Type': 'video/mp4'}, body: bytes});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) throw new Error('Tu sesión venció. Volvé a iniciar sesión para subir el video.');
    if (response.status === 413) throw new Error('El límite de subida del estudio es 4 MB por video.');
    if (response.status === 429) throw new Error('Hay muchas subidas seguidas. Esperá un momento y volvé a intentar.');
    throw new Error('No pude guardar el video. Probá de nuevo en un momento.');
  }
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
  if (data.hash !== hash) throw new Error('No pude verificar la subida del video. Probá de nuevo.');
  return 'asset:' + hash;
}
