import {PDFDocument} from 'pdf-lib';
import {checkAgainst, insertOrder, moveOrder, operationInfo, operationSchemas, MAX_PDF_BYTES, type OperationId} from './operations';
import {pageHtml} from './page-html';

// Server only: talks to Stirling PDF with the key from the environment. The key never leaves the server.
//
// STIRLING_API_KEY  the key of a Stirling Cloud account (Settings → Developer → API Keys) or of a self-hosted server.
// STIRLING_API_URL  optional; https://api.stirling.com (Stirling Cloud) when not set, or the address of your own server.

export class StirlingError extends Error {
  constructor(public code: string, public status = 502) { super(code); }
}

/** The platform caps response bodies at 4.5 MB; a result over this cannot travel back. */
export const MAX_RESULT_BYTES = 4_400_000;

export type StirlingConfig = {base: string; key: string; cloud: boolean};

export function stirlingConfig(): StirlingConfig | null {
  const key = (process.env.STIRLING_API_KEY || '').trim();
  if (!key) return null;
  let url: URL;
  try { url = new URL((process.env.STIRLING_API_URL || 'https://api.stirling.com').trim()); } catch { return null; }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  // Plain http only for a server on this same machine, outside production.
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local && process.env.NODE_ENV !== 'production')) return null;
  return {base: (url.origin + url.pathname).replace(/\/+$/, ''), key, cloud: url.hostname === 'api.stirling.com'};
}

export function isPdfBytes(bytes: Uint8Array) {
  const head = bytes.subarray(0, 1024);
  for (let i = 0; i + 4 < head.length; i++) if (head[i] === 0x25 && head[i + 1] === 0x50 && head[i + 2] === 0x44 && head[i + 3] === 0x46 && head[i + 4] === 0x2d) return true;
  return false;
}

/** A .docx is a ZIP whose first entry is usually [Content_Types].xml; the name inside proves it is Word. */
export function isDocxBytes(bytes: Uint8Array) {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) return false;
  const sample = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 200_000)));
  return sample.includes('word/');
}

const decoder = new TextDecoder();

/** What Stirling's answer means. Its own text is logged on the server, never shown as is. */
export function stirlingErrorFor(status: number, body: string) {
  if (status === 401 || status === 403) return new StirlingError('STIRLING_AUTH', 502);
  if (status === 402) return new StirlingError('STIRLING_LIMIT', 402);
  if (status === 413) return new StirlingError('FILE_TOO_LARGE', 413);
  if (/OCR languages|language/i.test(body) && status === 400) return new StirlingError('OCR_LANGUAGE_MISSING', 422);
  if (status === 400 || status === 422) return new StirlingError('STIRLING_REJECTED', 422);
  if (status === 500 && /"error"|Job failed|"detail"/.test(body)) return new StirlingError('STIRLING_REJECTED', 422);
  return new StirlingError('STIRLING_UNAVAILABLE', 503);
}

type Part = {bytes: Uint8Array; name: string; type: string};
type Fields = Record<string, string | number | boolean | (string | number)[]>;

async function call(config: StirlingConfig, path: string, files: Part[], fields: Fields, signal: AbortSignal, transport: typeof fetch) {
  const form = new FormData();
  for (const f of files) form.append('fileInput', new Blob([f.bytes as BlobPart], {type: f.type}), f.name);
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) for (const item of v) form.append(k, String(item));
    else form.append(k, String(v));
  }
  let response: Response;
  try {
    response = await transport(config.base + path, {method: 'POST', headers: {'X-API-KEY': config.key, Accept: 'application/pdf, application/octet-stream, application/json'}, body: form, signal});
  } catch {
    throw new StirlingError(signal.aborted ? 'STIRLING_TIMEOUT' : 'STIRLING_UNAVAILABLE', signal.aborted ? 504 : 503);
  }
  const bytes = new Uint8Array(await response.arrayBuffer().catch(() => new ArrayBuffer(0)));
  const type = response.headers.get('content-type') || '';
  if (!response.ok || type.includes('application/json')) {
    const body = decoder.decode(bytes.subarray(0, 2000));
    console.error('[stirling]', path, response.status, body.slice(0, 300));
    throw stirlingErrorFor(response.ok ? 500 : response.status, body);
  }
  return bytes;
}

/** Page sizes read on this server, so page numbers are checked before anything reaches Stirling. */
async function readPdf(bytes: Uint8Array): Promise<{width: number; height: number}[] | null> {
  if (!isPdfBytes(bytes)) throw new StirlingError('NOT_PDF', 400);
  try {
    const doc = await PDFDocument.load(bytes, {ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false});
    return doc.getPages().map(p => p.getSize());
  } catch {
    return null;
  }
}

