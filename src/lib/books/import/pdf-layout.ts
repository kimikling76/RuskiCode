import type {ImportNode} from './model';

// A PDF has no paragraphs or headings, only positioned pieces of text. This turns them back into
// reading order: lines, columns, paragraphs, headings and lists, from positions and font sizes.
// Coordinates are PDF points with y growing upwards (baseline of each piece).

export type PdfItem = {text: string; x: number; y: number; w: number; size: number; bold?: boolean};
export type PdfImage = {top: number; bottom: number; dataUrl: string; alt?: string};
export type PdfPage = {number: number; width: number; height: number; items: PdfItem[]; images: PdfImage[]; scan?: string};

type Line = {text: string; x: number; xEnd: number; y: number; size: number; bold: boolean; page: number; zone: 'top' | 'bottom' | 'body'};
type Element = {line: Line} | {image: PdfImage; page: number} | {table: string[][]};

// Only lowercase letters as list markers: «A. Pushkin» is an initial, not an item.
// U+E000–F8FF: bullets drawn with symbol fonts (Wingdings, OpenSymbol).
const marker = /^(?:[•·▪◦‣●○■□✓✔➢►‒\uE000-\uF8FF-]|(\d{1,3}|[a-zа-я])[.)])\s+/;
const sentenceEnd = /[.!?…:;»"”)]$/;
const round = (n: number) => Math.round(n * 2) / 2;

type Word = {text: string; x: number; w: number; y: number; size: number; bold: boolean};

/**
 * Pieces → words with an estimated position. pdf.js joins the text of one font into a single piece, but
 * some programs (LibreOffice among them) write a line font by font: the punctuation in one font, the
 * Cyrillic words in another. Splitting pieces into words and sorting them by position puts each period
 * back where it was. Pieces made only of spaces mark gaps, not text.
 */
function words(items: PdfItem[]): Word[] {
  const out: Word[] = [];
  for (const it of items) {
    if (!it.text.trim() || it.size <= 0) continue;
    const per = it.w / Math.max(1, it.text.length);
    for (const m of it.text.matchAll(/\S+/g)) out.push({text: m[0], x: it.x + m.index! * per, w: m[0].length * per, y: it.y, size: it.size, bold: Boolean(it.bold)});
  }
  return out;
}

const closing = /^[.,;:!?…»”)\]%]/;
const opening = /[«“(\[]$/;

/** Words on the same baseline become a line; a wide gap (a column gutter or a table cell) starts another. */
export function buildLines(page: PdfPage): Line[] {
  const all = words(page.items).sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Word[][] = [];
  for (const w of all) {
    const row = rows.slice(-3).reverse().find(r => Math.abs(r[0].y - w.y) <= Math.max(1, 0.45 * Math.min(r[0].size, w.size)));
    if (row) row.push(w); else rows.push([w]);
  }
  const lines: Line[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    let current: Word[] = [];
    const flush = () => {
      if (!current.length) return;
      let text = '';
      let end = -Infinity;
      for (const w of current) {
        const gap = w.x - end;
        // Positions inside a piece are estimates, so punctuation follows the word before it, and a word
        // after punctuation gets its space back. Glued pieces (one word split in two) take no space.
        const afterPunct = /[.,;:!?…]$/.test(text) && /^\p{L}/u.test(w.text);
        if (text && (afterPunct || (!(gap < 0.08 * w.size) && !(closing.test(w.text) && gap < w.size) && !(opening.test(text) && gap < 0.3 * w.size)))) text += ' ';
        text += w.text;
        end = Math.max(end, w.x + w.w);
      }
      const chars = current.reduce((n, w) => n + w.text.length, 0) || 1;
      const size = current.reduce((n, w) => n + w.size * w.text.length, 0) / chars;
      const bold = current.reduce((n, w) => n + (w.bold ? w.text.length : 0), 0) / chars > 0.6;
      const y = current[0].y;
      const zone = y > page.height * 0.92 ? 'top' : y < page.height * 0.08 ? 'bottom' : 'body';
      lines.push({text, x: current[0].x, xEnd: end, y, size, bold, page: page.number, zone});
      current = [];
    };
    let end = -Infinity;
    for (const w of row) {
      // Word spaces are about a third of the font size; a column gutter or a cell gap is much wider.
      if (current.length && w.x - end > Math.max(1.8 * w.size, page.width * 0.03)) { flush(); end = -Infinity; }
      current.push(w);
      end = Math.max(end, w.x + w.w);
    }
    flush();
  }
  return lines;
}

type Table = {top: number; rows: string[][]; lines: Set<Line>};

/**
 * Rows of short pieces that line up in columns are a table. Long pieces side by side are two columns of
 * text, not a table, and are left to readingOrder().
 */
export function findTables(lines: Line[]): Table[] {
  const body = lines.filter(l => l.zone === 'body').sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Line[][] = [];
  for (const l of body) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].y - l.y) <= 0.5 * Math.min(row[0].size, l.size)) row.push(l); else rows.push([l]);
  }
  const cellular = (row: Line[]) => row.length >= 2 && row.every(l => l.text.length <= 60);
  const tables: Table[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (!cellular(rows[i])) continue;
    const head = [...rows[i]].sort((a, b) => a.x - b.x);
    const starts = head.map(l => l.x);
    const tol = 1.5 * head[0].size;
    const run = [head];
    let j = i + 1;
    for (; j < rows.length; j++) {
      const row = [...rows[j]].sort((a, b) => a.x - b.x);
      const prevY = run[run.length - 1][0].y;
      if (prevY - row[0].y > 3.2 * row[0].size) break;
      // Every piece must start in one of the header's columns (cells can be empty).
      // A row with a single piece is a line of text after the table, not a row with empty cells.
      if (row.length < Math.max(2, Math.ceil(starts.length / 2)) || row.length > starts.length || !row.every(l => starts.some(x => Math.abs(l.x - x) <= tol))) break;
      run.push(row);
    }
    const cells = run.flat();
    const average = cells.reduce((n, l) => n + l.text.length, 0) / cells.length;
    if (run.length >= 2 && (starts.length >= 3 || average <= 30)) {
      tables.push({
        top: head[0].y + head[0].size,
        rows: run.map(row => starts.map(x => row.filter(l => Math.abs(l.x - x) <= tol).map(l => l.text).join(' '))),
        lines: new Set(cells),
      });
      i = j - 1;
    }
  }
  return tables;
}

