import {authorized, sameOrigin, limit} from '@/lib/ai/security';
import {operationIds, MAX_PDF_BYTES, type OperationId} from '@/lib/stirling/operations';
import {runOperation, stirlingStatus, StirlingError} from '@/lib/stirling/server';

export const runtime = 'nodejs';
export const maxDuration = 120;

const headers = {'Cache-Control': 'no-store'};
const fail = (code: string, status: number) => Response.json({error: code}, {status, headers});

/** Whether Stirling is connected and which version answers. Never the key or the address. */
export async function GET(req: Request) {
  if (!await authorized(req)) return fail('AUTH_REQUIRED', 401);
  return Response.json(await stirlingStatus(), {headers});
}

/**
 * One PDF operation: multipart with `operation`, `params` (JSON), `file` and, for some, `second`.
 * The files and parameters are untrusted: they are checked here and again in runOperation.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req) || !req.headers.get('origin')) return fail('FORBIDDEN', 403);
  if (!await authorized(req)) return fail('AUTH_REQUIRED', 401);
  // Two files of at most 4 MB plus the form fields.
  if (Number(req.headers.get('content-length') || 0) > 2 * MAX_PDF_BYTES + 200_000) return fail('FILE_TOO_LARGE', 413);
  try {
    if (!await limit('stirling', 20, 60) || !await limit('stirling-hour', 300, 3600)) return fail('RATE_LIMIT', 429);
  } catch {
    return fail('RATE_LIMIT_UNAVAILABLE', 503);
  }

  let op: OperationId, params: unknown, file: Uint8Array, second: Uint8Array | null = null;
  try {
    const form = await req.formData();
    const name = String(form.get('operation') || '');
    if (!(operationIds as string[]).includes(name)) return fail('INVALID_REQUEST', 400);
    op = name as OperationId;
    const rawParams = String(form.get('params') || '{}');
    if (rawParams.length > 200_000) return fail('INVALID_REQUEST', 400);
    params = JSON.parse(rawParams);
    const main = form.get('file');
    if (!(main instanceof Blob)) return fail('INVALID_REQUEST', 400);
    if (main.size > MAX_PDF_BYTES) return fail('FILE_TOO_LARGE', 413);
    file = new Uint8Array(await main.arrayBuffer());
    const extra = form.get('second');
    if (extra instanceof Blob) {
      if (extra.size > MAX_PDF_BYTES) return fail('FILE_TOO_LARGE', 413);
      second = new Uint8Array(await extra.arrayBuffer());
    }
  } catch {
    return fail('INVALID_REQUEST', 400);
  }

  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(110_000)]);
  try {
    const result = await runOperation(op, params, file, second, signal);
    return new Response(result.bytes as BodyInit, {headers: {
      ...headers,
      'Content-Type': result.mime,
      'X-Content-Type-Options': 'nosniff',
      'X-Stirling-Calls': String(result.calls),
      ...(result.pages ? {'X-Page-Count': String(result.pages)} : {}),
      ...(result.note ? {'X-Result-Note': result.note} : {}),
    }});
  } catch (e) {
    if (e instanceof StirlingError) return fail(e.code, e.status);
    console.error('[stirling] unexpected', e);
    return fail('STIRLING_UNAVAILABLE', 503);
  }
}