export async function countPages(bytes: Uint8Array) {
  return (await readPdf(bytes))?.length ?? null;
}

// Sizes Stirling can scale new pages to (points, portrait).
const standardSizes: [string, number, number][] = [['A3', 841.89, 1190.55], ['A4', 595.28, 841.89], ['A5', 419.53, 595.28], ['A6', 297.64, 419.53], ['LETTER', 612, 792], ['LEGAL', 612, 1008]];

/** The standard size closest to a page, if it is one (within 3 points). */
export function standardSize(size: {width: number; height: number}) {
  const [short, long] = [Math.min(size.width, size.height), Math.max(size.width, size.height)];
  const match = standardSizes.find(([, w, h]) => Math.abs(w - short) <= 3 && Math.abs(h - long) <= 3);
  return match ? {name: match[0], orientation: size.width > size.height ? 'LANDSCAPE' : 'PORTRAIT'} : null;
}

export type OperationResult = {bytes: Uint8Array; mime: string; pages: number | null; calls: number; note?: string | null};

/**
 * Runs one allowed operation. `raw` is untrusted (it comes from the browser): it is parsed again here.
 * Composite operations (insert) are several Stirling calls on this server, so the browser sees one step.
 */
export async function runOperation(op: OperationId, raw: unknown, file: Uint8Array, second: Uint8Array | null, signal: AbortSignal, transport: typeof fetch = fetch): Promise<OperationResult> {
  const config = stirlingConfig();
  if (!config) throw new StirlingError('STIRLING_NOT_CONFIGURED', 503);
  const info = operationInfo[op];
  const parsed = operationSchemas[op].safeParse(raw);
  if (!parsed.success) throw new StirlingError('INVALID_REQUEST', 400);
  const params = parsed.data as Record<string, unknown>;
  if (file.length > MAX_PDF_BYTES || (second && second.length > MAX_PDF_BYTES)) throw new StirlingError('FILE_TOO_LARGE', 413);

  if (info.input === 'docx' && !isDocxBytes(file)) throw new StirlingError('NOT_DOCX', 400);
  let count: number | null = null;
  let sizes: {width: number; height: number}[] | null = null;
  if (info.input === 'pdf') {
    sizes = await readPdf(file);
    count = sizes?.length ?? null;
    // A PDF this server cannot read is still sent: Stirling reads more PDFs. Page checks then fall to Stirling.
    if (count !== null) {
      const check = checkAgainst(op, params, count);
      if (!check.ok) throw new StirlingError(check.error, 400);
    }
  }
  if (info.second && (!second || !isPdfBytes(second))) throw new StirlingError('NOT_PDF', 400);

  const pdf = (bytes: Uint8Array, name = 'documento.pdf'): Part => ({bytes, name, type: 'application/pdf'});
  const go = (path: string, files: Part[], fields: Fields) => call(config, path, files, fields, signal, transport);
  const rearrange = (bytes: Uint8Array, order: number[]) => go('/api/v1/general/rearrange-pages', [pdf(bytes)], {pageNumbers: order.join(','), customMode: 'CUSTOM'});
  const merge = (a: Uint8Array, b: Uint8Array) => go('/api/v1/general/merge-pdfs', [pdf(a, 'a.pdf'), pdf(b, 'b.pdf')], {sortType: 'orderProvided', removeCertSign: false, generateToc: false});

  let bytes: Uint8Array;
  let calls = info.calls;
  /** Something the person should know about the result (new pages left in A4). */
  let note: string | null = null;
  switch (op) {
    case 'reorder': bytes = await rearrange(file, params.order as number[]); break;
    case 'move': {
      if (count === null) throw new StirlingError('STIRLING_REJECTED', 422);
      bytes = await rearrange(file, moveOrder(count, params.pages as number[], params.after as number));
      break;
    }
    case 'extract': bytes = await rearrange(file, params.pages as number[]); break;
    case 'remove': bytes = await go('/api/v1/general/remove-pages', [pdf(file)], {pageNumbers: (params.pages as number[]).join(',')}); break;
    case 'rotate': {
      const fields: Fields = {};
      [...new Set(params.pages as number[])].forEach((n, i) => { fields[`pageRotations[${i}].pageNumber`] = n; fields[`pageRotations[${i}].rotation`] = params.angle as number; });
      bytes = await go('/api/v1/misc/auto-rotate-pdf', [pdf(file)], fields);
      break;
    }
    case 'insert-pdf':
    case 'insert-pages': {
      if (count === null) throw new StirlingError('STIRLING_REJECTED', 422);
      let extra = second!;
      calls = 2;
      if (op === 'insert-pages') {
        const html = new TextEncoder().encode(pageHtml(params.blocks as never, {accent: params.accent as string | undefined}));
        extra = await go('/api/v1/convert/html/pdf', [{bytes: html, name: 'pagina.html', type: 'text/html'}], {zoom: 1});
        calls++;
        // Stirling lays the page out in A4; it is scaled to the neighbouring page when that is a standard size.
        const target = sizes?.[Math.max(0, (params.after as number) - 1)];
        const standard = target ? standardSize(target) : null;
        if (standard && !(standard.name === 'A4' && standard.orientation === 'PORTRAIT')) {
          extra = await go('/api/v1/general/scale-pages', [pdf(extra)], {pageSize: standard.name, orientation: standard.orientation, scaleFactor: 1});
          calls++;
        }
        note = standard ? null : 'A4';
      }
      const added = await countPages(extra);
      if (!added) throw new StirlingError('STIRLING_REJECTED', 422);
      const merged = await merge(file, extra);
      bytes = await rearrange(merged, insertOrder(count, added, params.after as number));
      break;
    }
    case 'note': {
      const comment = {pageIndex: (params.page as number) - 1, x: params.x, y: params.y, width: 20, height: 20, text: params.text, author: 'PDF Studio', subject: 'Nota'};
      bytes = await go('/api/v1/misc/add-comments', [pdf(file)], {comments: JSON.stringify([comment])});
      break;
    }
    case 'stamp':
      // Every field is sent: Stirling 3.2.0 fails when the optional margin is missing.
      bytes = await go('/api/v1/misc/add-stamp', [pdf(file)], {
        pageNumbers: (params.pages as number[]).join(','), stampType: 'text', stampText: params.text as string,
        position: params.position as number, fontSize: params.size as number, customColor: params.color as string,
        opacity: params.opacity as number, rotation: 0, alphabet: 'roman', customMargin: 'medium', overrideX: -1, overrideY: -1,
      });
      break;
    case 'replace-text': {
      const fields: Fields = {pageNumbers: params.pages ? (params.pages as number[]).join(',') : 'all', wholeWordSearch: Boolean(params.wholeWord)};
      (params.edits as {find: string; replace: string}[]).forEach((e, i) => { fields[`edits[${i}].find`] = e.find; fields[`edits[${i}].replace`] = e.replace; });
      bytes = await go('/api/v1/general/edit-text', [pdf(file)], fields);
      break;
    }
    case 'ocr':
      bytes = await go('/api/v1/misc/ocr-pdf', [pdf(file)], {
        languages: params.languages as string[], ocrType: params.force ? 'force-ocr' : 'skip-text', ocrRenderType: 'hocr',
        deskew: Boolean(params.deskew), sidecar: false, clean: false, cleanFinal: false, rotatePages: false, removeImagesAfter: false,
      });
      break;
    case 'to-word': bytes = await go('/api/v1/convert/pdf/word', [pdf(file)], {outputFormat: 'docx'}); break;
    case 'from-word': bytes = await go('/api/v1/convert/file/pdf', [{bytes: file, name: 'documento.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}], {}); break;
  }

  if (bytes.length > MAX_RESULT_BYTES) throw new StirlingError('RESULT_TOO_LARGE', 413);
  if (info.output === 'pdf') {
    if (!isPdfBytes(bytes)) throw new StirlingError('STIRLING_REJECTED', 502);
    return {bytes, mime: 'application/pdf', pages: await countPages(bytes), calls, note};
  }
  if (!isDocxBytes(bytes)) throw new StirlingError('STIRLING_REJECTED', 502);
  return {bytes, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pages: null, calls};
}

let status: {at: number; value: {reachable: boolean; version: string | null}} | null = null;

/** The server's version, from Stirling's public health check (no key, no credit). Cached for five minutes. */
export async function stirlingStatus(transport: typeof fetch = fetch) {
  const config = stirlingConfig();
  if (!config) return {configured: false as const};
  if (!status || Date.now() - status.at > 300_000) {
    let value = {reachable: false, version: null as string | null};
    try {
      const r = await transport(config.base + '/api/v1/info/status', {signal: AbortSignal.timeout(5000)});
      const body = r.ok ? await r.json() : null;
      value = {reachable: r.ok, version: typeof body?.version === 'string' ? body.version.slice(0, 30) : null};
    } catch {}
    status = {at: Date.now(), value};
  }
  return {configured: true as const, cloud: config.cloud, ...status.value};
}
