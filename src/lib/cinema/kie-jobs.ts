import {imageModel, outputFormat, taskStates, type AspectRatio, type Resolution, type TaskState} from './capabilities';

const JOBS = 'https://api.kie.ai/api/v1/jobs';

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

export async function createImageJob(input: ImageJobInput, transport: typeof fetch = fetch): Promise<string> {
  const secret = key();
  let response: Response;
  try {
    response = await transport(JOBS + '/createTask', {
      method: 'POST',
      headers: {Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        model: imageModel.id,
        input: {prompt: input.prompt, image_input: input.references, aspect_ratio: input.aspect, resolution: input.resolution, output_format: outputFormat},
      }),
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
    response = await transport(JOBS + '/recordInfo?taskId=' + encodeURIComponent(taskId), {
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
