import type {ImportNode} from './model';

// A small HTML reader for well-formed markup: what mammoth writes for Word files, and what the browser's
// DOMParser gives back for an .html file. It needs no DOM, so it also runs in tests.

export type HtmlNode = {tag: string; attrs: Record<string, string>; children: HtmlNode[]} | {text: string};

const voids = new Set(['br', 'img', 'hr', 'meta', 'link', 'input', 'col', 'area', 'base', 'wbr', 'source', 'track', 'embed', 'param']);
const skipped = new Set(['script', 'style', 'noscript', 'template', 'svg', 'math', 'head', 'title', 'iframe', 'object', 'button', 'select', 'textarea', 'nav']);
// Opening one of these closes an open element of the same kind (as the HTML parser does).
const selfClosing: Record<string, string[]> = {p: ['p'], li: ['li'], tr: ['tr', 'td', 'th'], td: ['td', 'th'], th: ['td', 'th'], dt: ['dt', 'dd'], dd: ['dt', 'dd']};

const entities: Record<string, string> = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', middot: '·', bull: '•', copy: '©', shy: ''};
export function decode(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return entities[e.toLowerCase()] ?? m;
  });
}

export function parseHtml(html: string): HtmlNode[] {
  const root: {tag: string; attrs: Record<string, string>; children: HtmlNode[]} = {tag: 'root', attrs: {}, children: []};
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\?[^>]*>|<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)|</g;
  let m: RegExpExecArray | null;
  let skipping: string | null = null;
  while ((m = re.exec(html))) {
    const [token, closing, rawTag, rawAttrs, selfClose, text] = m;
    if (skipping) {
      if (closing && rawTag?.toLowerCase() === skipping) skipping = null;
      continue;
    }
    if (text !== undefined) { top().children.push({text: decode(text)}); continue; }
    if (!rawTag) { if (token === '<') top().children.push({text: '<'}); continue; }
    const tag = rawTag.toLowerCase();
    if (closing) {
      const at = stack.map(s => s.tag).lastIndexOf(tag);
      if (at > 0) stack.length = at;
      continue;
    }
    if (skipped.has(tag)) { if (!selfClose && !voids.has(tag)) skipping = tag; continue; }
    const closes = selfClosing[tag];
    if (closes) {
      const scope = tag === 'li' ? ['ul', 'ol'] : tag === 'tr' ? ['table', 'thead', 'tbody', 'tfoot'] : tag === 'td' || tag === 'th' ? ['tr'] : [];
      for (let i = stack.length - 1; i > 0; i--) {
        if (scope.includes(stack[i].tag)) break;
        if (closes.includes(stack[i].tag)) { stack.length = i; break; }
      }
    }
    const attrs: Record<string, string> = {};
    for (const a of (rawAttrs || '').matchAll(/([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? a[4] ?? '');
    const node = {tag, attrs, children: [] as HtmlNode[]};
    top().children.push(node);
    if (!voids.has(tag) && !selfClose) stack.push(node);
  }
  return root.children;
}

type El = Extract<HtmlNode, {tag: string}>;
const isEl = (n: HtmlNode): n is El => 'tag' in n;
const blockTags = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'body', 'html', 'blockquote', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'figure', 'figcaption', 'pre', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'dl', 'dt', 'dd', 'center', 'address', 'details', 'summary', 'form', 'fieldset', 'caption']);
const isBlock = (n: HtmlNode) => isEl(n) && (blockTags.has(n.tag) || n.tag === 'img');

