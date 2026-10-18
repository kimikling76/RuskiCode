import {authorized} from '@/lib/ai/security';
import {approvedAssetURL} from '@/lib/pipeline/asset-url';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BYTES = 60 * 1024 * 1024;

/** Streams a Kie-hosted image or video back as an attachment so the browser can save it with a proper name. */
export async function GET(req: Request) {
  if (!await authorized(req)) return Response.json({error: 'AUTH_REQUIRED'}, {status: 401});
  const params = new URL(req.url).searchParams;
  let url: URL;
  try {
    url = await approvedAssetURL(params.get('url') || '');
  } catch {
    return Response.json({error: 'ASSET_HOST_NOT_ALLOWED'}, {status: 400});
  }
  const name = (params.get('name') || 'imagen').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 80) || 'imagen';

  let upstream: Response;
  try {
    upstream = await fetch(url, {redirect: 'error', signal: AbortSignal.timeout(50000)});
  } catch {
    return Response.json({error: 'ASSET_DOWNLOAD_FAILED'}, {status: 502});
  }
  const type = upstream.headers.get('content-type') || '';
  if (!upstream.ok || !upstream.body) return Response.json({error: 'ASSET_DOWNLOAD_FAILED'}, {status: 502});
  if (!/^(image\/(png|jpeg|webp)|video\/(mp4|webm|quicktime))\b/.test(type)) { await upstream.body.cancel(); return Response.json({error: 'ASSET_TYPE_NOT_ALLOWED'}, {status: 415}); }
  if (Number(upstream.headers.get('content-length') || 0) > MAX_BYTES) { await upstream.body.cancel(); return Response.json({error: 'ASSET_TOO_LARGE'}, {status: 413}); }

  const extension = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : type.includes('mp4') ? 'mp4' : type.includes('webm') ? 'webm' : type.includes('quicktime') ? 'mov' : 'jpg';
  let size = 0;
  const limited = upstream.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      size += chunk.byteLength;
      if (size > MAX_BYTES) controller.error(new Error('ASSET_TOO_LARGE'));
      else controller.enqueue(chunk);
    },
  }));
  return new Response(limited, {
    headers: {
      'Content-Type': type.split(';')[0],
      'Content-Disposition': `attachment; filename="russian-code-${name}.${extension}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
