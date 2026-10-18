import {z} from 'zod';

// The editable source of a manual unit (PDF Studio → Manual).
//
// A unit imported from a PDF keeps every object of the original page as an element: each line of text with its
// font, size and colour; each image with its exact bytes, position and crop; each shape. Nothing is redrawn from a
// guess, so a page that is not edited exports looking like the original. Elements are grouped in blocks
// (an exercise, the footer…) so they can be selected, locked and edited together.
//
// New content (an exercise, a paragraph, an image) is a block with a `component`: its elements are produced from
// the unit's template, which is taken from the imported pages themselves (see template.ts).
//
// Coordinates are PDF points, origin at the bottom left of the page, as in the PDF.

const num = z.number().finite();
export const matrixSchema = z.tuple([num, num, num, num, num, num]);
export type Matrix = z.infer<typeof matrixSchema>;

export const colorSchema = z.object({space: z.enum(['rgb', 'gray', 'cmyk']), c: z.array(z.number().min(0).max(1)).min(1).max(4)}).strict();
export type Color = z.infer<typeof colorSchema>;

export const pathOpSchema = z.union([
  z.tuple([z.literal('M'), num, num]),
  z.tuple([z.literal('L'), num, num]),
  z.tuple([z.literal('C'), num, num, num, num, num, num]),
  z.tuple([z.literal('Z')]),
]);
export type PathOp = z.infer<typeof pathOpSchema>;

/** A clipping path in page coordinates. Several clips apply one inside the other. */
export const clipSchema = z.object({path: z.array(pathOpSchema).max(4000), evenOdd: z.boolean()}).strict();
export type Clip = z.infer<typeof clipSchema>;

/** The fonts the editor can draw. DejaVu Sans is free to embed; the imported PDFs of the manual use it. */
export const fontIds = ['regular', 'bold'] as const;
export type FontId = (typeof fontIds)[number];
export const fontFiles: Record<FontId, string> = {regular: '/fonts/dejavu/DejaVuSans.ttf', bold: '/fonts/dejavu/DejaVuSans-Bold.ttf'};

export const spanSchema = z.object({
  text: z.string().max(4000),
  font: z.enum(fontIds),
  size: z.number().positive().max(400),
  color: colorSchema,
  /** Extra spacing as in the PDF (Tc, Tw) and horizontal scaling in percent (Tz). Absent means 0, 0, 100. */
  charSpacing: num.optional(),
  wordSpacing: num.optional(),
  scale: num.optional(),
}).strict();
export type Span = z.infer<typeof spanSchema>;

const base = {
  id: z.string().min(1).max(80),
  /** Painting order on the page: higher is drawn later, on top. */
  z: num,
  clips: z.array(clipSchema).max(8).optional(),
  /** Opacity for fills and strokes (the PDF's ca/CA), 1 when absent. */
  opacity: z.number().min(0).max(1).optional(),
  /** What this element is in the template: the page number, an exercise number, an audio code… */
  role: z.string().max(40).optional(),
};

export const textElementSchema = z.object({
  ...base,
  kind: z.literal('text'),
  /** Baseline of the first span. */
  x: num, y: num,
  spans: z.array(spanSchema).min(1).max(200),
  /** Where each span starts, as in the original. Dropped when the text is edited: spans then follow each other. */
  spanX: z.array(num).optional(),
  /** Width the text must fit in: wider text is reported as an overflow. */
  maxWidth: num.optional(),
  /** PDF text rendering mode (0 fill, 3 invisible…). */
  mode: z.number().int().min(0).max(7).optional(),
}).strict();
export type TextElement = z.infer<typeof textElementSchema>;

/** An image stream exactly as it was in the PDF (still encoded), or a JPEG/PNG file added in the editor. */
export const imageDataSchema = z.object({
  /** sha256 of the stored bytes (an asset of the unit). */
  asset: z.string().regex(/^[a-f0-9]{64}$/),
  format: z.enum(['raw', 'jpeg', 'png']),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  colorSpace: z.enum(['DeviceRGB', 'DeviceGray', 'DeviceCMYK']).optional(),
  bitsPerComponent: z.number().int().optional(),
  filters: z.array(z.string().max(40)).max(4).optional(),
  decodeParms: z.array(z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])).nullable()).max(4).optional(),
  decode: z.array(num).max(8).optional(),
  interpolate: z.boolean().optional(),
}).strict();
export type ImageData = z.infer<typeof imageDataSchema>;

export const imageElementSchema = z.object({
  ...base,
  kind: z.literal('image'),
  /** Maps the unit square of the image to the page (the PDF's CTM when it was painted). */
  matrix: matrixSchema,
  image: imageDataSchema,
  smask: imageDataSchema.optional(),
}).strict();
export type ImageElement = z.infer<typeof imageElementSchema>;

export const pathElementSchema = z.object({
  ...base,
  kind: z.literal('path'),
  ops: z.array(pathOpSchema).min(1).max(20000),
  fill: z.object({color: colorSchema, evenOdd: z.boolean()}).strict().optional(),
  stroke: z.object({
    color: colorSchema, width: z.number().min(0), cap: z.number().int().min(0).max(2).optional(),
    join: z.number().int().min(0).max(2).optional(), miter: num.optional(), dash: z.tuple([z.array(num), num]).optional(),
  }).strict().optional(),
}).strict();
export type PathElement = z.infer<typeof pathElementSchema>;

export const elementSchema = z.discriminatedUnion('kind', [textElementSchema, imageElementSchema, pathElementSchema]);
export type Element = z.infer<typeof elementSchema>;

