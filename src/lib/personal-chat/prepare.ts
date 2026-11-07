import type {z} from 'zod';
import {sameOrigin, limit} from '@/lib/ai/security';
import {studioSession} from '@/lib/auth/server';
import {resolveText, textConfig} from '@/lib/ai/kie-text';
import {ProviderError} from '@/lib/ai/provider';
import {kieUpload, UploadError} from '@/lib/ai/kie-upload';
import {getAsset} from '@/lib/sync/server';
import {personalInput, systemForPersonal, messagesForPersonal} from './input';
import {withAttachments, AttachmentError, ATTACHMENTS_NOTE} from './attachments-server';
import type {Message} from '@/lib/ai/types';

// What /api/personal-chat and /api/text-jobs check before a text request reaches Kie: same origin, a studio session,
// a valid request, a configured model, the rate limits, and the attached files read from the person's own store.

export type Prepared = {
  userId: string;
  input: z.infer<typeof personalInput>;
  selected: ReturnType<typeof textConfig>;
  messages: Message[];
  system: string;
};

const fail = (error: string, status: number) => ({error: Response.json({error}, {status})});

/** `once`: the request id may be used one time only (a stream); a job checks its own id before calling this. */
export async function prepareText(req: Request, opts: {once: boolean}): Promise<Prepared | {error: Response}> {
  if (!sameOrigin(req) || !req.headers.get('origin')) return fail('FORBIDDEN', 403);
  const session = await studioSession(req.headers);
  if (!session) return fail('AUTH_REQUIRED', 401);
  let input: z.infer<typeof personalInput>;
  try {
    const text = await req.text();
    if (text.length > 160000) throw Error();
    input = personalInput.parse(JSON.parse(text));
  } catch { return fail('INVALID_REQUEST', 400); }
  const entry = resolveText(input.model);
  if (!entry) return fail('MODEL_NOT_CONFIGURED', 503);
  const selected = textConfig(entry);
  if (input.webSearch && !selected.webSearch) return fail('SEARCH_NOT_SUPPORTED', 422);
  try {
    if (!await limit('personal-kie-new', 10, 10) || !await limit('personal-hour', 100, 3600)) return fail('RATE_LIMIT', 429);
    if (opts.once && !await limit('personal-request:' + input.requestId, 1, 3600)) return fail('ALREADY_SENT', 409);
  } catch { return fail('RATE_LIMIT_UNAVAILABLE', 503); }
  let messages: Message[] = messagesForPersonal(input);
  let system = systemForPersonal(input);
  // Attached files are read from the person's own stored files, by hash; images that need a link are uploaded to Kie.
  if (input.messages.some(m => m.attachments?.length)) {
    try {
      const resolved = await withAttachments(messagesForPersonal(input), entry, hash => getAsset(session.user.id, hash), (bytes, mime, hash) => kieUpload(bytes, mime, hash));
      messages = resolved.messages;
      if (resolved.sent) system += '\n\n' + ATTACHMENTS_NOTE;
    } catch (e) {
      const code = e instanceof AttachmentError || e instanceof UploadError ? e.code : 'ATTACHMENTS_UNAVAILABLE';
      return fail(code, code === 'IMAGES_NOT_SUPPORTED' || code === 'ATTACHMENT_MISSING' ? 422 : code === 'UPLOAD_FAILED' ? 502 : 503);
    }
  }
  return {userId: session.user.id, input, selected, messages, system};
}

/** The error code a failed provider stream is reported with. `started`: some text had arrived. */
export function providerError(e: unknown, started: boolean, aborted: boolean) {
  return e instanceof ProviderError && e.status === 402 ? 'INSUFFICIENT_BALANCE'
    : e instanceof ProviderError && [401, 403].includes(e.status) ? 'PROVIDER_AUTH_ERROR'
    : e instanceof ProviderError && e.status === 429 ? 'RATE_LIMIT'
    : e instanceof ProviderError && e.status === 415 ? 'IMAGES_NOT_SUPPORTED'
    : started || aborted ? 'STREAM_INTERRUPTED' : 'PROVIDER_UNAVAILABLE';
}
