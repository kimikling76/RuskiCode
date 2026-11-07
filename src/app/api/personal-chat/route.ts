import {studioSession} from '@/lib/auth/server';
import {textModels, publicModel} from '@/lib/ai/models';
import {createProvider} from '@/lib/ai/provider';
import {prepareText, providerError} from '@/lib/personal-chat/prepare';
export const runtime = 'nodejs';
// A whole unit written by a large model takes minutes: the request may run up to 5 minutes (the plan's limit).
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!await studioSession(req.headers)) return Response.json({error: 'AUTH_REQUIRED'}, {status: 401});
  const key = Boolean(process.env.KIE_API_KEY);
  return Response.json({models: textModels.map(m => publicModel(m, key))}, {headers: {'Cache-Control': 'no-store'}});
}

export async function POST(req: Request) {
  const prepared = await prepareText(req, {once: true});
  if ('error' in prepared) return prepared.error;
  const {input, selected, messages, system} = prepared;
  const abort = new AbortController();
  const signal = AbortSignal.any([req.signal, abort.signal, AbortSignal.timeout(285000)]);
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    async start(controller) {
      let closed = false, started = false;
      const send = (e: unknown) => { if (closed) return; try { controller.enqueue(encoder.encode('data: ' + JSON.stringify(e) + '\n\n')); } catch { closed = true; } };
      try {
        send({type: 'model', id: selected.id, name: selected.name});
        for await (const e of createProvider(selected).stream({messages, system, signal, webSearch: input.webSearch})) { if (e.type === 'delta') started = true; send(e); }
        send({type: 'done'});
      } catch (e) { send({type: 'error', error: providerError(e, started, signal.aborted)}); }
      finally { closed = true; try { controller.close(); } catch {} abort.abort(); }
    },
    cancel() { abort.abort(); },
  }), {headers: {'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no'}});
}
