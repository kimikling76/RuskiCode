'use client';
import {toast} from 'sonner';
import {useCinema, type CinemaJob, type JobMode} from '@/store/cinema';
import {usePersonal} from '@/store/personal-chat';
import {sseData} from '@/lib/ai/sse';
import type {AspectRatio, Resolution} from './capabilities';

export type GenerationRequest = {
  mode: JobMode;
  prompt: string;
  aspect: AspectRatio;
  resolution: Resolution;
  references: string[];
  count: number;
  source?: string;
  boardId?: string;
  shotId?: string;
};

/**
 * Adds one card per variant immediately ("Enviando"), then asks the server to create the Kie tasks.
 * Cards only change state with real answers from the server or from Kie.
 */
export async function startGeneration(request: GenerationRequest) {
  const {addJobs, updateJob} = useCinema.getState();
  const batchId = crypto.randomUUID();
  const now = Date.now();
  const jobs: CinemaJob[] = Array.from({length: request.count}, () => ({
    id: crypto.randomUUID(),
    batchId,
    mode: request.mode,
    prompt: request.prompt,
    aspect: request.aspect,
    resolution: request.resolution,
    references: request.references,
    source: request.source,
    boardId: request.boardId,
    shotId: request.shotId,
    state: 'sending',
    urls: [],
    createdAt: now,
  }));
  addJobs(jobs);
  try {
    const r = await fetch('/api/cinema/images', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        requestId: crypto.randomUUID(),
        mode: request.mode,
        prompt: request.prompt,
        aspect: request.aspect,
        resolution: request.resolution,
        references: request.references,
        count: request.count,
      }),
    });
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
    mode: job.mode, prompt: job.prompt, aspect: job.aspect, resolution: job.resolution,
    references: job.references, count: 1, source: job.source, boardId: job.boardId, shotId: job.shotId,
  });
}

/** One text answer from the configured Kie chat model (personal-chat endpoint, Cinema purposes). */
export async function textRequest(purpose: 'storyboard' | 'prompt', content: string, signal?: AbortSignal) {
  const requestId = crypto.randomUUID();
  let text = '', done = false, accepted = false, credits: number | undefined;
  try {
    const r = await fetch('/api/personal-chat', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({requestId, purpose, model: 'auto', messages: [{role: 'user', content}]}),
      signal,
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw Error(typeof body.error === 'string' ? body.error : 'PROVIDER_UNAVAILABLE');
    }
    accepted = true;
    if (!r.body) throw Error('PROVIDER_UNAVAILABLE');
    for await (const frame of sseData(r.body)) {
      const e = JSON.parse(frame);
      if (e.type === 'delta') text += e.text;
      if (e.type === 'usage' && typeof e.usage?.credits === 'number') credits = e.usage.credits;
      if (e.type === 'error') throw Error(e.error);
      if (e.type === 'done') done = true;
    }
    if (!done) throw Error('STREAM_INTERRUPTED');
    return text.trim();
  } finally {
    // Keep the sidebar usage line honest: text requests to Kie are recorded too.
    if (accepted) usePersonal.getState().charge(requestId, credits);
  }
}

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
