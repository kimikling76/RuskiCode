import type {BookSpec} from '../spec';
import {newBook} from '../templates';
import {editableBookSchema, type EditableBook} from '../editable';
import type {Block} from '../../pipeline/types';

// Importing turns a document into the editor's blocks. Converters (PDF, Word, HTML, text) produce
// ImportNodes in reading order; buildBook() fits them into the book's limits and says what did not fit.
// The content is kept as written: nothing is rewritten, summarized or invented here.

export type ImportNode =
  | {kind: 'heading'; level: 1 | 2 | 3; text: string; title?: boolean}
  | {kind: 'paragraph'; text: string}
  | {kind: 'list'; ordered: boolean; items: string[]}
  | {kind: 'table'; rows: string[][]}
  | {kind: 'callout'; text: string}
  | {kind: 'image'; dataUrl: string; alt: string; page?: boolean};

export type ImportSource = 'pdf' | 'docx' | 'html' | 'markdown' | 'text';

export type ImportedDoc = {
  source: ImportSource;
  fileName: string;
  /** From the file's own metadata, when it has one. */
  title?: string;
  pages?: number;
  /** First page size in points (PDF). */
  pageSize?: {width: number; height: number};
  nodes: ImportNode[];
  /** What the converter could not keep, in words for the person. */
  notes: string[];
};

export type ImportReport = {
  chapters: {title: string; blocks: number}[];
  blocks: number;
  tables: number;
  images: number;
  notes: string[];
  /** False when part of the document did not fit in the editor. */
  complete: boolean;
};

export const limits = {chapters: 12, blocks: 100, text: 4000, assets: 24, tableColumns: 6, tableRows: 30};
const TEXT = 3800; // a little under the schema limit, so a split never lands exactly on it

const id = () => crypto.randomUUID();

