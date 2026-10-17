import {z} from 'zod';
import {blockSchema} from '@/lib/skills/schemas';

// The PDF operations PDF Studio can ask Stirling PDF for. Nothing outside this list reaches Stirling:
// the server validates every request against these schemas before calling it.
// Shared by the browser (labels, checks) and the server (validation). No secrets here.
//
// Each was tried on a real Stirling PDF 3.2.0 server (see docs/ETAPA_8_STIRLING_PDF_STUDIO.md).

/** What a PDF may weigh to go through the server (the platform caps request bodies at 4.5 MB). */
export const MAX_PDF_BYTES = 4_000_000;
export const MAX_PAGES = 2000;

const page = z.number().int().min(1).max(MAX_PAGES);
const pages = z.array(page).min(1).max(MAX_PAGES);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const line = (max: number) => z.string().trim().min(1).max(max);

/** Languages the OCR offers. Russian needs its language file on the Stirling server (see the docs). */
export const ocrLanguages = ['rus', 'eng', 'spa', 'deu', 'fra', 'por'] as const;
export const ocrLanguageNames: Record<(typeof ocrLanguages)[number], string> = {rus: 'Ruso', eng: 'Inglés', spa: 'Español', deu: 'Alemán', fra: 'Francés', por: 'Portugués'};

/** Blocks a generated page can carry. Images are left out: Stirling's HTML converter drops embedded images. */
export const pageBlockSchema = blockSchema.refine(b => b.type !== 'image', {message: 'Images are not supported in generated pages'});
export type PageBlock = z.infer<typeof pageBlockSchema>;

export const operationSchemas = {
  /** The new order, as the old page numbers. Every page appears once. */
  reorder: z.object({order: pages}).strict(),
  /** Pages moved together to a new place: after page `after` of the document without them (0 = first). */
  move: z.object({pages, after: z.number().int().min(0).max(MAX_PAGES)}).strict(),
  /** A new document with these pages, in this order. */
  extract: z.object({pages}).strict(),
  remove: z.object({pages}).strict(),
  rotate: z.object({pages, angle: z.union([z.literal(90), z.literal(180), z.literal(270)])}).strict(),
  /** Another PDF (the second file) goes in after page `after` (0 = at the start). */
  'insert-pdf': z.object({after: z.number().int().min(0).max(MAX_PAGES)}).strict(),
  /** New pages made from blocks (text, lists, tables), laid out by Stirling and inserted after page `after`. */
  'insert-pages': z.object({
    after: z.number().int().min(0).max(MAX_PAGES),
    blocks: z.array(pageBlockSchema).min(1).max(40),
    accent: color.optional(),
  }).strict(),
  /** A sticky note (PDF annotation). Coordinates in points from the bottom-left corner. */
  note: z.object({page, x: z.number().min(0).max(14400), y: z.number().min(0).max(14400), text: line(2000)}).strict(),
  /** Text drawn on top of the page. The page's own text does not change. */
  stamp: z.object({
    pages, text: line(300), position: z.number().int().min(1).max(9),
    size: z.number().min(6).max(96), color, opacity: z.number().min(0.1).max(1),
  }).strict(),
  /** Find and replace in the page text: this does change the PDF's own text. */
  'replace-text': z.object({
    pages: pages.optional(),
    edits: z.array(z.object({find: line(500), replace: z.string().max(500)}).strict()).min(1).max(20),
    wholeWord: z.boolean().default(false),
  }).strict(),
  ocr: z.object({languages: z.array(z.enum(ocrLanguages)).min(1).max(3), force: z.boolean().default(false), deskew: z.boolean().default(false)}).strict(),
  /** PDF → Word (.docx), to download. */
  'to-word': z.object({}).strict(),
  /** Word (.docx) → PDF with LibreOffice on the Stirling server. */
  'from-word': z.object({}).strict(),
} as const;

