import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {buildBook, chaptersFrom, detectLanguage, nodesToBlocks, pageFormatFor, splitText, limits, type ImportNode, type ImportedDoc} from '../src/lib/books/import/model';
import {textToNodes} from '../src/lib/books/import/text';
import {htmlToNodes, parseHtml} from '../src/lib/books/import/html';
import {pagesToNodes, type PdfItem, type PdfPage} from '../src/lib/books/import/pdf-layout';
import {readPdfDocument} from '../src/lib/books/import/pdf';
import {readDocx} from '../src/lib/books/import/docx';
import {blockHtml} from '../src/lib/books/layout-html';
import type {Block} from '../src/lib/pipeline/types';

const fixtures = path.join(__dirname, 'fixtures', 'import');
const doc = (nodes: ImportNode[], extra: Partial<ImportedDoc> = {}): ImportedDoc => ({source: 'text', fileName: 'prueba.txt', nodes, notes: [], ...extra});
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

test('Markdown keeps headings, lists, tables and quotes; plain text keeps its line breaks', () => {
  const md = textToNodes('# Урок 1\n\nTexto con **negrita** y [un enlace](https://x.test)\nque sigue.\n\nVocabulario\n---\n\n| Слово | Перевод |\n|---|---|\n| дом | casa |\n\n- uno\n- dos\n  sigue dos\n\n1. primero\n2. segundo\n\n> Importante\n\n![foto](https://x.test/a.png)', true);
  assert.deepEqual(md.nodes, [
    {kind: 'heading', level: 1, text: 'Урок 1'},
    {kind: 'paragraph', text: 'Texto con negrita y un enlace que sigue.'},
    {kind: 'heading', level: 2, text: 'Vocabulario'},
    {kind: 'table', rows: [['Слово', 'Перевод'], ['дом', 'casa']]},
    {kind: 'list', ordered: false, items: ['uno', 'dos sigue dos']},
    {kind: 'list', ordered: true, items: ['primero', 'segundo']},
    {kind: 'callout', text: 'Importante'},
    {kind: 'paragraph', text: 'foto'},
  ]);
  assert.match(md.notes[0], /imagen enlazada/);
  const txt = textToNodes('— Привет!\n— Привет, Анна.\n\nОтдельный абзац.', false);
  assert.deepEqual(txt.nodes.map(n => n.kind === 'paragraph' ? n.text : ''), ['— Привет!\n— Привет, Анна.', 'Отдельный абзац.']);
});

test('blocks always fit the schema: long text, wide and long tables, empty cells, too many images', () => {
  const long = 'Предложение номер один. '.repeat(400);
  const pieces = splitText(long);
  assert.ok(pieces.length > 1 && pieces.every(p => p.length <= 3800 && p.endsWith('.')));
  assert.equal(pieces.join(' '), long.trim());

  const wide = {kind: 'table' as const, rows: [Array.from({length: 8}, (_, i) => 'c' + i), Array.from({length: 8}, (_, i) => 'v' + i)]};
  const tall = {kind: 'table' as const, rows: [['a', 'b'], ...Array.from({length: 65}, (_, i) => [String(i), ''])]};
  const images = Array.from({length: 26}, (_, i) => ({kind: 'image' as const, dataUrl: png, alt: i === 0 ? 'Рисунок' : ''}));
  const built = nodesToBlocks([wide, tall, ...images, {kind: 'heading', level: 1, text: 'x'.repeat(400)}]);
  assert.equal(built.blocks[0].type, 'paragraph', 'more than 6 columns: text rows');
  const tables = built.blocks.filter((b): b is Extract<Block, {type: 'table'}> => b.type === 'table');
  assert.deepEqual(tables.map(t => t.rows.length), [30, 30, 5]);
  assert.ok(tables.every(t => t.headers.join() === 'a,b'), 'each part repeats the headers');
  assert.equal(tables[0].rows[0][1], '—', 'empty cells read «—»');
  assert.equal(Object.keys(built.assets).length, limits.assets);
  const firstImage = built.blocks.find((b): b is Extract<Block, {type: 'image'}> => b.type === 'image')!;
  assert.equal(firstImage.alt, 'Рисунок');
  assert.equal(built.blocks.at(-1)!.type, 'paragraph', 'a 400-character «heading» is a paragraph');
  assert.ok(built.notes.some(n => n.includes('2 imágenes quedaron afuera')));
  assert.ok(built.notes.some(n => n.includes('más de 6 columnas')));
  assert.ok(built.notes.some(n => n.includes('partes de 30 filas')));
});

