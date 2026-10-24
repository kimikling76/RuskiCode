import {imageModel, taskStates, type AspectRatio, type Resolution, type TaskState} from './capabilities';
import {imageModels, type ImageModel, type VideoModel} from '@/lib/ai/models';
import {mentionPrompt} from './mentions';

// KIE_BASE_URL exists only for local tests against a fake Kie; production never sets it.
const JOBS_PATH = '/api/v1/jobs';
const jobsBase = () => (process.env.KIE_BASE_URL || 'https://api.kie.ai') + JOBS_PATH;

export class CinemaError extends Error {
  constructor(public code: string) { super(code); }
}

// Kie answers with HTTP 200 and the real status in body.code (docs.kie.ai).
function fromKieCode(code: number) {
  if (code === 401 || code === 403) return 'PROVIDER_AUTH_ERROR';
  if (code === 402) return 'INSUFFICIENT_BALANCE';
  if (code === 422) return 'INVALID_PARAMETERS';
  if (code === 429) return 'RATE_LIMIT';
  return 'PROVIDER_UNAVAILABLE';
}

function key() {
  const value = process.env.KIE_API_KEY;
  if (!value) throw new CinemaError('MODEL_NOT_CONFIGURED');
  return value;
}

export type ImageJobInput = {prompt: string; aspect: AspectRatio; resolution: Resolution; references: string[]};
export type JobInput = {prompt: string; aspect?: string; resolution?: string; duration?: string; references: string[]};

/** Builds Kie's `input` object from a catalog entry: only the fields that model documents. */
export function jobInput(model: ImageModel | VideoModel, input: JobInput) {
  const f = model.options.fields;
  const images = f.images && model.options.maxReferences && input.references.length ? (f.imagesSingle ? input.references.slice(0, 1) : input.references) : [];
  // Required fields with a documented default go first, so a chosen option always wins.
  const out: Record<string, unknown> = {...model.options.fixed, [f.prompt]: mentionPrompt(input.prompt, model.options, images.length)};
  if (f.images && images.length) out[f.images] = f.imagesSingle ? images[0] : images;
  if (f.aspect && input.aspect) out[f.aspect] = input.aspect;
  if (f.resolution && input.resolution) out[f.resolution] = input.resolution;
  if (f.duration && input.duration) out[f.duration] = f.durationNumber ? Number(input.duration) : input.duration;
  if (f.format && model.options.outputFormat) out[f.format] = model.options.outputFormat;
  return out;
}

export function createImageJob(input: ImageJobInput, transport: typeof fetch = fetch): Promise<string> {
  return createJob(imageModels.find(m => m.providerModel === imageModel.id)!, input, transport);
}

/** One Kie task through the unified jobs API. Kie answers HTTP 200 with the real status in body.code. */
export async function createJob(model: ImageModel | VideoModel, input: JobInput, transport: typeof fetch = fetch): Promise<string> {
  if (model.adapter !== 'kie-jobs') throw new CinemaError('MODEL_NOT_CONFIGURED');
  const secret = key();
  let response: Response;
  try {
    response = await transport(jobsBase() + '/createTask', {
      method: 'POST',
      headers: {Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({model: model.providerModel, input: jobInput(model, input)}),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    // A timeout does not prove the task was not created.
    throw new CinemaError('CREATE_UNCERTAIN');
  }
  if (!response.ok) throw new CinemaError(fromKieCode(response.status));
  let body: {code?: unknown; data?: {taskId?: unknown}};
  try { body = await response.json(); } catch { throw new CinemaError('PROVIDER_UNAVAILABLE'); }
  if (body.code !== 200) throw new CinemaError(typeof body.code === 'number' ? fromKieCode(body.code) : 'PROVIDER_UNAVAILABLE');
  if (typeof body.data?.taskId !== 'string' || !body.data.taskId) throw new CinemaError('PROVIDER_UNAVAILABLE');
  return body.data.taskId;
}

export type ImageJobStatus = {state: TaskState; urls: string[]; credits?: number; failMessage?: string};

export async function imageJobStatus(taskId: string, transport: typeof fetch = fetch): Promise<ImageJobStatus> {
  const secret = key();
  let response: Response;
  try {
    response = await transport(jobsBase() + '/recordInfo?taskId=' + encodeURIComponent(taskId), {
      headers: {Authorization: `Bearer ${secret}`},
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new CinemaError('STATUS_UNAVAILABLE');
  }
  if (!response.ok) throw new CinemaError('STATUS_UNAVAILABLE');
  let body: {code?: unknown; data?: Record<string, unknown>};
  try { body = await response.json(); } catch { throw new CinemaError('STATUS_UNAVAILABLE'); }
  if (body.code === 422) throw new CinemaError('TASK_NOT_FOUND');
  if (body.code !== 200 || !body.data) throw new CinemaError(typeof body.code === 'number' ? fromKieCode(body.code) : 'STATUS_UNAVAILABLE');

  const data = body.data;
  const raw = typeof data.state === 'string' ? data.state : '';
  // Unknown values are reported as still processing; only success and fail are final.
  const state: TaskState = (taskStates as readonly string[]).includes(raw) ? raw as TaskState : 'generating';
  const credits = typeof data.creditsConsumed === 'number' && Number.isFinite(data.creditsConsumed) ? data.creditsConsumed : undefined;
  if (state === 'fail') {
    return {state, urls: [], credits, failMessage: typeof data.failMsg === 'string' && data.failMsg ? data.failMsg.slice(0, 300) : undefined};
  }
  if (state !== 'success') return {state, urls: []};
  let urls: string[] = [];
  try {
    const result = typeof data.resultJson === 'string' ? JSON.parse(data.resultJson) : data.resultJson;
    urls = Array.isArray(result?.resultUrls) ? result.resultUrls.filter((u: unknown): u is string => typeof u === 'string' && u.startsWith('https://')) : [];
  } catch {}
  if (!urls.length) throw new CinemaError('RESULT_INVALID');
  return {state, urls, credits};
}
