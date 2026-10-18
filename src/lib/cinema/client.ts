'use client';
import {toast} from 'sonner';
import {useCinema, type CinemaJob, type JobMode} from '@/store/cinema';
import type {AspectRatio, Resolution} from './capabilities';

export type GenerationRequest = {
  mode: JobMode;
  model?: string;
  duration?: string;
  prompt: string;
  aspect: AspectRatio;
  resolution: Resolution;
  references: string[];
  count: number;
  source?: string;
  boardId?: string;
  shotId?: string;
  /** Given by the caller to find these jobs later (a chat skill card); a new one otherwise. */
  batchId?: string;
  /** The caller's name for what these jobs are for (a picture slot of /pdf-generator). */
  tag?: string;
};

/**
 * Adds one card per variant immediately ("Enviando"), then asks the server to create the Kie tasks.
 * Cards only change state with real answers from the server or from Kie.
 */
export async function startGeneration(request: GenerationRequest) {
  const {addJobs, updateJob} = useCinema.getState();
  const batchId = request.batchId || crypto.randomUUID();
  const now = Date.now();
  const jobs: CinemaJob[] = Array.from({length: request.count}, () => ({
    id: crypto.randomUUID(),
    batchId,
    mode: request.mode,
    prompt: request.prompt,
    aspect: request.aspect,
    resolution: request.resolution,
    references: request.references,
    model: request.model,
    duration: request.duration,
    source: request.source,
    boardId: request.boardId,
    shotId: request.shotId,
    ...(request.tag ? {tag: request.tag} : {}),
    state: 'sending',
    urls: [],
    createdAt: now,
  }));
  addJobs(jobs);
  // One id per request. If the connection drops, the same id is sent again: the server answers with the
  // tasks it already created instead of creating (and charging) new ones.
  const body = JSON.stringify({
    requestId: crypto.randomUUID(),
    mode: request.mode,
    model: request.model || 'nano-banana-2-1',
    prompt: request.prompt,
    ...(request.aspect ? {aspect: request.aspect} : {}),
    ...(request.resolution ? {resolution: request.resolution} : {}),
    ...(request.duration ? {duration: request.duration} : {}),
    references: request.references,
    count: request.count,
  });
  const send = () => fetch('/api/cinema/images', {method: 'POST', headers: {'Content-Type': 'application/json'}, body});
  try {
    let r: Response;
    try { r = await send(); } catch { await new Promise(res => setTimeout(res, 1500)); r = await send(); }
    const body = await r.json().catch(() => ({}));
    const tasks: string[] = Array.isArray(body.tasks) ? body.tasks : [];
    jobs.forEach((job, i) => {
      if (tasks[i]) updateJob(job.id, {taskId: tasks[i], state: 'waiting'});
      else updateJob(job.id, {state: 'error', error: typeof body.error === 'string' ? body.error : 'PROVIDER_UNAVAILABLE', finishedAt: Date.now()});
    });
  } catch {
    jobs.forEach(job => updateJob(job.id, {state: 'error', error: 'NETWORK', finishedAt: Date.now()}));
  }
  return batchId;
}

/** Runs the same request again as a new task and drops the failed card. */
export function retryJob(job: CinemaJob) {
  useCinema.getState().removeJobs([job.id]);
  return startGeneration({
    mode: job.mode, model: job.model, duration: job.duration, prompt: job.prompt, aspect: job.aspect, resolution: job.resolution,
    references: job.references, count: 1, source: job.source, boardId: job.boardId, shotId: job.shotId,
    // A picture of /pdf-generator stays in its card's batch, in the same slot.
    ...(job.tag ? {tag: job.tag, batchId: job.batchId} : {}),
  });
}

export {textRequest} from '@/lib/ai/text-request';

/** Saves an image through the server so it gets a real file name; falls back to opening it. */
export async function downloadImage(url: string, name: string) {
  const r = await fetch('/api/cinema/download?url=' + encodeURIComponent(url) + '&name=' + encodeURIComponent(name));
  if (!r.ok) throw Error('DOWNLOAD_FAILED');
  const blob = await r.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = (r.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1]) || 'russian-code-' + name + '.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
}

/** Removes cards from this browser's gallery (Kie keeps its copy until it expires), with a short undo. */
export function removeWithUndo(jobs: CinemaJob[]) {
  if (!jobs.length) return;
  const {removeJobs, addJobs} = useCinema.getState();
  removeJobs(jobs.map(j => j.id));
  toast(jobs.length === 1 ? 'Quitada de la galería' : jobs.length + ' imágenes quitadas de la galería', {
    duration: 8000,
    action: {label: 'Deshacer', onClick: () => addJobs(jobs)},
  });
}