test('chapters start at the top heading level and stay within 12 chapters of 100 blocks', () => {
  const para = (t: string): Block => ({type: 'paragraph', id: crypto.randomUUID(), text: t});
  const head = (t: string, level: 1 | 2 | 3): Block => ({type: 'heading', id: crypto.randomUUID(), level, text: t});
  const simple = chaptersFrom([para('intro'), head('Урок 1', 2), para('a'), head('Детали', 3), para('b'), head('Урок 2', 2), para('c')], 'Libro');
  assert.deepEqual(simple.sections.map(s => [s.title, s.blocks.length]), [['Libro', 1], ['Урок 1', 4], ['Урок 2', 2]]);

  const many = chaptersFrom(Array.from({length: 20}, (_, i) => [head('Parte ' + i, 1), para('p')]).flat(), 'Libro');
  assert.equal(many.sections.length, 12);
  assert.ok(many.notes[0].includes('20 secciones'));
  assert.equal(many.complete, true);

  const huge = chaptersFrom(Array.from({length: 1300}, (_, i) => para('p' + i)), 'Libro');
  assert.equal(huge.sections.length, 12);
  assert.equal(huge.sections[1].title, 'Libro (cont.)');
  assert.equal(huge.complete, false);
  assert.ok(huge.notes.some(n => n.includes('Quedaron afuera 100 bloques')));
});

test('language and page format are suggested from the document', () => {
  assert.equal(detectLanguage('Это Миша. Миша — ученик.'), 'ru');
  assert.equal(detectLanguage('El alumno lee la lección y escribe en el cuaderno.'), 'es');
  assert.equal(detectLanguage('The student reads the lesson and writes in the notebook.'), 'en');
  assert.equal(pageFormatFor({width: 595, height: 842}), 'A4');
  assert.equal(pageFormatFor({width: 842, height: 595}), 'A4');
  assert.equal(pageFormatFor({width: 420, height: 595}), 'A5');
  assert.equal(pageFormatFor({width: 432, height: 648}), '6x9in');
  assert.equal(pageFormatFor({width: 200, height: 900}), 'A4');
});

test('the book is valid for the editor; a title heading becomes the cover', () => {
  const {book, report} = buildBook(doc([
    {kind: 'heading', level: 1, text: 'Мой учебник', title: true},
    {kind: 'heading', level: 2, text: 'Урок 1'}, {kind: 'paragraph', text: 'Это дом.'},
    {kind: 'image', dataUrl: png, alt: ''},
    {kind: 'heading', level: 2, text: 'Урок 2'}, {kind: 'list', ordered: true, items: ['раз', 'два']},
  ]));
  assert.equal(book.spec.title, 'Мой учебник');
  assert.equal(book.spec.language, 'ru');
  assert.ok(!book.chapters.flatMap(c => c.blocks).some(b => b.type === 'heading' && b.text === 'Мой учебник'));
  assert.deepEqual(book.chapters.map(c => c.title), ['Урок 1', 'Урок 2']);
  assert.ok(book.chapters.every(c => c.summary === '—'));
  assert.equal(report.images, 1);
  assert.equal(Object.keys(book.assets).length, 1);
  const list = book.chapters[1].blocks[1];
  assert.equal(list.type === 'paragraph' ? list.text : '', '1. раз\n2. два');
  assert.throws(() => buildBook(doc([])), /IMPORT_EMPTY/);
});