export type OperationId = keyof typeof operationSchemas;
export type OperationParams<T extends OperationId> = z.input<(typeof operationSchemas)[T]>;
export const operationIds = Object.keys(operationSchemas) as OperationId[];

type Info = {
  label: string;
  /** Calls to Stirling the operation makes; each one processes a file (one Stirling credit or more). */
  calls: number;
  /** What it does to the PDF, said plainly. */
  effect: string;
  input: 'pdf' | 'docx';
  output: 'pdf' | 'docx';
  /** Needs a second PDF. */
  second?: boolean;
  /** The result is a new document, not a new version of this one. */
  newDocument?: boolean;
};

export const operationInfo: Record<OperationId, Info> = {
  reorder: {label: 'Ordenar páginas', calls: 1, effect: 'Cambia el orden de las páginas. Su contenido no cambia.', input: 'pdf', output: 'pdf'},
  move: {label: 'Mover páginas', calls: 1, effect: 'Cambia el orden de las páginas. Su contenido no cambia.', input: 'pdf', output: 'pdf'},
  extract: {label: 'Extraer páginas', calls: 1, effect: 'Crea un PDF nuevo con esas páginas. Este documento no cambia.', input: 'pdf', output: 'pdf', newDocument: true},
  remove: {label: 'Borrar páginas', calls: 1, effect: 'Quita esas páginas del documento.', input: 'pdf', output: 'pdf'},
  rotate: {label: 'Rotar páginas', calls: 1, effect: 'Gira solo esas páginas. Su contenido no cambia.', input: 'pdf', output: 'pdf'},
  'insert-pdf': {label: 'Insertar otro PDF', calls: 2, effect: 'Agrega las páginas de otro PDF sin cambiar las que ya están.', input: 'pdf', output: 'pdf', second: true},
  'insert-pages': {label: 'Insertar páginas nuevas', calls: 4, effect: 'Agrega páginas nuevas armadas por Stirling, con su propia tipografía. Las páginas existentes no cambian.', input: 'pdf', output: 'pdf'},
  note: {label: 'Agregar nota', calls: 1, effect: 'Agrega una nota adhesiva (un comentario del PDF). El texto de la página no cambia.', input: 'pdf', output: 'pdf'},
  stamp: {label: 'Superponer texto', calls: 1, effect: 'Dibuja texto encima de la página. El texto original sigue igual debajo.', input: 'pdf', output: 'pdf'},
  'replace-text': {label: 'Reemplazar texto', calls: 1, effect: 'Cambia el texto propio del PDF. Stirling reescribe el texto de esas páginas: puede perder colores o negritas. Revisá la vista previa.', input: 'pdf', output: 'pdf'},
  ocr: {label: 'Reconocer texto (OCR)', calls: 1, effect: 'Agrega una capa de texto invisible a las páginas escaneadas para buscar y copiar. La imagen de la página no se vuelve editable.', input: 'pdf', output: 'pdf'},
  'to-word': {label: 'Convertir a Word', calls: 1, effect: 'Crea un .docx aproximado para descargar. El PDF no cambia.', input: 'pdf', output: 'docx', newDocument: true},
  'from-word': {label: 'Convertir Word a PDF', calls: 1, effect: 'Stirling convierte el .docx con LibreOffice. Puede diferir un poco de cómo se ve en Word.', input: 'docx', output: 'pdf', newDocument: true},
};

/** «1, 3–5, 9» for messages. */
export function pageRanges(list: number[]) {
  const sorted = [...new Set(list)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j > i ? sorted[i] + '–' + sorted[j] : String(sorted[i]));
    i = j;
  }
  return parts.join(', ');
}

/** The final order when `moved` pages go after page `after` of the remaining ones. */
export function moveOrder(count: number, moved: number[], after: number) {
  const set = new Set(moved);
  const rest = Array.from({length: count}, (_, i) => i + 1).filter(n => !set.has(n));
  const block = [...set].sort((a, b) => a - b);
  const at = Math.max(0, Math.min(after, rest.length));
  return [...rest.slice(0, at), ...block, ...rest.slice(at)];
}

