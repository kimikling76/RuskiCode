import {after} from 'next/server';
import {z} from 'zod';
import {sameOrigin} from '@/lib/ai/security';
import {studioSession} from '@/lib/auth/server';
import {createProvider} from '@/lib/ai/provider';
import {prepareText, providerError} from '@/lib/personal-chat/prepare';
import {createJob, finishJob, readJob, saveProgress} from '@/lib/ai/text-jobs';
import type {Source} from '@/lib/ai/types';
export const runtime = 'nodejs';
// The answer is written after the response, for as long as the platform allows a function to run (5 minutes).
export const maxDuration = 300;

const idSchema = z.string().uuid();

/** Starts a text request that keeps running on the server: the browser can close; the answer is saved as it arrives. */
export async function POST(req: Request) {
  const copy = req.clone();
  const peek = await copy.json().catch(() => null) as {requestId?: unknown} | null;
  const session = await studioSession(req.headers);
  if (!session) return Response.json({error: 'AUTH_REQUIRED'}, {status: 401});
  const id = idSchema.safeParse(peek?.requestId);
  if (!id.success) return Response.json({error: 'INVALID_REQUEST'}, {status: 400});
  // The same job asked again (a retry, a reload, another tab): it is not sent to Kie a second time.
  try { if (await readJob(id.data, session.user.id)) return Response.json({id: id.data, existing: true}); }
  catch { return Response.json({error: 'TEXT_JOBS_UNAVAILABLE'}, {status: 503}); }
  const prepared = await prepareText(req, {once: false});
  if ('error' in prepared) return prepared.error;
  const {userId, input, selected, messages, system} = prepared;
  let fresh: boolean;
  try { fresh = await createJob(id.data, userId, input.purpose, selected.id); }
  catch { return Response.json({error: 'TEXT_JOBS_UNAVAILABLE'}, {status: 503}); }
  if (!fresh) return Response.json({id: id.data, existing: true});
  after(async () => {
    const signal = AbortSignal.timeout(285000);
    let text = '', credits: number | undefined, saved = 0, savedLength = 0;
    const sources: Source[] = [];
    try {
      for await (const e of createProvider(selected).stream({messages, system, signal, webSearch: input.webSearch})) {
        if (e.type === 'delta') text += e.text;
        if (e.type === 'usage' && typeof e.usage.credits === 'number') credits = e.usage.credits;
        if (e.type === 'sources') for (const s of e.sources) if (!sources.some(x => x.url === s.url) && sources.length < 20) sources.push(s);
        // What has arrived is saved every few seconds, so even a stop by the platform keeps most of it.
        if (text.length > savedLength && Date.now() - saved > 3000) { saved = Date.now(); savedLength = text.length; await saveProgress(id.data, text).catch(() => {}); }
      }
      await finishJob(id.data, 'done', {text, credits, sources});
    } catch (e) {
      const error = providerError(e, text.length > 0, signal.aborted);
      await finishJob(id.data, error === 'STREAM_INTERRUPTED' && text.trim() ? 'cut' : 'error', {text, credits, sources, error}).catch(() => {});
    }
  });
  return Response.json({id: id.data, model: {id: selected.id, name: selected.name}}, {status: 202});
}

/** The state of one of the person's jobs, with the text that has arrived so far. */
export async function GET(req: Request) {
  if (!sameOrigin(req)) return Response.json({error: 'FORBIDDEN'}, {status: 403});
  const session = await studioSession(req.headers);
  if (!session) return Response.json({error: 'AUTH_REQUIRED'}, {status: 401});
  const id = idSchema.safeParse(new URL(req.url).searchParams.get('id'));
  if (!id.success) return Response.json({error: 'INVALID_REQUEST'}, {status: 400});
  try {
    const job = await readJob(id.data, session.user.id);
    return job ? Response.json(job, {headers: {'Cache-Control': 'no-store'}}) : Response.json({error: 'NOT_FOUND'}, {status: 404});
  } catch { return Response.json({error: 'TEXT_JOBS_UNAVAILABLE'}, {status: 503}); }
}