test('HTML: structure, bold subheadings, nested lists, colspan, quotes, images, scripts', () => {
  const tree = parseHtml('<h1 class="title">Título</h1><script>alert(1)</script><p>Uno &amp; dos<br>tres<p><strong>Ejercicio 1:</strong></p><ul><li>a<ul><li>a1</li></ul></li><li>b</ul><table><tr><th colspan="2">Cabeza</th></tr><tr><td>x</td><td>y</td></tr></table><blockquote>Nota</blockquote><figure><img src="' + png + '"><figcaption>Foto</figcaption></figure><img src="https://x.test/b.png" alt="externa">');
  const {nodes, notes} = htmlToNodes(tree);
  assert.deepEqual(nodes.map(n => n.kind === 'image' ? ['image', n.alt] : n.kind === 'table' ? ['table', n.rows] : n.kind === 'list' ? ['list', n.items] : [n.kind, n.text]), [
    ['heading', 'Título'], ['paragraph', 'Uno & dos\ntres'], ['heading', 'Ejercicio 1:'], ['list', ['a', '– a1', 'b']],
    ['table', [['Cabeza', ''], ['x', 'y']]], ['callout', 'Nota'], ['image', 'Foto'],
  ]);
  assert.equal((nodes[0] as {title?: boolean}).title, true);
  assert.match(notes[0], /imagen enlazada/);
});

test('PDF layout: repeated headers and page numbers go, hyphenation joins, two columns read in order, scans become images', () => {
  const item = (text: string, x: number, y: number, size = 10): PdfItem => ({text, x, y, w: text.length * size * 0.5, size});
  const page = (number: number, items: PdfItem[], scan?: string): PdfPage => ({number, width: 600, height: 800, items, images: [], scan});
  const pages = [1, 2, 3].map(n => page(n, [
    item('Русский код · A1', 50, 770, 8), item(String(n), 300, 30, 8),
    item('Страница ' + n + ': это длинная строка с перено-', 50, 600), item('сом слова в конце.', 50, 588),
  ]));
  const out = pagesToNodes(pages);
  assert.deepEqual(out.nodes.map(n => n.kind === 'paragraph' ? n.text : ''), [1, 2, 3].map(n => 'Страница ' + n + ': это длинная строка с переносом слова в конце.'));
  assert.ok(out.notes.some(n => n.includes('encabezados, pies y números de página')));

  // Two columns of body text with a 25 pt gutter (lines too long to be table cells).
  const left = Array.from({length: 6}, (_, i) => item('Izquierda línea ' + i + ' con texto de una columna', 50, 700 - i * 12));
  const right = Array.from({length: 6}, (_, i) => item('Derecha línea ' + i + ' con el texto de la otra', 320, 700 - i * 12));
  const columns = pagesToNodes([page(1, [...left, ...right])]);
  const text = columns.nodes.map(n => n.kind === 'paragraph' ? n.text : '').join(' ');
  assert.ok(text.indexOf('Izquierda línea 5') < text.indexOf('Derecha línea 0'), 'left column first');

  const scanned = pagesToNodes([page(1, [], png)]);
  assert.equal(scanned.nodes[0].kind, 'image');
  assert.equal((scanned.nodes[0] as {page?: boolean}).page, true);
  assert.deepEqual(scanned.scanned, [1]);
});

async function loadFixturePdf() {
  const require = createRequire(path.join(__dirname, '..', 'package.json'));
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const root = path.dirname(require.resolve('pdfjs-dist/package.json'));
  const task = pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(path.join(fixtures, 'sample.pdf'))),
    standardFontDataUrl: path.join(root, 'standard_fonts') + path.sep, cMapUrl: path.join(root, 'cmaps') + path.sep, cMapPacked: true,
    fontExtraProperties: true,
  });
  const document = await task.promise;
  try { return await readPdfDocument(document as never, 'sample.pdf', {OPS: pdfjs.OPS as never}); } finally { await task.destroy(); }
}

