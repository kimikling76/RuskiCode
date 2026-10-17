import type {ImportedDoc} from './model';
import {htmlToNodes, parseHtml} from './html';

// Word (.docx) through mammoth, which turns the document's structure (headings, lists, tables, images)
// into simple HTML. The look (fonts, colors, positions) is not kept: the book uses the studio's design.

type Mammoth = typeof import('mammoth');

// Word's own "Title" and "Subtitle" styles, and headings with Spanish or Russian style names.
const styleMap = [
  "p[style-name='Title'] => h1.title:fresh",
  "p[style-name='Subtitle'] => p.subtitle:fresh",
  ...[1, 2, 3, 4].flatMap(n => [`p[style-name='Título ${n}'] => h${n}:fresh`, `p[style-name='Titulo ${n}'] => h${n}:fresh`, `p[style-name='Encabezado ${n}'] => h${n}:fresh`, `p[style-name='Заголовок ${n}'] => h${n}:fresh`]),
];

/** `input` is {arrayBuffer} in the browser and {buffer} in Node (tests). */
export async function readDocx(input: Parameters<Mammoth['convertToHtml']>[0], fileName: string, mammoth: Mammoth, image: (dataUrl: string) => Promise<string | null>): Promise<ImportedDoc> {
  let unsupported = 0;
  const result = await mammoth.convertToHtml(input, {
    styleMap,
    convertImage: mammoth.images.imgElement(async img => {
      const dataUrl = 'data:' + img.contentType + ';base64,' + await img.readAsBase64String();
      const usable = await image(dataUrl).catch(() => null);
      if (!usable) unsupported++;
      return {src: usable || ''};
    }),
  });
  const {nodes, notes} = htmlToNodes(parseHtml(result.value));
  // htmlToNodes already counts images without a usable source; keep one message about them.
  if (unsupported && !notes.some(n => n.includes('formato que el editor no puede mostrar'))) notes.push('Algunas imágenes están en un formato que el editor no puede mostrar.');
  if (result.messages.some(m => /comment|footnote|endnote/i.test(m.message))) notes.push('Los comentarios y las notas al pie de Word no se importan.');
  return {source: 'docx', fileName, nodes, notes};
}
