import {sameOrigin, limit} from '@/lib/ai/security';
import {auth} from '@/lib/auth/server';
import {pull, push, pushSchema, SyncError} from '@/lib/sync/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const headers = {'Cache-Control': 'no-store'};
const status: Record<string, number> = {SYNC_NOT_READY: 503, SYNC_UNAVAILABLE: 503, ITEM_TOO_LARGE: 413, RATE_LIMIT: 429};
const fail = (code: string) => Response.json({error: code}, {status: status[code] || 500, headers});

// A database outage must not look like a closed session: the work is kept and the error is retryable.
async function user(req: Request) {
  let session;
  try { session = await auth().api.getSession({headers: req.headers}); } catch { throw new SyncError('SYNC_UNAVAILABLE'); }
  return session?.user.role === 'admin' ? session.user.id : null;
}

/** Changes since a cursor. The first pull of a computer uses cursor 0. */
export async function GET(req: Request) {
  let id: string | null;
  try { id = await user(req); } catch { return fail('SYNC_UNAVAILABLE'); }
  if (!id) return Response.json({error: 'AUTH_REQUIRED'}, {status: 401, headers});
  const raw = new URL(req.url).searchParams.get('since') || '0';
  if (!/^\d{1,19}$/.test(raw)) return Response.json({error: 'INVALID_REQUEST'}, {status: 400, headers});
  try {
    if (!await limit('sync-pull:' + id, 240, 60)) return fail('RATE_LIMIT');
    return Response.json({user: id, ...await pull(id, BigInt(raw))}, {headers});
  } catch (e) {
    return fail(e instanceof SyncError ? e.code : 'SYNC_UNAVAILABLE');
  }
}

/** Versioned writes. A stale write comes back as a conflict with the newer record; it is never applied. */
export async function POST(req: Request) {
  if (!sameOrigin(req) || !req.headers.get('origin')) return Response.json({error: 'FORBIDDEN'}, {status: 403, headers});
  let id: string | null;
  try { id = await user(req); } catch { return fail('SYNC_UNAVAILABLE'); }
  if (!id) return Response.json({error: 'AUTH_REQUIRED'}, {status: 401, headers});
  let input;
  try {
    const text = await req.text();
    if (text.length > 4_200_000) return fail('ITEM_TOO_LARGE');
    input = pushSchema.parse(JSON.parse(text));
  } catch {
    return Response.json({error: 'INVALID_REQUEST'}, {status: 400, headers});
  }
  try {
    if (!await limit('sync-push:' + id, 240, 60)) return fail('RATE_LIMIT');
    return Response.json({results: await push(id, input.device, input.changes)}, {headers});
  } catch (e) {
    return fail(e instanceof SyncError ? e.code : 'SYNC_UNAVAILABLE');
  }
}