/** Visible text; <br> becomes a line break, other whitespace collapses. */
function text(n: HtmlNode, pre = false): string {
  if (!isEl(n)) return pre ? n.text : n.text.replace(/\s+/g, ' ');
  if (n.tag === 'br') return '\n';
  if (n.tag === 'img') return '';
  // Footnote and comment markers that mammoth writes as links ([1]).
  if (n.tag === 'sup' && n.children.length === 1 && isEl(n.children[0]) && n.children[0].tag === 'a' && /^#/.test(n.children[0].attrs.href || '')) return '';
  return n.children.map(c => text(c, pre || n.tag === 'pre')).join('');
}

function images(n: HtmlNode, out: El[] = []): El[] {
  if (!isEl(n)) return out;
  if (n.tag === 'img') out.push(n);
  else for (const c of n.children) images(c, out);
  return out;
}

const onlyBold = (n: El) => {
  const visible = n.children.filter(c => !(!isEl(c) && !c.text.trim()));
  return visible.length === 1 && isEl(visible[0]) && ['strong', 'b'].includes(visible[0].tag);
};

export type HtmlResult = {nodes: ImportNode[]; notes: string[]};

export function htmlToNodes(tree: HtmlNode[]): HtmlResult {
  const nodes: ImportNode[] = [];
  let external = 0, broken = 0;

  const pushImages = (list: El[], caption = '') => {
    for (const img of list) {
      const src = img.attrs.src || '';
      if (/^data:image\/(png|jpeg|webp);base64,/.test(src)) nodes.push({kind: 'image', dataUrl: src, alt: caption || img.attrs.alt || ''});
      else if (src.startsWith('data:') || !src) broken++;
      else external++;
    }
  };
  const paragraph = (value: string, kind: 'paragraph' | 'callout' = 'paragraph') => {
    const t = value.replace(/[ \t]*\n[ \t]*/g, '\n').trim();
    if (t) nodes.push({kind, text: t});
  };

  function list(el: El, depth = 0): string[] {
    const items: string[] = [];
    for (const li of el.children.filter(isEl)) {
      if (li.tag !== 'li') { if (li.tag === 'ul' || li.tag === 'ol') items.push(...list(li, depth + 1)); continue; }
      const own = li.children.filter(c => !(isEl(c) && (c.tag === 'ul' || c.tag === 'ol')));
      const value = own.map(c => text(c)).join('').replace(/\s+/g, ' ').trim();
      if (value) items.push((depth ? '– ' : '') + value);
      for (const sub of li.children.filter((c): c is El => isEl(c) && (c.tag === 'ul' || c.tag === 'ol'))) items.push(...list(sub, depth + 1));
      pushImages(images({tag: 'li', attrs: {}, children: own}));
    }
    return items;
  }

  function table(el: El) {
    const rows: string[][] = [];
    const walk = (n: El) => {
      for (const c of n.children.filter(isEl)) {
        if (c.tag === 'tr') {
          const row: string[] = [];
          for (const cell of c.children.filter(isEl).filter(x => x.tag === 'td' || x.tag === 'th')) {
            row.push(text(cell).replace(/\s*\n\s*/g, ' ').trim());
            const span = Math.min(6, Math.max(1, parseInt(cell.attrs.colspan || '1', 10) || 1));
            for (let i = 1; i < span; i++) row.push('');
            pushImages(images(cell));
          }
          rows.push(row);
        } else if (['thead', 'tbody', 'tfoot'].includes(c.tag)) walk(c);
      }
    };
    walk(el);
    if (rows.length) nodes.push({kind: 'table', rows});
  }

  function walk(children: HtmlNode[]) {
    let inlineRun: HtmlNode[] = [];
    const flush = () => {
      if (!inlineRun.length) return;
      const holder: El = {tag: 'p', attrs: {}, children: inlineRun};
      paragraph(text(holder));
      pushImages(images(holder));
      inlineRun = [];
    };
    for (const n of children) {
      if (!isBlock(n)) { inlineRun.push(n); continue; }
      flush();
      const el = n as El;
      switch (el.tag) {
        case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
          const level = Math.min(3, Number(el.tag[1])) as 1 | 2 | 3;
          const t = text(el).replace(/\s+/g, ' ').trim();
          if (t) nodes.push({kind: 'heading', level, text: t, ...(/\btitle\b/.test(el.attrs.class || '') ? {title: true} : {})});
          pushImages(images(el));
          break;
        }
        case 'p': {
          const t = text(el).trim();
          // A short paragraph that is all bold and does not end like a sentence reads as a subheading.
          if (t && onlyBold(el) && t.length <= 80 && !/[.,;]$/.test(t) && !t.includes('\n')) nodes.push({kind: 'heading', level: 3, text: t});
          else paragraph(t, /\bsubtitle\b/.test(el.attrs.class || '') ? 'callout' : 'paragraph');
          pushImages(images(el));
          break;
        }
        case 'pre': paragraph(text(el, true)); break;
        case 'blockquote': {
          if (el.children.some(isBlock)) { const start = nodes.length; walk(el.children); for (let i = start; i < nodes.length; i++) { const x = nodes[i]; if (x.kind === 'paragraph') nodes[i] = {kind: 'callout', text: x.text}; } }
          else paragraph(text(el), 'callout');
          break;
        }
        case 'ul': case 'ol': {
          const items = list(el);
          if (items.length) nodes.push({kind: 'list', ordered: el.tag === 'ol', items});
          break;
        }
        case 'table': table(el); break;
        case 'img': pushImages([el]); break;
        case 'figure': {
          const caption = el.children.filter(isEl).find(c => c.tag === 'figcaption');
          pushImages(images(el), caption ? text(caption).trim() : '');
          const rest = el.children.filter(c => !(isEl(c) && (c.tag === 'figcaption' || c.tag === 'img')));
          if (rest.some(c => text(c).trim())) walk(rest);
          break;
        }
        case 'hr': break;
        case 'dt': {
          const t = text(el).trim();
          if (t) nodes.push({kind: 'heading', level: 3, text: t});
          break;
        }
        default: walk(el.children);
      }
    }
    flush();
  }

  walk(tree);
  const notes: string[] = [];
  if (external) notes.push((external === 1 ? 'Una imagen enlazada' : external + ' imágenes enlazadas') + ' a otra página no se importaron: el editor solo guarda imágenes dentro del libro.');
  if (broken) notes.push((broken === 1 ? 'Una imagen está' : broken + ' imágenes están') + ' en un formato que el editor no puede mostrar (por ejemplo EMF o WMF de Word). Guardalas como PNG o JPG y agregalas desde el editor.');
  return {nodes, notes};
}