const summary = (nodes: ImportNode[]) => nodes.map(n => n.kind === 'heading' ? 'h' + n.level + ':' + n.text : n.kind === 'list' ? (n.ordered ? 'ol:' : 'ul:') + n.items.join('|') : n.kind === 'table' ? 'table:' + n.rows.length + 'x' + n.rows[0].length : n.kind === 'image' ? 'image:' + n.alt : n.kind + ':' + n.text.slice(0, 40));

test('a real PDF exported by LibreOffice (Cyrillic and Spanish) comes back as headings, table, lists and dialogue', async () => {
  const pdf = await loadFixturePdf();
  assert.equal(pdf.pages, 2);
  assert.equal(pdf.title, 'Русский код · Prueba de importación');
  const s = summary(pdf.nodes);
  assert.deepEqual(s.filter(x => !x.startsWith('paragraph:Абзац')), [
    'h1:Русский код · Prueba de importación', 'h2:Урок 1. Знакомство', 'paragraph:Это Миша. Миша — ученик. Это Маша. Маша ',
    'h3:Словарь', 'table:4x3', 'h3:Упражнение 1', 'ol:Прочитайте диалог.|Ответьте на вопросы.|Напишите три предложения.',
    'h3:Диалог', 'paragraph:— Привет! Как тебя зовут?\n— Меня зовут А', 'ul:Один пункт списка|Другой пункт списка', 'h2:Урок 2. Семья',
  ]);
  const first = pdf.nodes[2];
  assert.equal(first.kind === 'paragraph' ? first.text : '', 'Это Миша. Миша — ученик. Это Маша. Маша — ученица. Este párrafo mezcla ruso y español para comprobar que el texto llega completo, con sus acentos: ¿cómo estás? ¡Muy bien!');
  const table = pdf.nodes.find(n => n.kind === 'table');
  assert.deepEqual(table?.kind === 'table' ? table.rows[1] : [], ['учитель', 'profesor', 'Джон — учитель.']);
  const last = pdf.nodes.at(-1);
  assert.match(last?.kind === 'paragraph' ? last.text : '', /^Абзац 3 второго урока\. Это мама, это папа, это брат\./);
  const {book} = buildBook(pdf);
  assert.deepEqual(book.chapters.map(c => c.title), ['Урок 1. Знакомство', 'Урок 2. Семья']);
  assert.equal(book.spec.language, 'ru');
});

test('a real Word file: Title style, headings, table, numbered and bulleted lists, image with its alt text', async () => {
  const mammoth = (await import('mammoth')).default;
  const word = await readDocx({buffer: fs.readFileSync(path.join(fixtures, 'sample.docx'))}, 'sample.docx', mammoth, async d => d);
  assert.deepEqual(summary(word.nodes).filter(x => !x.startsWith('paragraph:Абзац')), [
    'h1:Русский код · Prueba de importación', 'h1:Урок 1. Знакомство', 'paragraph:Это Миша. Миша — ученик. Это Маша. Маша ',
    'h2:Словарь', 'table:4x3', 'h3:Упражнение 1', 'ol:Прочитайте диалог.|Ответьте на вопросы.|Напишите три предложения.',
    'h2:Диалог', 'paragraph:— Привет! Как тебя зовут?\n— Меня зовут А', 'ul:Один пункт списка|Другой пункт списка', 'image:Рисунок: класс', 'h1:Урок 2. Семья',
  ]);
  const {book, report} = buildBook(word);
  assert.equal(book.spec.title, 'Русский код · Prueba de importación');
  assert.deepEqual(book.chapters.map(c => c.title), ['Урок 1. Знакомство', 'Урок 2. Семья']);
  assert.equal(report.images, 1);
  assert.equal(report.tables, 1);
});

test('a full-page image fills the page and an image without caption prints none', () => {
  const html = blockHtml({type: 'image', id: 'i', prompt: 'x', alt: '', assetId: 'a', fit: 'page'}, {a: png});
  assert.match(html, /class="fit-page"/);
  assert.doesNotMatch(html, /figcaption/);
  assert.match(blockHtml({type: 'image', id: 'i', prompt: 'x', alt: 'Pie', assetId: 'a'}, {a: png}), /<figcaption>Pie<\/figcaption>/);
});
