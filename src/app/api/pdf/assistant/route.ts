import {authorized, sameOrigin, limit} from '@/lib/ai/security';
import {resolveText, textConfig} from '@/lib/ai/kie-text';
import {createProvider, ProviderError} from '@/lib/ai/provider';
import {alternateTurns, assistantRequestSchema, bookMessage, bookSystem, checkBookPlan, checkPdfPlan, pdfMessage, pdfSystem, type AssistantRequest} from '@/lib/assistant/edit-plan';

export const runtime = 'nodejs';
export const maxDuration = 120;

const headers = {'Cache-Control': 'no-store'};
const fail = (code: string, status: number) => Response.json({error: code}, {status, headers});

/**
 * Turns the author's instruction into a checked plan. It only proposes: the browser shows the preview,
 * the author confirms, and the change is made by the editor or by /api/pdf/stirling.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req) || !req.headers.get('origin')) return fail('FORBIDDEN', 403);
  if (!await authorized(req)) return fail('AUTH_REQUIRED', 401);
  let input: ReturnType<typeof assistantRequestSchema.parse>;
  try {
    const raw = await req.text();
    if (raw.length > 100_000) return fail('REQUEST_TOO_LARGE', 413);
    input = assistantRequestSchema.parse(JSON.parse(raw) as AssistantRequest);
  } catch {
    return fail('INVALID_REQUEST', 400);
  }
  const entry = resolveText(input.model);
  if (!entry) return fail('MODEL_NOT_CONFIGURED', 503);
  try {
    if (!await limit('pdf-assistant', 10, 60) || !await limit('pdf-assistant-hour', 100, 3600)) return fail('RATE_LIMIT', 429);
    if (!await limit('pdf-assistant-request:' + input.requestId, 1, 3600)) return fail('ALREADY_SENT', 409);
  } catch {
    return fail('RATE_LIMIT_UNAVAILABLE', 503);
  }

  const c = input.context;
  const system = c.kind === 'book' ? bookSystem() : pdfSystem();
  const message = c.kind === 'book' ? bookMessage(c, input.instruction) : pdfMessage(c, input.instruction);
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(100_000)]);
  const model = {id: entry.id, name: entry.name};
  let text: string, credits: number | undefined;
  try {
    const result = await createProvider(textConfig(entry)).generate({system, signal, messages: alternateTurns([...input.history, {role: 'user' as const, content: message}])});
    text = result.text;
    credits = result.usage.credits;
  } catch (e) {
    const code = e instanceof ProviderError && e.status === 402 ? 'INSUFFICIENT_BALANCE' : e instanceof ProviderError && [401, 403].includes(e.status) ? 'PROVIDER_AUTH_ERROR' : e instanceof ProviderError && e.status === 429 ? 'RATE_LIMIT' : 'PROVIDER_UNAVAILABLE';
    return Response.json({error: code, model}, {status: 502, headers});
  }
  try {
    const plan = c.kind === 'book' ? checkBookPlan(text, c) : checkPdfPlan(text, c);
    return Response.json({...plan, model, credits}, {headers});
  } catch {
    // The model answered, but not with a plan in the expected shape: nothing is guessed.
    return Response.json({error: 'INVALID_ANSWER', model, credits}, {status: 502, headers});
  }
}
