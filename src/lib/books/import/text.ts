import type {ImportNode} from './model';

const bullet = /^\s*(?:[-*+•·▪◦‣●○■□–]|(\d{1,3})[.)])\s+(.*)$/;

/** Markdown inline marks removed; the words stay. */
function inline(text: string) {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(?=\S)(.+?)(?<=\S)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\\([\\`*_{}[\]()#+\-.!|>])/g, '$1');
}

const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map(c => inline(c.trim()));

/**
 * Plain text and Markdown. Plain text keeps its line breaks inside a paragraph; Markdown joins wrapped lines.
 * Both read headings (#), lists, tables (|) and quotes (>) when they are there.
 */
export function textToNodes(source: string, markdown: boolean): {nodes: ImportNode[]; notes: string[]} {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const nodes: ImportNode[] = [];
  const notes: string[] = [];
  let paragraph: string[] = [];
  let remoteImages = 0;

  const flush = () => {
    if (!paragraph.length) return;
    const text = markdown ? paragraph.map(inline).join(' ').replace(/ {2,}/g, ' ') : paragraph.join('\n');
    if (text.trim()) nodes.push({kind: 'paragraph', text});
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) { flush(); continue; }

    const atx = markdown && line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (atx) {
      flush();
      nodes.push({kind: 'heading', level: Math.min(3, atx[1].length) as 1 | 2 | 3, text: inline(atx[2])});
      continue;
    }
    // Setext: a line underlined with === or ---.
    const next = lines[i + 1] || '';
    if (markdown && paragraph.length === 0 && /^\s*(=+|-+)\s*$/.test(next) && next.trim().length >= 3) {
      nodes.push({kind: 'heading', level: next.trim().startsWith('=') ? 1 : 2, text: inline(line.trim())});
      i++;
      continue;
    }

    if (line.includes('|') && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(next)) {
      flush();
      const rows = [cells(line)];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      i--;
      nodes.push({kind: 'table', rows});
      continue;
    }

    const item = line.match(bullet);
    if (item) {
      flush();
      const ordered = Boolean(item[1]);
      const items = [markdown ? inline(item[2]) : item[2]];
      while (i + 1 < lines.length) {
        const more = lines[i + 1].match(bullet);
        if (more && Boolean(more[1]) === ordered) { items.push(markdown ? inline(more[2]) : more[2]); i++; continue; }
        // An indented line continues the item above it.
        if (/^\s{2,}\S/.test(lines[i + 1]) && !more) { items[items.length - 1] += ' ' + lines[i + 1].trim(); i++; continue; }
        break;
      }
      nodes.push({kind: 'list', ordered, items});
      continue;
    }

    if (markdown && /^\s*>/.test(line)) {
      flush();
      const quote = [line.replace(/^\s*>\s?/, '')];
      while (i + 1 < lines.length && /^\s*>/.test(lines[i + 1])) quote.push(lines[++i].replace(/^\s*>\s?/, ''));
      nodes.push({kind: 'callout', text: quote.map(inline).join('\n')});
      continue;
    }

    if (markdown && /^\s*!\[[^\]]*\]\((?!data:)/.test(line)) remoteImages++;
    if (markdown && /^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); continue; }
    paragraph.push(markdown && /\s{2}$/.test(line) ? line.trim() + '\n' : line.trim());
  }
  flush();
  if (remoteImages) notes.push((remoteImages === 1 ? 'Una imagen enlazada' : remoteImages + ' imágenes enlazadas') + ' a otra página no se importaron: el editor solo guarda imágenes dentro del libro.');
  return {nodes, notes};
}