/** Two text columns are read left column first; lines that cross the middle (titles) separate the parts. */
export function readingOrder(lines: Line[], width: number): Line[] {
  const mid = width / 2;
  const left = lines.filter(l => l.xEnd < mid + width * 0.02);
  const right = lines.filter(l => l.x > mid - width * 0.02);
  const spanning = lines.filter(l => !left.includes(l) && !right.includes(l));
  const body = lines.filter(l => l.zone === 'body');
  const twoColumns = left.length >= 4 && right.length >= 4 && right.length >= body.length * 0.25 && spanning.length <= lines.length * 0.2;
  const byY = [...lines].sort((a, b) => b.y - a.y || a.x - b.x);
  if (!twoColumns) return byY;
  const out: Line[] = [];
  let segment: Line[] = [];
  const flush = () => {
    out.push(...segment.filter(l => left.includes(l)), ...segment.filter(l => !left.includes(l)));
    segment = [];
  };
  for (const l of byY) {
    if (spanning.includes(l)) { flush(); out.push(l); } else segment.push(l);
  }
  flush();
  return out;
}

const normalized = (t: string) => t.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
const pageNumber = /^(?:(?:p[aá]g(?:ina)?|page|стр(?:аница)?)\.?\s*)?[-–—]?\s*\d{1,4}\s*[-–—]?(?:\s*(?:\/|de|of|из)\s*\d{1,4})?$/i;

