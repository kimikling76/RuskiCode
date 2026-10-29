import {isMP4} from '@/lib/cinema/video-reference';
import {createHash} from 'node:crypto';
import {sameOrigin, limit} from '@/lib/ai/security';
import {auth} from '@/lib/auth/server';
import {assetMimes, getAsset, putAsset, missingAssets, MAX_ASSET_BYTES, SyncError} from '@/lib/sync/server';

export const runtime = 'nodejs';

const headers = {'Cache-Control': 'no-store'};
const hashPattern = /^[a-f0-9]{64}$/;

// A database outage must not look like a closed session: the work is kept and the error is retryable.
async function user(req: Request) {
  let session;
  try { session = await auth().api.getSession({headers: req.headers}); } catch { throw new SyncError('SYNC_UNAVAILABLE'); }
  return session?.user.role === 'admin' ? session.user.id : null;
}
const fail = (code: string) => Response.json({error: code}, {status: code === 'SYNC_NOT_READY' || code === 'SYNC_UNAVAILABLE' ? 503 : 500, headers});

/** One file by content hash, or ?missing=a,b,c to learn which hashes the server does not have yet. */
export async function GET(req: Request) {
  let id: string | null;
  try { id = await user(req); } catch { return fail('SYNC_UNAVAILABLE'); }
  if (!id) return Response.json({error: 'AUTH_REQUIRED'}, {status: 401, headers});
  const params = new URL(req.url).searchParams;
  try {
    const missing = params.get('missing');
    if (missing !== null) {
      const hashes = missing.split(',').filter(Boolean);
      if (hashes.length > 50 || !hashes.every(h => hashPattern.test(h))) return Response.json({error: 'INVALID_REQUEST'}, {status: 400, headers});
      return Response.json({missing: await missingAssets(id, hashes)}, {headers});
    }
    const hash = params.get('hash') || '';
    if (!hashPattern.test(hash)) return Response.json({error: 'INVALID_REQUEST'}, {status: 400, headers});
    const asset = await getAsset(id, hash);
    if (!asset) return Response.json({error: 'NOT_FOUND'}, {status: 404, headers});
    // The bytes are only declared as an image; nosniff and the CSP keep a browser from running anything else.
    return new Response(Buffer.from(asset.data), {headers: {'Content-Type': asset.mime, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'"}});
  } catch (e) {
    return fail(e instanceof SyncError ? e.code : 'SYNC_UNAVAILABLE');
  }
}

/** Stores an image once; the server computes the hash itself and answers with it. */
export async function POST(req: Request) {
  if (!sameOrigin(req) || !req.headers.get('origin')) return Response.json({error: 'FORBIDDEN'}, {status: 403, headers});
  let id: string | null;
  try { id = await user(req); } catch { return fail('SYNC_UNAVAILABLE'); }
  if (!id) return Response.json({error: 'AUTH_REQUIRED'}, {status: 401, headers});
  const mime = (req.headers.get('content-type') || '').split(';')[0].trim();
  if (!(assetMimes as readonly string[]).includes(mime)) return Response.json({error: 'INVALID_TYPE'}, {status: 415, headers});
  const length = Number(req.headers.get('content-length') || 0);
  if (length > MAX_ASSET_BYTES) return Response.json({error: 'ITEM_TOO_LARGE'}, {status: 413, headers});
  try {
    if (!await limit('sync-asset:' + id, 120, 60)) return Response.json({error: 'RATE_LIMIT'}, {status: 429, headers});
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_ASSET_BYTES) return Response.json({error: 'ITEM_TOO_LARGE'}, {status: 413, headers});
    if (mime === 'video/mp4' && !isMP4(bytes)) return Response.json({error: 'INVALID_TYPE'}, {status: 415, headers});
    const hash = createHash('sha256').update(bytes).digest('hex');
    await putAsset(id, hash, mime, bytes);
    return Response.json({hash}, {headers});
  } catch (e) {
    return fail(e instanceof SyncError ? e.code : 'SYNC_UNAVAILABLE');
  }
}
