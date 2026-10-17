import {z} from 'zod';

// Files attached to a Chat message. The bytes are stored once, by content hash, in the same store as the books'
// images (/api/sync/assets), so they reach the other computers with the chat. A message only keeps the reference.
// Images go to the model as images. Documents are read in the browser (PDF, Word, HTML, text) and go as their text:
// every model can read that, and nothing is sent that the person cannot see in the file.

export const attachmentLimits = {
  perMessage: 6,
  /** Images sent with one request, newest first; older ones are named, not sent again. */
  imagesPerRequest: 8,
  /** Longest side of an image after scaling it in the browser. */
  imageSide: 2048,
  /** A file to read; the stored asset (scaled image or extracted text) is smaller. */
  fileBytes: 50_000_000,
  /** Text kept from one document, and text from all documents sent in one request. */
  documentChars: 120_000,
  requestChars: 240_000,
};

export const documentSources = ['pdf', 'docx', 'html', 'markdown', 'text', 'csv', 'json'] as const;

export const attachmentSchema = z.object({
  kind: z.enum(['image', 'document']),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'text/plain']),
  name: z.string().trim().min(1).max(200),
  /** Size of the original file, for the person. */
  size: z.number().int().min(0).max(attachmentLimits.fileBytes),
  source: z.enum(documentSources).optional(),
  /** Documents: characters read, pages, and pages without text (scanned). */
  chars: z.number().int().min(0).optional(),
  pages: z.number().int().min(0).optional(),
  emptyPages: z.number().int().min(0).optional(),
  /** The text kept is shorter than the document's. */
  truncated: z.boolean().optional(),
}).strict().refine(a => (a.kind === 'image') === (a.mime !== 'text/plain'), {message: 'kind and mime disagree'});

export type ChatAttachment = z.infer<typeof attachmentSchema>;

export const sourceNames: Record<(typeof documentSources)[number], string> = {
  pdf: 'PDF', docx: 'Word', html: 'HTML', markdown: 'Markdown', text: 'Texto', csv: 'CSV', json: 'JSON',
};

/** «PDF · 12 páginas · 34.500 caracteres», for the chip under a message. */
export function attachmentSummary(a: ChatAttachment) {
  if (a.kind === 'image') return 'Imagen';
  const parts = [a.source ? sourceNames[a.source] : 'Documento'];
  if (a.pages) parts.push(a.pages + (a.pages === 1 ? ' página' : ' páginas'));
  if (a.chars !== undefined) parts.push(a.chars.toLocaleString('es-AR') + ' caracteres');
  return parts.join(' · ');
}