/** Spaces and invisible characters cleaned; line breaks kept. */
export function clean(text: string) {
  return text
    .replace(/[​-‍﻿­]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t   ]+/g, ' ')
    .split('\n').map(l => l.trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Splits long text at paragraph, then sentence, then word boundaries. */
export function splitText(text: string, max = TEXT): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    let cut = window.lastIndexOf('\n\n');
    if (cut < max * 0.5) {
      const sentence = [...window.matchAll(/[.!?…»"”)](?=\s)/g)].pop();
      cut = sentence && sentence.index! > max * 0.5 ? sentence.index! + 1 : -1;
    }
    if (cut < max * 0.5) cut = window.lastIndexOf(' ');
    if (cut < max * 0.5) cut = max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** The book's language from its letters and most common words. */
export function detectLanguage(text: string): BookSpec['language'] {
  const sample = text.slice(0, 20000).toLowerCase();
  const cyrillic = (sample.match(/[а-яё]/g) || []).length;
  const latin = (sample.match(/[a-záéíóúñü]/g) || []).length;
  if (cyrillic > latin * 0.4) return 'ru';
  const count = (re: RegExp) => (sample.match(re) || []).length;
  const es = count(/\b(el|la|los|las|de|que|y|en|un|una|por|para|con|es|del)\b/g) + count(/[ñáéíóú¿¡]/g) * 2;
  const en = count(/\b(the|and|of|to|in|is|that|for|with|this|you|are)\b/g);
  return en > es ? 'en' : 'es';
}

/** The closest page format the editor offers, from a PDF page size in points. */
export function pageFormatFor(size?: {width: number; height: number}): BookSpec['pageFormat'] {
  if (!size) return 'A4';
  const w = Math.min(size.width, size.height), h = Math.max(size.width, size.height);
  const formats: [BookSpec['pageFormat'], number, number][] = [['A4', 595, 842], ['A5', 420, 595], ['6x9in', 432, 648]];
  const [best, bw, bh] = formats.reduce((a, f) => Math.hypot(f[1] - w, f[2] - h) < Math.hypot(a[1] - w, a[2] - h) ? f : a);
  return Math.abs(bw - w) / bw < 0.15 && Math.abs(bh - h) / bh < 0.15 ? best : 'A4';
}

const clip = (text: string, max = limits.text) => text.length > max ? text.slice(0, max - 1) + '…' : text;

type Built = {blocks: Block[]; assets: Record<string, string>; notes: string[]; tables: number; images: number};

/** Nodes → blocks, each within the block schema. */
export function nodesToBlocks(nodes: ImportNode[]): Built {
  const blocks: Block[] = [];
  const assets: Record<string, string> = {};
  const notes: string[] = [];
  let tables = 0, images = 0, skippedImages = 0, wideTables = 0, splitTables = 0, clipped = 0;

  for (const node of nodes) {
    switch (node.kind) {
      case 'heading': {
        const text = clean(node.text).replace(/\n+/g, ' ');
        if (!text) break;
        // A "heading" this long is a paragraph that was misread.
        if (text.length > 300) { for (const t of splitText(text)) blocks.push({type: 'paragraph', id: id(), text: t}); break; }
        blocks.push({type: 'heading', id: id(), level: node.level, text});
        break;
      }
      case 'paragraph':
      case 'callout': {
        const text = clean(node.text);
        if (!text) break;
        for (const t of splitText(text)) blocks.push({type: node.kind, id: id(), text: t});
        break;
      }
      case 'list': {
        const items = node.items.map(i => clean(i).replace(/\n+/g, ' ')).filter(Boolean);
        if (!items.length) break;
        // Lists stay as text with their markers: an «exercise» block would add meaning the document did not have.
        const lines = items.map((item, i) => (node.ordered ? i + 1 + '. ' : '• ') + item);
        let chunk: string[] = [];
        const flush = () => { if (chunk.length) blocks.push({type: 'paragraph', id: id(), text: chunk.join('\n')}); chunk = []; };
        for (const line of lines) {
          for (const piece of splitText(line)) {
            if (chunk.join('\n').length + piece.length + 1 > TEXT) flush();
            chunk.push(piece);
          }
        }
        flush();
        break;
      }
      case 'table': {
        const rows = node.rows.map(r => r.map(c => clean(c).replace(/\n+/g, ' '))).filter(r => r.some(Boolean));
        if (!rows.length) break;
        const columns = Math.max(...rows.map(r => r.length));
        if (rows.length < 2 || columns > limits.tableColumns) {
          if (columns > limits.tableColumns) wideTables++;
          const text = rows.map(r => r.filter(Boolean).join(' · ')).join('\n');
          for (const t of splitText(text)) blocks.push({type: 'paragraph', id: id(), text: t});
          break;
        }
        // Empty cells read «—»: every cell needs text.
        const pad = (r: string[]) => Array.from({length: columns}, (_, i) => {
          const cell = r[i] || '—';
          if (cell.length > limits.text) clipped++;
          return clip(cell);
        });
        const headers = pad(rows[0]);
        const body = rows.slice(1).map(pad);
        if (body.length > limits.tableRows) splitTables++;
        for (let i = 0; i < body.length; i += limits.tableRows) {
          blocks.push({type: 'table', id: id(), headers, rows: body.slice(i, i + limits.tableRows)});
          tables++;
        }
        break;
      }
      case 'image': {
        if (Object.keys(assets).length >= limits.assets) { skippedImages++; break; }
        const key = id();
        assets[key] = node.dataUrl;
        const alt = clip(clean(node.alt).replace(/\n+/g, ' '), 300);
        // The caption is printed only when the document had one; the prompt only matters to regenerate it.
        blocks.push({type: 'image', id: id(), prompt: alt || 'Imagen importada', alt, assetId: key, ...(node.page ? {fit: 'page' as const} : {})});
        images++;
        break;
      }
    }
  }
  if (skippedImages) notes.push(skippedImages === 1 ? 'Una imagen quedó afuera: el editor admite hasta ' + limits.assets + ' por libro.' : skippedImages + ' imágenes quedaron afuera: el editor admite hasta ' + limits.assets + ' por libro.');
  if (wideTables) notes.push((wideTables === 1 ? 'Una tabla tenía' : wideTables + ' tablas tenían') + ' más de ' + limits.tableColumns + ' columnas: quedaron como texto, una fila por renglón.');
  if (splitTables) notes.push((splitTables === 1 ? 'Una tabla larga se dividió' : splitTables + ' tablas largas se dividieron') + ' en partes de ' + limits.tableRows + ' filas, con los mismos encabezados.');
  if (clipped) notes.push('Algunas celdas muy largas se recortaron a ' + limits.text + ' caracteres.');
  return {blocks, assets, notes, tables, images};
}

type Section = {title: string; blocks: Block[]};

/** Chapters start at the document's top heading level (1 or 2). Fits the editor: 12 chapters of 100 blocks. */
export function chaptersFrom(blocks: Block[], fallbackTitle: string): {sections: Section[]; notes: string[]; complete: boolean} {
  const notes: string[] = [];
  const headings = blocks.filter((b): b is Extract<Block, {type: 'heading'}> => b.type === 'heading');
  const top = Math.min(...headings.map(h => h.level), 9);
  const level = top <= 2 ? top : 0;

  const sections: Section[] = [];
  let current: Section = {title: fallbackTitle, blocks: []};
  for (const b of blocks) {
    if (level && b.type === 'heading' && b.level === level) {
      if (current.blocks.length) sections.push(current);
      current = {title: b.text, blocks: []};
    }
    current.blocks.push(b);
  }
  if (current.blocks.length) sections.push(current);

  // A section longer than a chapter continues in the next one.
  let pieces: Section[] = sections.flatMap(s => {
    if (s.blocks.length <= limits.blocks) return [s];
    const out: Section[] = [];
    for (let i = 0; i < s.blocks.length; i += limits.blocks) out.push({title: i ? clip(s.title, 3990) + ' (cont.)' : s.title, blocks: s.blocks.slice(i, i + limits.blocks)});
    return out;
  });

  // More pieces than chapters: join the smallest neighbours while they fit.
  const before = pieces.length;
  while (pieces.length > limits.chapters) {
    let best = -1, size = Infinity;
    for (let i = 0; i < pieces.length - 1; i++) {
      const n = pieces[i].blocks.length + pieces[i + 1].blocks.length;
      if (n <= limits.blocks && n < size) { best = i; size = n; }
    }
    if (best < 0) break;
    pieces = [...pieces.slice(0, best), {title: pieces[best].title, blocks: [...pieces[best].blocks, ...pieces[best + 1].blocks]}, ...pieces.slice(best + 2)];
  }
  if (before > limits.chapters && pieces.length <= limits.chapters) notes.push('El documento tiene ' + before + ' secciones; se agruparon en ' + pieces.length + ' capítulos, el máximo del editor es ' + limits.chapters + '.');

  let complete = true;
  if (pieces.length > limits.chapters) {
    const left = pieces.slice(limits.chapters);
    const lost = left.reduce((n, p) => n + p.blocks.length, 0);
    notes.push('No entró todo: el editor admite ' + limits.chapters + ' capítulos de ' + limits.blocks + ' bloques. Quedaron afuera ' + lost + ' bloques, desde «' + clip(left[0].title, 80) + '». Podés importar el resto como otro libro.');
    pieces = pieces.slice(0, limits.chapters);
    complete = false;
  }
  return {sections: pieces, notes, complete};
}

const baseName = (file: string) => file.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[_]+/g, ' ').trim() || 'Documento importado';

export type BuildOptions = {title?: string; language?: BookSpec['language']; pageFormat?: BookSpec['pageFormat']};

/** The suggested title, language and format, before the person confirms them. */
export function suggestions(doc: ImportedDoc) {
  const titleNode = doc.nodes.find((n): n is Extract<ImportNode, {kind: 'heading'}> => n.kind === 'heading' && Boolean(n.title));
  const text = doc.nodes.map(n => n.kind === 'list' ? n.items.join(' ') : n.kind === 'table' ? n.rows.flat().join(' ') : n.kind === 'image' ? '' : n.text).join(' ');
  return {
    title: clip(clean(doc.title || titleNode?.text || baseName(doc.fileName)).replace(/\n+/g, ' '), 200),
    language: detectLanguage(text),
    pageFormat: pageFormatFor(doc.pageSize),
  };
}

/** The editable book, validated against the same schema the editor uses. */
export function buildBook(doc: ImportedDoc, options: BuildOptions = {}): {book: EditableBook; report: ImportReport} {
  const suggested = suggestions(doc);
  const title = clip(clean(options.title || suggested.title).replace(/\n+/g, ' '), 200) || 'Documento importado';
  // A heading used as the book title becomes the cover, not a page of its own.
  const nodes = doc.nodes.filter((n, i) => !(n.kind === 'heading' && n.title && i === doc.nodes.findIndex(x => x.kind === 'heading' && x.title)));
  const built = nodesToBlocks(nodes);
  if (!built.blocks.length) throw Error('IMPORT_EMPTY');
  const {sections, notes, complete} = chaptersFrom(built.blocks, title);

  const base = newBook({title, language: options.language || suggested.language, level: 'A1', pageFormat: options.pageFormat || suggested.pageFormat, goal: 'Documento importado de «' + clip(doc.fileName, 150) + '». Revisar y completar.'});
  const used = new Set(sections.flatMap(s => s.blocks).flatMap(b => b.type === 'image' && b.assetId ? [b.assetId] : []));
  const book = editableBookSchema.parse({
    spec: {...base.spec, estimatedChapters: sections.length, estimatedPages: Math.max(1, Math.min(500, doc.pages || Math.ceil(built.blocks.length / 8)))},
    chapters: sections.map(s => ({title: clip(s.title), summary: '—', blocks: s.blocks})),
    assets: Object.fromEntries(Object.entries(built.assets).filter(([k]) => used.has(k))),
  });
  const kept = sections.flatMap(s => s.blocks);
  return {
    book,
    report: {
      chapters: sections.map(s => ({title: s.title, blocks: s.blocks.length})),
      blocks: kept.length,
      tables: kept.filter(b => b.type === 'table').length,
      images: kept.filter(b => b.type === 'image').length,
      notes: [...doc.notes, ...built.notes, ...notes],
      complete,
    },
  };
}