/** Lines repeated at the top or bottom of most pages (running headers, footers) and bare page numbers. */
function furniture(pages: Line[][]): Set<Line> {
  const remove = new Set<Line>();
  const counts = new Map<string, number>();
  for (const lines of pages) {
    const seen = new Set<string>();
    for (const l of lines) if (l.zone !== 'body') seen.add(l.zone + ':' + normalized(l.text));
    for (const k of seen) counts.set(k, (counts.get(k) || 0) + 1);
  }
  const repeated = pages.length >= 3 ? Math.max(2, Math.ceil(pages.length * 0.5)) : Infinity;
  for (const lines of pages) {
    for (const l of lines) {
      if (l.zone === 'body') continue;
      if (pageNumber.test(l.text) || (counts.get(l.zone + ':' + normalized(l.text)) || 0) >= repeated) remove.add(l);
    }
  }
  return remove;
}

function weightedMode(values: [number, number][]) {
  const totals = new Map<number, number>();
  for (const [v, w] of values) totals.set(v, (totals.get(v) || 0) + w);
  return [...totals].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 10;
}

export type PdfLayoutResult = {nodes: ImportNode[]; notes: string[]; scanned: number[]; empty: number[]};

export function pagesToNodes(pages: PdfPage[]): PdfLayoutResult {
  const perPage = pages.map(buildLines);
  const remove = furniture(perPage);
  const all = perPage.flat().filter(l => !remove.has(l));
  const body = weightedMode(all.map(l => [round(l.size), l.text.length]));

  // Typical distance between lines of body text, to tell a line break from a paragraph break.
  const steps: number[] = [];
  for (const lines of perPage) {
    const sorted = lines.filter(l => !remove.has(l) && Math.abs(l.size - body) < body * 0.1).sort((a, b) => b.y - a.y);
    for (let i = 1; i < sorted.length; i++) {
      const d = sorted[i - 1].y - sorted[i].y;
      if (d > body * 0.8 && d < body * 2.2) steps.push(d);
    }
  }
  steps.sort((a, b) => a - b);
  const step = steps.length ? steps[Math.floor(steps.length / 2)] : body * 1.2;

  const elements: Element[] = [];
  const scanned: number[] = [];
  const empty: number[] = [];
  pages.forEach((page, i) => {
    const kept = perPage[i].filter(l => !remove.has(l));
    const tables = findTables(kept);
    const inTable = new Set(tables.flatMap(t => [...t.lines]));
    const lines = readingOrder(kept.filter(l => !inTable.has(l)), page.width);
    const chars = kept.reduce((n, l) => n + l.text.replace(/\s/g, '').length, 0);
    if (page.scan && chars < 15) {
      scanned.push(page.number);
      elements.push({image: {top: page.height, bottom: 0, dataUrl: page.scan}, page: page.number});
      return;
    }
    if (!kept.length && !page.images.length) { empty.push(page.number); return; }
    const pageElements: Element[] = lines.map(line => ({line}));
    for (const t of tables) {
      const at = pageElements.findIndex(e => 'line' in e && e.line.y < t.top);
      pageElements.splice(at < 0 ? pageElements.length : at, 0, {table: t.rows});
    }
    for (const image of [...page.images].sort((a, b) => b.top - a.top)) {
      const at = pageElements.findIndex(e => 'line' in e && e.line.y < image.top);
      pageElements.splice(at < 0 ? pageElements.length : at, 0, {image, page: page.number});
    }
    elements.push(...pageElements);
  });

  // Lines → paragraphs.
  type Para = {lines: Line[]; size: number; bold: boolean};
  const paras: (Para | {image: PdfImage} | {table: string[][]})[] = [];
  let current: Para | null = null;
  for (const el of elements) {
    if ('image' in el) { current = null; paras.push({image: el.image}); continue; }
    if ('table' in el) { current = null; paras.push({table: el.table}); continue; }
    const l = el.line;
    const prev: Line | undefined = current?.lines[current.lines.length - 1];
    let start = !current || !prev;
    if (current && prev) {
      const sameFlow = prev.page === l.page && l.y < prev.y;
      const gap = prev.y - l.y;
      if (Math.abs(l.size - current.size) > current.size * 0.12) start = true;
      else if (l.bold !== current.bold) start = true;
      else if (marker.test(l.text)) start = true;
      else if (sameFlow && gap > step * 1.45) start = true;
      else if (!sameFlow && sentenceEnd.test(prev.text)) start = true;
      else if (sameFlow && sentenceEnd.test(prev.text) && l.x > current.lines[0].x + body * 1.2 && l.x - current.lines[0].x < body * 6) start = true;
      else if (sameFlow && sentenceEnd.test(prev.text) && current.lines.length > 1 && prev.xEnd - prev.x < 0.7 * Math.max(...current.lines.map(x => x.xEnd - x.x)) && !/^[—–]\s/.test(l.text)) start = true;
    }
    if (start) { current = {lines: [l], size: l.size, bold: l.bold}; paras.push(current); } else current!.lines.push(l);
  }

  const join = (lines: Line[]) => lines.reduce((acc, l) => {
    if (!acc) return l.text;
    // A word split with a hyphen at the end of a line is joined back.
    if (/[\p{L}][-‐]$/u.test(acc) && /^\p{Ll}/u.test(l.text)) return acc.slice(0, -1) + l.text;
    // A dialogue turn keeps its own line.
    if (/^[—–]\s/.test(l.text)) return acc + '\n' + l.text;
    return acc + ' ' + l.text;
  }, '');

  const headingSizes = [...new Set(paras.flatMap(p => 'lines' in p && p.size >= body * 1.18 ? [round(p.size)] : []))].sort((a, b) => b - a);
  const nodes: ImportNode[] = [];
  let list: Extract<ImportNode, {kind: 'list'}> | null = null;
  for (const p of paras) {
    if ('table' in p) { list = null; nodes.push({kind: 'table', rows: p.table}); continue; }
    if ('image' in p) { list = null; nodes.push({kind: 'image', dataUrl: p.image.dataUrl, alt: p.image.alt || '', ...(p.image.top - p.image.bottom > 500 ? {page: true} : {})}); continue; }
    const text = join(p.lines).trim();
    if (!text) continue;
    const m = text.match(marker);
    if (m) {
      const ordered = Boolean(m[1]);
      const item = text.slice(m[0].length);
      if (list && list.ordered === ordered) list.items.push(item);
      else { list = {kind: 'list', ordered, items: [item]}; nodes.push(list); }
      continue;
    }
    list = null;
    if (p.size >= body * 1.18 && text.length <= 200 && p.lines.length <= 3) {
      const rank = headingSizes.indexOf(round(p.size));
      nodes.push({kind: 'heading', level: (rank <= 0 ? 1 : rank === 1 ? 2 : 3) as 1 | 2 | 3, text});
    } else if (p.bold && p.lines.length === 1 && text.length <= 100 && !/[.,;]$/.test(text)) {
      nodes.push({kind: 'heading', level: 3, text});
    } else {
      nodes.push({kind: 'paragraph', text});
    }
  }

  // The largest heading, used once on the first page, is the document's title.
  const first = nodes.findIndex(n => n.kind === 'heading');
  const firstNode = nodes[first];
  if (firstNode?.kind === 'heading' && firstNode.level === 1 && nodes.filter(n => n.kind === 'heading' && n.level === 1).length === 1) {
    const firstLine = paras.find((p): p is Para => 'lines' in p && join(p.lines).trim() === firstNode.text);
    if (firstLine && firstLine.lines[0].page === pages[0]?.number) nodes[first] = {...firstNode, title: true};
  }

  const notes: string[] = [];
  if (remove.size) notes.push('Se quitaron los encabezados, pies y números de página que se repetían en cada página.');
  if (scanned.length) notes.push((scanned.length === 1 ? 'La página ' + scanned[0] + ' no tiene texto (parece escaneada): se agregó como imagen.' : 'Las páginas ' + scanned.slice(0, 8).join(', ') + (scanned.length > 8 ? '…' : '') + ' no tienen texto (parecen escaneadas): se agregaron como imágenes.') + ' Su texto no se puede editar.');
  if (empty.length) notes.push(empty.length === 1 ? 'La página ' + empty[0] + ' estaba vacía.' : empty.length + ' páginas estaban vacías.');
  notes.push('Las tablas se reconocen por cómo están alineadas; revisalas, porque el PDF no guarda qué es una tabla.');
  return {nodes, notes, scanned, empty};
}
