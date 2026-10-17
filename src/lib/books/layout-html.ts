// Book layout shared by the server PDF composer (Playwright) and the editor preview (browser iframe).
// Pure functions only: no Node or React imports, so both sides run exactly the same code.
import type {BookSpec} from './spec';
import type {Block} from '../pipeline/types';

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]!));
}

export type ImageMode = 'strict' | 'placeholder';

function imageSource(id: string | undefined, assets: Record<string, string>, mode: ImageMode) {
  const src = id ? assets[id] : undefined;
  if (src && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(src)) return src;
  if (mode === 'placeholder') return null;
  throw Error('MISSING_IMAGE_ASSET');
}

export function tableHtml(headers: string[], rows: string[][], attr = '') {
  return `<table ${attr}><thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

export function exerciseHtml(instruction: string | null, items: string[], start = 1, audioId?: string, attr = '') {
  const head = instruction === null ? '' : `<div class="exercise-head"><strong>${escapeHtml(instruction)}</strong>${audioId ? `<span class="audio">♪ ${escapeHtml(audioId)}</span>` : ''}</div>`;
  return `<section class="exercise${instruction === null ? ' exercise-continued' : ''}" ${attr}>${head}<ol${start > 1 ? ` start="${start}"` : ''}>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ol></section>`;
}

export function blockHtml(block: Block, assets: Record<string, string>, mode: ImageMode = 'strict') {
  const attr = `data-block-id="${escapeHtml(block.id)}"`;
  switch (block.type) {
    case 'heading': return `<h${block.level + 1} ${attr}>${escapeHtml(block.text)}</h${block.level + 1}>`;
    case 'paragraph': return `<p ${attr}>${escapeHtml(block.text).replace(/\n/g, '<br>')}</p>`;
    case 'callout': return `<aside class="callout" ${attr}>${escapeHtml(block.text)}</aside>`;
    case 'exercise': return exerciseHtml(block.instruction, block.items, 1, block.audioId, attr);
    case 'image': {
      const src = imageSource(block.assetId, assets, mode);
      if (!src) return `<figure ${attr}><div class="image-missing">${escapeHtml(block.alt)}</div><figcaption>${escapeHtml(block.alt)}</figcaption></figure>`;
      return `<figure ${attr}${block.fit === 'page' ? ' class="fit-page"' : ''}><img src="${src}" alt="${escapeHtml(block.alt)}">${block.alt ? `<figcaption>${escapeHtml(block.alt)}</figcaption>` : ''}</figure>`;
    }
    case 'table':
      if (block.rows.some(row => row.length !== block.headers.length)) throw Error('INVALID_TABLE_WIDTH');
      return tableHtml(block.headers, block.rows, attr);
    case 'writing': {
      const lines = Math.max(1, Math.min(10, Math.round(block.lines)));
      return `<section class="writing" ${attr}><div class="writing-model">${escapeHtml(block.text)}</div>${'<div class="writing-line"></div>'.repeat(lines)}</section>`;
    }
  }
}

export function dimensions(spec: BookSpec): [number, number] {
  return spec.pageFormat === 'A5' ? [148, 210] : spec.pageFormat === '6x9in' ? [152.4, 228.6] : [210, 297];
}

export function coverHtml(spec: BookSpec) {
  return `<div class="cover"><span class="cover-label">${escapeHtml(spec.level)}</span><h1>${escapeHtml(spec.title)}</h1><div class="cover-rule"></div><p class="subtitle">${escapeHtml(spec.subtitle)}</p><p class="author">${escapeHtml(spec.author)}</p></div>`;
}

// Noto Sans faces with the exact ranges each file covers (from @fontsource/noto-sans).
// The Cyrillic file carries U+0301, the combining acute used for Russian stress marks (заво́д).
export const bookFontFiles = [
  {file: 'noto-sans-cyrillic-400-normal.woff2', weight: 400, range: 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116'},
  {file: 'noto-sans-cyrillic-700-normal.woff2', weight: 700, range: 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116'},
  {file: 'noto-sans-latin-400-normal.woff2', weight: 400, range: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'},
  {file: 'noto-sans-latin-700-normal.woff2', weight: 700, range: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'},
] as const;

export function bookFontCss(source: (file: string) => string) {
  return bookFontFiles.map(f => `@font-face{font-family:BookSans;src:url(${source(f.file)}) format('woff2');font-weight:${f.weight};unicode-range:${f.range}}`).join('') + 'body{font-family:BookSans,Arial,sans-serif!important}';
}

export function renderHtml(spec: BookSpec) {
  const [trimW, trimH] = dimensions(spec);
  const w = trimW + 2 * spec.bleedMm, h = trimH + 2 * spec.bleedMm;
  const m = Object.fromEntries(Object.entries(spec.marginsMm).map(([k, v]) => [k, v + spec.bleedMm])) as BookSpec['marginsMm'];
  const d = spec.designTokens;
  return `<!doctype html><html lang="${spec.language}"><head><meta charset="UTF-8"><title>${escapeHtml(spec.title)}</title><style>@page{size:${w}mm ${h}mm;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Arial,'DejaVu Sans',sans-serif;font-size:${d.bodySizePt}pt;line-height:${d.lineHeight};color:#202727;background:white;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{width:${w}mm;height:${h}mm;position:relative;break-after:page;padding:${m.top + 9}mm ${m.right}mm ${m.bottom + 9}mm ${m.left}mm;overflow:hidden;background:white}.page:last-child{break-after:auto}.page-content{height:100%;display:flow-root}.page-header{position:absolute;top:${m.top}mm;left:${m.left}mm;right:${m.right}mm;font-size:8pt;color:${d.primary};display:flex;justify-content:space-between;letter-spacing:.7px}.page-footer{position:absolute;bottom:${m.bottom}mm;left:${m.left}mm;right:${m.right}mm;font-size:8pt;color:#66736d;display:flex;justify-content:space-between;border-top:1px solid #ccd7d0;padding-top:3mm}h2{font-size:${d.headingSizePt}pt;color:${d.primary};line-height:1.15;margin:0 0 7mm}h3{font-size:${Math.max(14, d.headingSizePt * .7)}pt;color:${d.primary};margin:5mm 0}h4{font-size:12pt;color:${d.primary};margin:4mm 0}p{white-space:normal;margin:0 0 5mm;orphans:3;widows:3;overflow-wrap:anywhere}.callout{border-left:3px solid ${d.accent};background:#eef4ef;padding:4mm;margin:0 0 6mm;white-space:pre-wrap}.exercise{margin:0 0 7mm}.exercise-head{border-top:2px solid ${d.primary};padding-top:3mm;display:flex;justify-content:space-between;gap:3mm;font-size:10pt}.exercise-continued{margin-top:0}.audio{white-space:nowrap;color:${d.accent}}ol{margin:4mm 0;padding-left:6mm;display:grid;grid-template-columns:repeat(${d.columns},1fr);gap:4mm 9mm}li{padding-left:1mm;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;margin:0 0 6mm;font-size:10pt;table-layout:fixed}th,td{border-bottom:1px solid #d9e0db;padding:3mm;text-align:left;overflow-wrap:anywhere}th{background:#edf3ee;color:${d.primary}}figure{margin:0 0 6mm;text-align:center}img{max-width:100%;max-height:55mm;object-fit:contain}.image-missing{display:flex;align-items:center;justify-content:center;height:40mm;border:1px dashed #b8c4bc;color:#7c8a82;font-size:9pt;padding:4mm}figcaption{font-size:8pt;color:#67746b;margin-top:2mm}figure.fit-page{margin:0}figure.fit-page img{max-height:${h - m.top - m.bottom - 18 - 10}mm}.writing{margin:0 0 6mm}.writing-model{font-size:20pt;letter-spacing:1.5mm;color:${d.primary};margin:0 0 2mm}.writing-line{height:12mm;border-bottom:.35mm solid #8f9c94;background:linear-gradient(to bottom,transparent 0,transparent 32%,#dfe5e1 32%,#dfe5e1 34%,transparent 34%,transparent 64%,#e8ece9 64%,#e8ece9 66%,transparent 66%)}.cover{padding-top:38mm}.cover-label{display:inline-block;background:${d.primary};padding:3mm 5mm;color:white;font-size:12pt}.cover h1{font-size:44pt;line-height:1.03;letter-spacing:-1.5px;color:${d.primary};margin:20mm 0 8mm}.cover .subtitle{font-size:17pt;max-width:125mm}.cover .author{margin-top:30mm;color:#66736d;font-size:12pt}.toc-row{display:flex;justify-content:space-between;gap:8mm;border-bottom:1px solid #d6e0d8;padding:4mm 0}.toc-row span:first-child{flex:1}.cover-rule{width:25mm;height:3mm;background:${d.accent};margin:15mm 0}.measurement{position:absolute;left:-10000px;top:0}</style></head><body></body></html>`;
}

export type PaginateInput = {
  input: {title: string; blocks: {block: Block; html: string}[]}[];
  footerTitle: string;
  coverHtml: string;
  level: string;
  language: string;
};
export type PaginateResult = {pages: {title: string; blocks: Block[]}[]; issues: {page: number; code: string}[]; count: number};

/**
 * Lays blocks into fixed-size pages by measuring them in a real document.
 * Self-contained on purpose: the server passes it to page.evaluate(), the editor calls it on an iframe body.
 * Every piece carries data-source with its original block id so the editor can map clicks back.
 */
export function paginateBook({input, footerTitle, coverHtml, language}: PaginateInput, root?: HTMLElement): PaginateResult {
  type B = Block;
  const body = root || document.body;
  const doc = body.ownerDocument;
  const view = doc.defaultView!;
  const pages: {title: string; blocks: B[]}[] = [];
  const starts: {title: string; page: number}[] = [];
  let current!: HTMLElement;
  let currentRecord!: {title: string; blocks: B[]};
  const sheets = () => body.querySelectorAll('.page').length;
  const fits = () => current.scrollHeight <= current.clientHeight + 1;
  const esc = (v: string) => v.replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]!));

  function make(title: string, record = true) {
    const sheet = doc.createElement('section'); sheet.className = 'page';
    const header = doc.createElement('header'); header.className = 'page-header'; header.textContent = footerTitle;
    const content = doc.createElement('div'); content.className = 'page-content';
    const footer = doc.createElement('footer'); footer.className = 'page-footer';
    const name = doc.createElement('span'); name.textContent = footerTitle;
    const number = doc.createElement('span'); number.textContent = String(sheets() + 1);
    footer.append(name, number);
    sheet.append(header, content, footer);
    body.append(sheet);
    if (record) { current = content; currentRecord = {title, blocks: []}; pages.push(currentRecord); }
    return content;
  }

  const cover = make('Cover', false);
  cover.innerHTML = coverHtml;
  for (let attempt = 0; attempt < 6 && cover.scrollHeight > cover.clientHeight + 1; attempt++) {
    const art = cover.querySelector<HTMLElement>('.cover')!;
    const title = art.querySelector<HTMLElement>('h1')!;
    const subtitle = art.querySelector<HTMLElement>('.subtitle')!;
    const author = art.querySelector<HTMLElement>('.author')!;
    const style = (el: Element) => view.getComputedStyle(el);
    art.style.paddingTop = Math.max(15, parseFloat(style(art).paddingTop) * .8) + 'px';
    title.style.fontSize = Math.max(20, parseFloat(style(title).fontSize) * .85) + 'px';
    title.style.marginTop = Math.max(15, parseFloat(style(title).marginTop) * .8) + 'px';
    subtitle.style.fontSize = Math.max(12, parseFloat(style(subtitle).fontSize) * .9) + 'px';
    author.style.marginTop = Math.max(15, parseFloat(style(author).marginTop) * .8) + 'px';
  }
  const contents = make('Contents', false);
  const heading = doc.createElement('h2');
  heading.textContent = language === 'ru' ? 'Содержание' : language === 'es' ? 'Contenido' : 'Contents';
  contents.append(heading);

  function piece(source: string, html: string) {
    const el = doc.createElement('div');
    el.setAttribute('data-source', source);
    el.innerHTML = html;
    return el;
  }

  // If a page ends with a heading, move that heading to the next page with what follows it.
  function newPageCarryingHeading(title: string) {
    let carry: Element | undefined;
    let carryBlock: B | undefined;
    if (currentRecord.blocks.length > 1 && currentRecord.blocks.at(-1)?.type === 'heading') {
      carry = current.lastElementChild!;
      carry.remove();
      carryBlock = currentRecord.blocks.pop()!;
    }
    make(title);
    if (carry && carryBlock) { current.append(carry); currentRecord.blocks.push(carryBlock); }
  }

  // Tables and exercises fill the current page row by row / item by item, then continue on the next page.
  function addInParts(block: B, title: string, source: string, count: number, html: (from: number, to: number) => string, part: (from: number, to: number) => B) {
    let from = 0;
    let n = 0;
    while (from < count) {
      let fitted = 0;
      for (let to = from + 1; to <= count; to++) {
        const el = piece(source, html(from, to));
        current.append(el);
        const ok = fits();
        el.remove();
        if (ok) fitted = to - from; else break;
      }
      if (!fitted) {
        const onlyHeading = currentRecord.blocks.length === 1 && currentRecord.blocks[0].type === 'heading';
        if (!currentRecord.blocks.length || onlyHeading) throw Object.assign(Error('UNSPLITTABLE_BLOCK'), {blockId: source});
        newPageCarryingHeading(title);
        continue;
      }
      current.append(piece(source, html(from, from + fitted)));
      currentRecord.blocks.push({...part(from, from + fitted), id: n ? block.id + '-' + n : block.id} as B);
      from += fitted;
      n++;
      if (from < count) make(title);
    }
  }

  function add(block: B, html: string, title: string, source = block.id) {
    if (currentRecord.blocks.length >= 30) make(title);
    const el = piece(source, html);
    current.append(el);
    if (fits()) { currentRecord.blocks.push(block); return; }
    el.remove();

    if (block.type === 'table' && block.rows.length > 1) {
      const attr = `data-block-id="${esc(block.id)}"`;
      const {headers, rows} = block;
      const table = (from: number, to: number) => `<table ${attr}><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.slice(from, to).map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      addInParts(block, title, source, rows.length, table, (from, to) => ({...block, rows: rows.slice(from, to)}));
      return;
    }
    if (block.type === 'exercise' && block.items.length > 1) {
      const attr = `data-block-id="${esc(block.id)}"`;
      const {instruction, items, audioId} = block;
      const list = (from: number, to: number) => {
        const head = from === 0 ? `<div class="exercise-head"><strong>${esc(instruction)}</strong>${audioId ? `<span class="audio">♪ ${esc(audioId)}</span>` : ''}</div>` : '';
        return `<section class="exercise${from ? ' exercise-continued' : ''}" ${attr}>${head}<ol${from ? ` start="${from + 1}"` : ''}>${items.slice(from, to).map(i => `<li>${esc(i)}</li>`).join('')}</ol></section>`;
      };
      addInParts(block, title, source, items.length, list, (from, to) => ({...block, items: items.slice(from, to)}));
      return;
    }

    if (currentRecord.blocks.length && !(currentRecord.blocks.length === 1 && currentRecord.blocks[0].type === 'heading')) {
      newPageCarryingHeading(title);
      current.append(el);
      if (fits()) { currentRecord.blocks.push(block); return; }
      el.remove();
    }
    if (block.type === 'paragraph' || block.type === 'callout') {
      const words = block.text.split(/\s+/);
      if (words.length < 2) throw Object.assign(Error('UNSPLITTABLE_BLOCK'), {blockId: source});
      const kind = block.type;
      let lo = 1, hi = words.length - 1, best = 0;
      while (lo <= hi) {
        const n = Math.floor((lo + hi) / 2);
        el.textContent = words.slice(0, n).join(' ');
        if (kind === 'callout') el.className = 'callout';
        current.append(el);
        const ok = fits();
        el.remove();
        if (ok) { best = n; lo = n + 1; } else hi = n - 1;
      }
      if (!best) throw Object.assign(Error('UNSPLITTABLE_BLOCK'), {blockId: source});
      const first = {...block, text: words.slice(0, best).join(' ')};
      el.textContent = first.text;
      current.append(el);
      currentRecord.blocks.push(first);
      make(title);
      const rest = {...block, id: block.id + '-continued', text: words.slice(best).join(' ')};
      const safe = doc.createElement(kind === 'paragraph' ? 'p' : 'aside');
      if (kind === 'callout') safe.className = 'callout';
      safe.textContent = rest.text;
      add(rest, safe.outerHTML, title, source);
      return;
    }
    throw Object.assign(Error('UNSPLITTABLE_BLOCK'), {blockId: source});
  }

  for (const ch of input) {
    make(ch.title);
    starts.push({title: ch.title, page: sheets()});
    for (const item of ch.blocks) add(item.block, item.html, ch.title);
  }
  for (const item of starts) {
    const row = doc.createElement('div'); row.className = 'toc-row';
    const title = doc.createElement('span'); title.textContent = item.title;
    const num = doc.createElement('span'); num.textContent = String(item.page);
    row.append(title, num);
    contents.append(row);
  }
  const issues: {page: number; code: string}[] = [];
  body.querySelectorAll<HTMLElement>('.page-content').forEach((content, i) => {
    if (content.scrollHeight > content.clientHeight + 1) issues.push({page: i + 1, code: 'OVERFLOW'});
    if (i > 1 && content.textContent!.trim().length < 40 && content.querySelectorAll('img, .writing').length === 0) issues.push({page: i + 1, code: 'SPARSE_PAGE'});
  });
  pages.forEach((p, i) => { if (p.blocks.at(-1)?.type === 'heading') issues.push({page: i + 3, code: 'ORPHAN_HEADING'}); });
  if (sheets() > 120) throw Error('PAGE_LIMIT');
  return {pages, issues, count: sheets()};
}