/** New content written in the editor; its elements come from the template. */
export const componentSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('exercise'),
    number: z.string().max(10),
    audio: z.string().max(12),
    instruction: z.string().max(300),
    /** Lines in the example colour; **bold** and ==highlight== marks. */
    example: z.array(z.string().max(300)).max(6),
    items: z.array(z.string().max(300)).max(40),
    columns: z.union([z.literal(1), z.literal(2)]),
  }).strict(),
  z.object({type: z.literal('text'), text: z.string().max(6000)}).strict(),
  z.object({type: z.literal('heading'), text: z.string().max(200)}).strict(),
  z.object({type: z.literal('image'), image: imageDataSchema, width: num, height: num, rounded: z.boolean()}).strict(),
]);
export type Component = z.infer<typeof componentSchema>;

export const blockKinds = ['background', 'header', 'title', 'section', 'footer', 'side', 'content'] as const;
export const blockSchema = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum(blockKinds),
  label: z.string().max(200),
  /** Approved content: the editor and the assistant leave it as it is until it is unlocked. */
  locked: z.boolean().optional(),
  elements: z.array(elementSchema).max(5000),
  /** For new content: the source the elements are made from, and where its top-left corner is. */
  component: componentSchema.optional(),
  at: z.tuple([num, num]).optional(),
}).strict();
export type Block = z.infer<typeof blockSchema>;

export const pageSchema = z.object({
  id: z.string().min(1).max(80),
  width: z.number().positive().max(14400),
  height: z.number().positive().max(14400),
  blocks: z.array(blockSchema).max(400),
  /**
   * A page the reader could not take apart (a font the editor does not have, a shading…): it is drawn from the
   * original PDF as it is, and its content cannot be edited. The reason is shown.
   */
  conserved: z.object({sourcePage: z.number().int().min(0), reason: z.string().max(300)}).strict().optional(),
  /** The page of the original PDF it comes from, to compare. */
  sourcePage: z.number().int().min(0).optional(),
}).strict();
export type Page = z.infer<typeof pageSchema>;

/** Styles and pieces taken from an imported unit, so new pages and exercises look like the manual. */
export const templateSchema = z.object({
  /** Exercise header (band, number badge, audio icon, audio code, instruction) relative to its top-left corner. */
  exerciseHeader: z.object({elements: z.array(elementSchema).max(500), width: num, height: num}).strict().optional(),
  item: spanSchema.optional(),
  example: spanSchema.optional(),
  highlight: spanSchema.optional(),
  text: spanSchema.optional(),
  heading: spanSchema.optional(),
  /** Line pitch of items, of example lines and of running text. */
  itemPitch: num.optional(),
  examplePitch: num.optional(),
  textLeading: num.optional(),
  /** From the bottom of the exercise header to the first baseline, and from the last example to the first item. */
  afterHeader: num.optional(),
  afterExample: num.optional(),
  /** Items start this far right of the left margin; the second column of two-column items is further right. */
  itemIndent: num.optional(),
  columnOffset: num.optional(),
  /** Page furniture: footer (with the page number as role 'page-number') and side tab (role 'unit-tab'). */
  footer: z.array(elementSchema).max(500).optional(),
  side: z.array(elementSchema).max(500).optional(),
  margins: z.object({left: num, right: num, top: num, bottom: num}).strict(),
  /** Gap between blocks stacked on a page. */
  gap: num,
  /** Rounded corners of photos, in points. */
  photoRadius: num.optional(),
}).strict();
export type Template = z.infer<typeof templateSchema>;

export const unitSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1).max(80),
  title: z.string().max(200),
  /** Number shown in the side tab and used for audio codes (1 → 1.01, 1.02…). */
  number: z.string().max(10).optional(),
  createdAt: num,
  updatedAt: num,
  pages: z.array(pageSchema).min(1).max(300),
  template: templateSchema,
  /** The imported PDF, kept unchanged as an asset, to compare and to draw conserved pages. */
  source: z.object({asset: z.string().regex(/^[a-f0-9]{64}$/), name: z.string().max(300), pages: z.number().int().positive(), size: z.number().int().positive()}).strict().optional(),
  /** Asset hashes this unit uses, with their stored type. */
  assets: z.record(z.string().regex(/^[a-f0-9]{64}$/), z.enum(['application/octet-stream', 'image/jpeg', 'image/png', 'application/pdf'])),
}).strict();
export type Unit = z.infer<typeof unitSchema>;

export const black: Color = {space: 'gray', c: [0]};

/**
 * The files a unit uses, with their stored type: the imported PDF, the images of its pages, versions aside.
 * Kept in `assets` so that sync knows which files to send.
 */
export function usedAssets(unit: Pick<Unit, 'pages' | 'template' | 'source' | 'assets'>): Unit['assets'] {
  const out: Unit['assets'] = {};
  const mimeOf = (d: ImageData) => d.format === 'jpeg' ? 'image/jpeg' as const : d.format === 'png' ? 'image/png' as const : 'application/octet-stream' as const;
  const add = (els: Element[] | undefined) => {
    for (const el of els || []) if (el.kind === 'image') {
      out[el.image.asset] = unit.assets[el.image.asset] ?? mimeOf(el.image);
      if (el.smask) out[el.smask.asset] = unit.assets[el.smask.asset] ?? mimeOf(el.smask);
    }
  };
  if (unit.source) out[unit.source.asset] = 'application/pdf';
  for (const p of unit.pages) for (const b of p.blocks) {
    add(b.elements);
    if (b.component?.type === 'image') out[b.component.image.asset] = mimeOf(b.component.image);
  }
  add(unit.template.exerciseHeader?.elements);
  add(unit.template.footer);
  add(unit.template.side);
  return out;
}