/** The order after a merge of `count` pages with `added` new ones (numbered after them), placed after `after`. */
export function insertOrder(count: number, added: number, after: number) {
  const at = Math.max(0, Math.min(after, count));
  const own = Array.from({length: count}, (_, i) => i + 1);
  const extra = Array.from({length: added}, (_, i) => count + i + 1);
  return [...own.slice(0, at), ...extra, ...own.slice(at)];
}

export type CheckResult = {ok: true} | {ok: false; error: string};

/** Checks that depend on the document: page numbers in range, a real permutation, not every page removed. */
export function checkAgainst(op: OperationId, params: Record<string, unknown>, pageCount: number): CheckResult {
  const inRange = (list: unknown) => Array.isArray(list) && list.every(n => typeof n === 'number' && n >= 1 && n <= pageCount);
  const fail = (error: string): CheckResult => ({ok: false, error});
  if ('pages' in params && params.pages !== undefined && !inRange(params.pages)) return fail('PAGE_OUT_OF_RANGE');
  if ('page' in params && !inRange([params.page])) return fail('PAGE_OUT_OF_RANGE');
  if ('after' in params && (typeof params.after !== 'number' || params.after > pageCount)) return fail('PAGE_OUT_OF_RANGE');
  if (op === 'reorder') {
    const order = params.order as number[];
    if (order.length !== pageCount || new Set(order).size !== pageCount || !inRange(order)) return fail('INVALID_ORDER');
  }
  if (op === 'remove' && new Set(params.pages as number[]).size >= pageCount) return fail('CANNOT_REMOVE_ALL');
  return {ok: true};
}

/** What a failed operation means, for the person. */
export const operationErrors: Record<string, string> = {
  STIRLING_NOT_CONFIGURED: 'Stirling PDF no está conectado en el servidor todavía. Hace falta cargar su clave (ver Ajustes → Conectores).',
  STIRLING_AUTH: 'Stirling rechazó la clave del servidor. Revisá que la clave de Stirling siga activa.',
  STIRLING_LIMIT: 'Se terminó el saldo de Stirling PDF de este mes (o el límite de gasto). Las herramientas manuales siguen funcionando.',
  STIRLING_REJECTED: 'Stirling no pudo procesar este archivo con esos datos.',
  STIRLING_UNAVAILABLE: 'Stirling PDF no responde ahora. Probá de nuevo en un rato.',
  STIRLING_TIMEOUT: 'Stirling tardó demasiado. Con archivos grandes o un OCR largo puede pasar; probá con menos páginas.',
  OCR_LANGUAGE_MISSING: 'El servidor de Stirling no tiene instalado ese idioma de OCR.',
  FILE_TOO_LARGE: 'El archivo pesa más de 4 MB, el máximo que pasa por el servidor.',
  RESULT_TOO_LARGE: 'El resultado pesa más de 4 MB y no se puede devolver. Probá con menos páginas.',
  NOT_PDF: 'El archivo no es un PDF válido.',
  NOT_DOCX: 'El archivo no es un Word (.docx) válido.',
  PDF_PASSWORD: 'El PDF tiene contraseña. Quitásela antes de editarlo.',
  PAGE_OUT_OF_RANGE: 'Alguna página no existe en este documento.',
  INVALID_ORDER: 'El orden nuevo tiene que incluir cada página una vez.',
  CANNOT_REMOVE_ALL: 'No se pueden borrar todas las páginas.',
  INVALID_REQUEST: 'Los datos de la operación no son válidos.',
  RATE_LIMIT: 'Demasiadas operaciones seguidas. Esperá un minuto.',
  RATE_LIMIT_UNAVAILABLE: 'El control de uso no está disponible ahora. Probá de nuevo.',
  AUTH_REQUIRED: 'Tu sesión terminó. Volvé a iniciar sesión.',
  FORBIDDEN: 'Pedido rechazado.',
};
