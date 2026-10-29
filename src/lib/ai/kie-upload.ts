// Kie's File Upload API (docs.kie.ai/file-upload-api): the Gemini chat models through Kie read images only from an
// https link. The file goes to Kie's temporary storage, which deletes it 24 hours after upload; the studio keeps its
// own copy and uploads it again when the link is older than that.
const UPLOAD = 'https://kieai.redpandaai.co';
const FRESH_MS = 20 * 3600_000;
const links = new Map<string, {url: string; at: number}>();
const extension: Record<string, string> = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/quicktime': 'mov'};

export class UploadError extends Error {
  constructor(public code: 'MODEL_NOT_CONFIGURED' | 'UPLOAD_FAILED') { super(code); }
}

/** Uploads one file and returns its temporary https link. Same content, same name: Kie replaces it. */
export async function kieUpload(bytes: Uint8Array, mime: string, hash: string, transport: typeof fetch = fetch): Promise<string> {
  const known = links.get(hash);
  if (known && Date.now() - known.at < FRESH_MS) return known.url;
  const key = process.env.KIE_API_KEY;
  if (!key) throw new UploadError('MODEL_NOT_CONFIGURED');
  const name = hash + '.' + (extension[mime] || 'bin');
  const form = new FormData();
  form.append('file', new Blob([bytes as BlobPart], {type: mime}), name);
  form.append('uploadPath', 'ruskicode/chat');
  form.append('fileName', name);
  let body: {code?: unknown; data?: {downloadUrl?: unknown}};
  try {
    // KIE_BASE_URL exists only for local tests against a fake Kie; production never sets it.
    const r = await transport((process.env.KIE_BASE_URL || UPLOAD) + '/api/file-stream-upload', {
      // A video of up to 50 MB needs longer than a picture.
      method: 'POST', headers: {Authorization: `Bearer ${key}`}, body: form, signal: AbortSignal.timeout(mime.startsWith('video/') ? 90000 : 30000),
    });
    body = await r.json();
    if (!r.ok) throw Error();
  } catch {
    throw new UploadError('UPLOAD_FAILED');
  }
  const url = body.data?.downloadUrl;
  // Kie answers HTTP 200 with the real status in body.code.
  if (body.code !== 200 || typeof url !== 'string' || !url.startsWith('https://')) throw new UploadError('UPLOAD_FAILED');
  links.set(hash, {url, at: Date.now()});
  return url;
}
