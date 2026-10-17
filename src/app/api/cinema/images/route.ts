import {z} from 'zod';
import {authorized, sameOrigin, limit} from '@/lib/ai/security';
import {findModel, enabledStatus} from '@/lib/ai/models';
import {createJob, imageJobStatus, CinemaError} from '@/lib/cinema/kie-jobs';
import {beginRequest, recordRequest} from '@/lib/cinema/ledger';
import {studioSession} from '@/lib/auth/server';
import {approvedAssetURL} from '@/lib/pipeline/asset-url';

export const runtime = 'nodejs';
// Up to four sequential createTask calls of at most 30 s each.
export const maxDuration = 120;

const createInput = z.object({
  requestId: z.string().uuid(),
  mode: z.enum(['create', 'edit', 'shot', 'video']),
  /** Catalog id. Older clients do not send it: they mean the default image model. */
  model: z.string().max(60).default('nano-banana-2-1'),
  prompt: z.string().trim().min(1).max(4000),
  aspect: z.string().max(24).optional(),
  resolution: z.string().max(24).optional(),
  duration: z.string().max(12).optional(),
  references: z.array(z.string().url().max(2000)).max(16).default([]),
  count: z.number().int().min(1).max(8),
}).strict();

/** Checks every option against what the catalog says this model accepts. */
function validate(input: z.infer<typeof createInput>) {
  const model = findModel(input.model);
  if (!model || model.category === 'text' || model.category === 'audio' || !enabledStatus(model)) return {error: 'MODEL_NOT_CONFIGURED'} as const;
  const o = model.options;
  const wantVideo = input.mode === 'video';
  if (wantVideo !== (model.category === 'video')) return {error: 'INVALID_REQUEST'} as const;
  if (input.mode === 'edit' && (!o.modes.includes('edit') || !input.references.length)) return {error: 'INVALID_REQUEST'} as const;
  // A model that only edits can be used from «Crear» too, but never without the images it needs.
  if (!o.modes.includes('create') && !input.references.length) return {error: 'INVALID_REQUEST'} as const;
  const offered = (value: string | undefined, list: readonly string[]) => list.length ? value !== undefined && list.includes(value) : value === undefined;
  if (!offered(input.aspect, o.aspectRatios) || !offered(input.resolution, o.resolutions) || !offered(input.duration, o.durations)) return {error: 'INVALID_PARAMETERS'} as const;
  if (input.references.length > o.maxReferences || input.count > o.maxVariants) return {error: 'INVALID_PARAMETERS'} as const;
  return {model} as const;
}

const status: Record<string, number> = {
  MODEL_NOT_CONFIGURED: 503, PROVIDER_AUTH_ERROR: 502, INSUFFICIENT_BALANCE: 402, INVALID_PARAMETERS: 422,
  RATE_LIMIT: 429, PROVIDER_UNAVAILABLE: 502, CREATE_UNCERTAIN: 504, STATUS_UNAVAILABLE: 502, TASK_NOT_FOUND: 404, RESULT_INVALID: 502,
};
const fail = (code: string) => Response.json({error: code}, {status: status[code] || 500, headers: {'Cache-Control': 'no-store'}});

/** Creates one Kie task per requested variant. Results are polled with GET. */
export async function POST(req: Request) {
  if (!sameOrigin(req) || !req.headers.get('origin')) return Response.json({error: 'FORBIDDEN'}, {status: 403});
  const session = await studioSession(req.headers);
  if (!session) return Response.json({error: 'AUTH_REQUIRED'}, {status: 401});
  let input: z.infer<typeof createInput>;
  try {
    const text = await req.text();
    if (text.length > 20000) throw Error();
    input = createInput.parse(JSON.parse(text));
  } catch {
    return Response.json({error: 'INVALID_REQUEST'}, {status: 400});
  }
  try {
    for (const reference of input.references) await approvedAssetURL(reference);
  } catch {
    return Response.json({error: 'REFERENCE_NOT_ALLOWED'}, {status: 400});
  }
  const checked = validate(input);
  if ('error' in checked) return fail(checked.error!);
  const model = checked.model;

  // Same request id = same paid tasks. Never create them twice.
  const ledger = await beginRequest(session.user.id, input.requestId, model.id);
  if (ledger.state === 'created') return Response.json({tasks: ledger.taskIds, reused: true}, {headers: {'Cache-Control': 'no-store'}});
  if (ledger.state === 'pending') return fail('CREATE_UNCERTAIN');
  // Refused before anything was sent to Kie: mark it failed so retrying the same id is allowed.
  const refuse = async (response: Response) => { if (ledger.state === 'new') await recordRequest(input.requestId, 'failed', [], 'NOT_SENT'); return response; };
  try {
    if (ledger.state === 'unavailable' && !await limit('cinema-request:' + input.requestId, 1, 3600)) return Response.json({error: 'ALREADY_SENT'}, {status: 409});
    for (let i = 0; i < input.count; i++) {
      // Kie accepts 20 new generations per 10 s per account; stay well below it.
      if (!await limit('cinema-new', 8, 10) || !await limit('cinema-hour', 60, 3600)) return refuse(fail('RATE_LIMIT'));
    }
  } catch {
    return refuse(Response.json({error: 'RATE_LIMIT_UNAVAILABLE'}, {status: 503}));
  }

  const tasks: string[] = [];
  for (let i = 0; i < input.count; i++) {
    try {
      tasks.push(await createJob(model, {prompt: input.prompt, aspect: input.aspect, resolution: input.resolution, duration: input.duration, references: input.references}));
      if (ledger.state === 'new') await recordRequest(input.requestId, 'pending', tasks);
    } catch (e) {
      const code = e instanceof CinemaError ? e.code : 'PROVIDER_UNAVAILABLE';
      // A timeout may have created the task: remember it as uncertain so a retry cannot pay twice.
      if (ledger.state === 'new') await recordRequest(input.requestId, code === 'CREATE_UNCERTAIN' || tasks.length ? 'uncertain' : 'failed', tasks, code);
      if (!tasks.length) return fail(code);
      return Response.json({tasks, error: code}, {headers: {'Cache-Control': 'no-store'}});
    }
  }
  if (ledger.state === 'new') await recordRequest(input.requestId, 'created', tasks);
  return Response.json({tasks}, {headers: {'Cache-Control': 'no-store'}});
}

/** Real task state from Kie: waiting, queuing, generating, success or fail. */
export async function GET(req: Request) {
  if (!await authorized(req)) return Response.json({error: 'AUTH_REQUIRED'}, {status: 401});
  const taskId = new URL(req.url).searchParams.get('taskId') || '';
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(taskId)) return Response.json({error: 'INVALID_REQUEST'}, {status: 400});
  try {
    if (!await limit('cinema-poll', 240, 60)) return fail('RATE_LIMIT');
  } catch {
    return Response.json({error: 'RATE_LIMIT_UNAVAILABLE'}, {status: 503});
  }
  try {
    return Response.json(await imageJobStatus(taskId), {headers: {'Cache-Control': 'no-store'}});
  } catch (e) {
    return fail(e instanceof CinemaError ? e.code : 'STATUS_UNAVAILABLE');
  }
}
