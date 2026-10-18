'use client';
import {useCinema, type CinemaJob} from '@/store/cinema';

// Kie deletes generated files after 14 days. A finished image is copied to the studio's own file store
// (/api/sync/assets, the same as the books' images), so it stays in the gallery and in the chat on every computer.
// The store takes files of up to 4 MB: a larger image is saved as a high-quality JPEG of the same size in pixels.
// Videos are not copied: they are usually larger than that (see docs/ETAPA_11).

const MAX = 4_000_000;
// Each job is tried once per visit: an expired Kie link is not asked for again on every change.
const tried = new Set<string>();

async function shrink(blob: Blob): Promise<Blob> {
  if (blob.size <= MAX) return blob;
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    for (const quality of [0.92, 0.85, 0.75]) {
      const out = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', quality));
      if (out && out.size <= MAX) return out;
    }
    throw Error('TOO_LARGE');
  } finally {
    bitmap.close();
  }
}

/** Copies the images of a finished job to the studio once. Failures leave the job as it was (Kie still has it). */
export async function keepResult(job: CinemaJob) {
  if (job.mode === 'video' || job.state !== 'success' || job.saved?.length || tried.has(job.id)) return;
  tried.add(job.id);
  try {
    const saved: {hash: string; mime: string}[] = [];
    for (const url of job.urls.slice(0, 4)) {
      const r = await fetch('/api/cinema/download?url=' + encodeURIComponent(url) + '&name=' + encodeURIComponent(job.taskId || job.id));
      if (!r.ok) return;
      const blob = await shrink(await r.blob());
      const mime = blob.type.split(';')[0];
      if (!/^image\/(png|jpeg|webp)$/.test(mime)) return;
      const up = await fetch('/api/sync/assets', {method: 'POST', headers: {'Content-Type': mime}, body: blob});
      if (!up.ok) return;
      const {hash} = await up.json() as {hash: string};
      saved.push({hash, mime});
    }
    if (saved.length) useCinema.getState().updateJob(job.id, {saved});
  } catch {
    // Kept on Kie; tried again next time the workspace opens.
  }
}

/** The studio's copy of the i-th image, when there is one. */
export const savedUrl = (job: CinemaJob, i = 0) => job.saved?.[i] ? '/api/sync/assets?hash=' + job.saved[i].hash : undefined;
