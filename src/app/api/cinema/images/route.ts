import {z} from 'zod';
import {authorized, sameOrigin, limit} from '@/lib/ai/security';
import {aspectRatios, resolutions, maxReferences, maxVariants} from '@/lib/cinema/capabilities';
import {createImageJob, imageJobStatus, CinemaError} from '@/lib/cinema/kie-jobs';
import {approvedAssetURL} from '@/lib/pipeline/asset-url';

export const runtime = 'nodejs';
// Up to four sequential createTask calls of at most 30 s each.
export const maxDuration = 120;

const createInput = z.object({
  requestId: z.string().uuid(),
  mode: z.enum(['create', 'edit', 'shot']),
  prompt: z.string().trim().min(1).max(4000),
  aspect: z.enum(aspectRatios),
  resolution: z.enum(resolutions),
  references: z.array(z.string().url().max(2000)).max(maxReferences).default([]),
  count: z.number().int().min(1).max(maxVariants),
}).strict().refine(v => v.mode !== 'edit' || v.references.length > 0);

const status: Record<string, number> = {
  MODEL_NOT_CONFIGURED: 503, PROVIDER_AUTH_ERROR: 502, INSUFFICIENT_BALANCE: 402, INVALID_PARAMETERS: 422,
  RATE_LIMIT: 429, PROVIDER_UNAVAILABLE: 502, CREATE_UNCERTAIN: 504, STATUS_UNAVAILABLE: 502, TASK_NOT_FOUND: 404, RESULT_INVALID: 502,
};
const fail = (code: string) => Response.json({error: code}, {status: status[code] || 500, headers: {'Cache-Control': 'no-store'}});

/** Creates one Kie task per requested variant. Results are polled with GET. */
export async function POST(req: Request) {
  if (!sameOrigin(req) || !req.headers.get('origin')) return Response.json({error: 'FORBIDDEN'}, {status: 403});
  if (!await authorized(req)) return Response.json({error: 'AUTH_REQUIRED'}, {status: 401});
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
  try {
    if (!await limit('cinema-request:' + input.requestId, 1, 3600)) return Response.json({error: 'ALREADY_SENT'}, {status: 409});
    for (let i = 0; i < input.count; i++) {
      // Kie accepts 20 new generations per 10 s per account; stay well below it.
      if (!await limit('cinema-new', 8, 10) || !await limit('cinema-hour', 60, 3600)) return fail('RATE_LIMIT');
    }
  } catch {
    return Response.json({error: 'RATE_LIMIT_UNAVAILABLE'}, {status: 503});
  }

  const tasks: string[] = [];
  for (let i = 0; i < input.count; i++) {
    try {
      tasks.push(await createImageJob({prompt: input.prompt, aspect: input.aspect, resolution: input.resolution, references: input.references}));
    } catch (e) {
      const code = e instanceof CinemaError ? e.code : 'PROVIDER_UNAVAILABLE';
      if (!tasks.length) return fail(code);
      return Response.json({tasks, error: code}, {headers: {'Cache-Control': 'no-store'}});
    }
  }
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
