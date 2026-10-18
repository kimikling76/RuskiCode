import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {PDFDocument, PDFName, PDFRawStream} from 'pdf-lib';
import {readPdf, type ReadResult} from '../src/lib/manual/pdf-read';
import {renderUnit} from '../src/lib/manual/render';
import {editorFonts} from '../src/lib/manual/fonts';
import {cleanup, unitFromPdf} from '../src/lib/manual/segment';
import {unitSchema, type Element, type Unit} from '../src/lib/manual/model';
import {composeComponent, nextExercise, parseMarkup, placeOnPage, wrapSpans} from '../src/lib/manual/compose';
import {addComponent, addPage, deletePage, editText, mapElement, moveBlock, replaceImage, restyle} from '../src/lib/manual/edit';
import {plainText, strokeReach} from '../src/lib/manual/elements';

// Manual engine (stage 10) on a synthetic unit made with ReportLab (scripts/manual-fixture.py): generic text, the
// same kinds of objects as the real manual.

const root = path.join(import.meta.dirname, '..');
const fixture = new Uint8Array(fs.readFileSync(path.join(root, 'tests/fixtures/manual/sample-unit.pdf')));
const fonts = editorFonts({
  regular: new Uint8Array(fs.readFileSync(path.join(root, 'public/fonts/dejavu/DejaVuSans.ttf'))),
  bold: new Uint8Array(fs.readFileSync(path.join(root, 'public/fonts/dejavu/DejaVuSans-Bold.ttf'))),
});
const sourceHash = crypto.createHash('sha256').update(fixture).digest('hex');
const texts = (els: Element[]) => els.filter(e => e.kind === 'text').map(plainText);

let readCache: ReadResult | null = null;
const read = async () => (readCache ??= await readPdf(fixture));
const assetsOf = (r: ReadResult) => async (h: string) => (h === sourceHash ? fixture : r.assets.get(h)?.bytes ?? null);
const meta = {id: 'u-test', title: 'Prueba', now: 1, source: {asset: sourceHash, name: 'sample-unit.pdf', pages: 3, size: fixture.length}};

/** A unit with every element of each page in one block, without cleanup: the plain round trip. */
function rawUnit(r: ReadResult): Unit {
  return {
    schemaVersion: 1, id: 'raw', title: 'raw', createdAt: 0, updatedAt: 0,
    pages: r.pages.map(p => ({
      id: 'p' + p.index, width: p.width, height: p.height, sourcePage: p.index,
      blocks: [{id: 'b' + p.index, kind: 'content', label: 'Todo', elements: p.elements}],
      ...(p.unsupported ? {conserved: {sourcePage: p.index, reason: p.unsupported}} : {}),
    })),
    template: {margins: {left: 28, right: 31, top: 32, bottom: 42}, gap: 14},
    source: meta.source,
    assets: {[sourceHash]: 'application/pdf', ...Object.fromEntries([...r.assets.keys()].map(k => [k, 'application/octet-stream' as const]))},
  };
}

/** Pages drawn with pdf.js (the browser's renderer), as RGBA pixels. */
async function raster(bytes: Uint8Array, scale = 1.5) {
  const {getDocument} = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const require = createRequire(import.meta.url);
  const pkg = path.dirname(require.resolve('pdfjs-dist/package.json'));
  const task = getDocument({data: bytes.slice(), useSystemFonts: false, standardFontDataUrl: path.join(pkg, 'standard_fonts') + path.sep, wasmUrl: path.join(pkg, 'wasm') + path.sep});
  const doc = await task.promise;
  const pages: Uint8ClampedArray[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({scale});
      const factory = doc.canvasFactory as unknown as {create(w: number, h: number): {canvas: HTMLCanvasElement; context: CanvasRenderingContext2D}};
      const t = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({canvasContext: t.context, viewport, canvas: t.canvas}).promise;
      pages.push(t.context.getImageData(0, 0, t.canvas.width, t.canvas.height).data);
    }
  } finally { await task.destroy(); }
  return pages;
}

/** Share of pixels that differ by more than 8 levels, and the largest difference. */
function difference(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  assert.equal(a.length, b.length);
  let over = 0, max = 0;
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
    if (d > 8) over++;
    if (d > max) max = d;
  }
  return {share: over / (a.length / 4), max};
}

async function imageStreams(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const out = new Set<string>();
  for (const [, o] of doc.context.enumerateIndirectObjects()) {
    if (o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')) out.add(crypto.createHash('sha256').update(o.contents).digest('hex'));
  }
  return out;
}

test('the reader takes every page apart: text with its stress marks, images, shapes; a gradient page is kept', async () => {
  const r = await read();
  assert.equal(r.pages.length, 3);
  const all = texts(r.pages[0].elements);
  assert.ok(all.includes('Урок 9. Тест'));
  assert.ok(all.some(t => t.includes('ла́мпа')), 'stress mark kept as written');
  assert.ok(all.includes('Анна — студентка. Олег тоже студент.'), 'touching pieces of a line become one line');
  assert.ok(all.includes('1. Это ла́мпа. → ________') && all.includes('4. Это стол. → ________'), 'two columns stay apart');
  const line = r.pages[0].elements.find(e => e.kind === 'text' && plainText(e).startsWith('Анна')) as Extract<Element, {kind: 'text'}>;
  assert.equal(line.spans.length, 3);
  assert.equal(line.spans[1].text, 'тоже');
  assert.deepEqual(line.spans[1].color.c.map(v => Math.round(v * 100) / 100), [0, 0.28, 0.8]);
  assert.ok(r.pages[0].elements.some(e => e.kind === 'image' && e.smask), 'the transparent photo keeps its mask');
  assert.ok(r.pages[0].elements.some(e => e.kind === 'image' && e.clips?.length), 'the rounded photo keeps its clip');
  assert.equal(r.pages[2].unsupported, 'Degradado (shading).');
});

test('round trip: the rebuilt PDF looks like the original, with the same image bytes, and is the same every time', async () => {
  const r = await read();
  const unit = rawUnit(r);
  assert.ok(unitSchema.safeParse(unit).success);
  const a = await renderUnit(unit, {fonts, asset: assetsOf(r)});
  const b = await renderUnit(unit, {fonts, asset: assetsOf(r)});
  assert.deepEqual(Buffer.from(a.bytes), Buffer.from(b.bytes), 'deterministic');
  assert.deepEqual(a.missing, []);
  const original = await imageStreams(fixture);
  const rebuilt = await imageStreams(a.bytes);
  for (const h of original) assert.ok(rebuilt.has(h), 'image stream copied byte for byte');
  const [o, n] = await Promise.all([raster(fixture), raster(a.bytes)]);
  for (let i = 0; i < o.length; i++) {
    const d = difference(o[i], n[i]);
    assert.ok(d.share < 0.001 && d.max < 96, `page ${i + 1}: ${(d.share * 100).toFixed(4)} % differ, max ${d.max}`);
  }
});

test('cleanup removes the old text hidden under a white patch and the patch, without changing the page', async () => {
  const r = await read();
  const page = r.pages[0];
  const c = cleanup(fonts, page.elements);
  assert.ok(texts(page.elements).includes('1. Старый текст с ошибкой.'));
  assert.ok(!texts(c.elements).includes('1. Старый текст с ошибкой.'), 'hidden text removed');
  assert.ok(texts(c.elements).includes('1. Это новый текст.'), 'the corrected line stays');
  assert.equal(c.hidden, 1);
  assert.equal(c.covers, 1);
  const {unit} = unitFromPdf(fonts, r, meta);
  const out = await renderUnit(unit, {fonts, asset: assetsOf(r)});
  const [o, n] = await Promise.all([raster(fixture), raster(out.bytes)]);
  for (let i = 0; i < o.length; i++) {
    const d = difference(o[i], n[i]);
    assert.ok(d.share < 0.001 && d.max < 96, `page ${i + 1}: ${(d.share * 100).toFixed(4)} % differ, max ${d.max}`);
  }
});

test('mitred corners reach further than half the line width; rounded shapes do not', () => {
  const square: Parameters<typeof strokeReach>[0] = [['M', 0, 0], ['L', 10, 0], ['L', 10, 10], ['L', 0, 10], ['Z']];
  assert.ok(Math.abs(strokeReach(square, {width: 2}) - Math.SQRT2) < 1e-6);
  const spike: Parameters<typeof strokeReach>[0] = [['M', 0, 0], ['L', 10, 1], ['L', 0, 2]];
  assert.equal(strokeReach(spike, {width: 2, miter: 4}), 1, 'past the mitre limit the corner is bevelled');
  const arc: Parameters<typeof strokeReach>[0] = [['M', 0, 0], ['C', 0, 5, 10, 5, 10, 0]];
  assert.equal(strokeReach(arc, {width: 2}), 1);
});

test('import: blocks per exercise, locked page furniture, template taken from the pages', async () => {
  const {unit, report} = unitFromPdf(fonts, await read(), meta);
  assert.ok(unitSchema.safeParse(unit).success);
  assert.equal(report.editablePages, 2);
  assert.equal(report.conservedPages, 1);
  assert.equal(unit.pages[2].conserved?.sourcePage, 2);
  const kinds = unit.pages[0].blocks.map(b => b.kind + (b.locked ? '🔒' : ''));
  assert.deepEqual(kinds, ['title', 'section', 'section', 'footer🔒', 'side🔒']);
  assert.equal(unit.pages[0].blocks[1].label, 'Ejercicio 1 · 9.01 · Скажи по образцу. Используй «тоже».');
  assert.equal(unit.pages[0].blocks[2].label, 'Ejercicio 2 · 9.02 · Посмотри и скажи.');
  assert.ok(unit.pages[0].blocks[3].elements.some(e => e.role === 'page-number' && plainText(e) === '5'));
  assert.equal(unit.number, '9');
  const t = unit.template;
  assert.equal(t.item?.font, 'regular');
  assert.equal(t.item?.size, 10.5);
  assert.equal(t.example?.font, 'bold');
  assert.equal(t.example?.size, 11);
  assert.deepEqual(t.highlight?.color.c.map(v => Math.round(v * 100) / 100), [0, 0.28, 0.8]);
  assert.equal(t.itemPitch, 22);
  assert.equal(t.columnOffset, 275);
  assert.deepEqual(t.exerciseHeader?.elements.map(e => e.role), ['ex-band', 'ex-badge', 'ex-number', 'ex-icon', 'ex-icon', 'ex-icon', 'ex-audio', 'ex-instruction']);
  assert.equal(t.heading?.size, 25);
});

test('new content: an exercise drawn like the template, numbered after the last one, placed under the last block', async () => {
  const r = await read();
  let {unit} = unitFromPdf(fonts, r, meta);
  const next = nextExercise(unit);
  assert.deepEqual(next, {number: '4', audio: '9.04'});
  const exercise = {type: 'exercise' as const, ...next, instruction: 'Скажи по образцу. Используй ==«не»==.', example: ['Это кот? — Нет, это **не** кот.'], items: ['Это дом?', 'Это парк?', 'Это стол?'], columns: 2 as const};
  const page = unit.pages[1];
  const probe = composeComponent({fonts, template: unit.template, page, idPrefix: 'x', z: 0}, exercise, [0, 800]);
  const at = placeOnPage(fonts, unit.template, page, probe.height);
  assert.ok(at && at[1] < 740 && at[0] === unit.template.margins.left);
  const added = addComponent(fonts, unit, page.id, exercise, at!);
  unit = added.unit;
  assert.equal(added.overflow, false);
  const els = added.block!.elements;
  assert.equal(plainText(els.find(e => e.role === 'ex-number')!), '4');
  assert.equal(plainText(els.find(e => e.role === 'ex-audio')!), '9.04');
  const instruction = els.find(e => e.role === 'ex-instruction') as Extract<Element, {kind: 'text'}>;
  assert.deepEqual(instruction.spans.map(s => s.text), ['Скажи по образцу. Используй ', '«не»', '.']);
  const items = els.filter(e => e.role === 'ex-item') as Extract<Element, {kind: 'text'}>[];
  assert.deepEqual(items.map(plainText), ['1. Это дом?', '2. Это парк?', '3. Это стол?']);
  assert.equal(items[2].x - items[0].x, 275, 'second column');
  assert.equal(items[0].y - items[1].y, 22, 'item pitch');
  const out = await renderUnit(unit, {fonts, asset: assetsOf(r), pages: [1]});
  assert.deepEqual(out.overflows, []);
  const doc = await PDFDocument.load(out.bytes);
  assert.equal(doc.getPageCount(), 1);
});

test('markup, wrapping and text edits keep the style of every letter', async () => {
  assert.deepEqual(parseMarkup('Это **тоже** ==кот== и 2 ** 3'), [
    {text: 'Это ', bold: false, highlight: false}, {text: 'тоже', bold: true, highlight: false}, {text: ' ', bold: false, highlight: false},
    {text: 'кот', bold: false, highlight: true}, {text: ' и 2 ** 3', bold: false, highlight: false},
  ]);
  const base = {text: '', font: 'regular' as const, size: 10, color: {space: 'gray' as const, c: [0]}};
  const lines = wrapSpans(fonts, [{...base, text: 'Это школа. Это Анна. Анна — учительница. Это Олег.'}], 120);
  assert.ok(lines.length >= 3 && lines.every(l => !l[l.length - 1].text.endsWith(' ')));
  const {unit} = unitFromPdf(fonts, await read(), meta);
  const page = unit.pages[0];
  const line = page.blocks.flatMap(b => b.elements).find(e => plainText(e).startsWith('Анна')) as Extract<Element, {kind: 'text'}>;
  const edited = editText(line, 'Анна — студентка. Олег тоже студент МГУ.');
  assert.deepEqual(edited.spans.map(s => s.text), ['Анна — студентка. Олег ', 'тоже', ' студент МГУ.']);
  assert.equal(edited.spanX, undefined, 'edited text flows from its start');
  assert.deepEqual(edited.spans[1].color, line.spans[1].color, 'the highlight stays on its word');
  const bold = restyle(edited, 0, 4, 'regular', unit.template);
  assert.equal(bold.spans[0].font, 'regular');
  assert.equal(bold.spans[0].text, 'Анна');
  const lit = restyle(edited, 0, 4, 'highlight', unit.template);
  assert.deepEqual(lit.spans[0].color, unit.template.highlight!.color);
  const moved = moveBlock(unit, page.id, page.blocks[1].id, 0, -10);
  const before = page.blocks[1].elements[0], after = moved.pages[0].blocks[1].elements[0];
  assert.equal(before.kind === 'path' && after.kind === 'path' && (after.ops[0][2] as number) - (before.ops[0][2] as number), -10);
});

test('pages: a new page gets the frame and the next page number; deleting renumbers', async () => {
  let {unit} = unitFromPdf(fonts, await read(), meta);
  const added = addPage(fonts, unit, 0);
  unit = added.unit;
  const numbers = () => unit.pages.map(p => p.blocks.flatMap(b => b.elements).filter(e => e.role === 'page-number').map(plainText)[0] ?? null);
  assert.deepEqual(numbers(), ['5', '6', '7', null]);
  assert.ok(added.page.blocks.some(b => b.kind === 'side'), 'the side tab of the page it follows');
  unit = deletePage(fonts, unit, 1);
  assert.deepEqual(numbers(), ['5', '6', null]);
});

test('replacing a photo fills the same box without deforming it', async () => {
  const {unit} = unitFromPdf(fonts, await read(), meta);
  const page = unit.pages[0];
  const photo = page.blocks.flatMap(b => b.elements).find(e => e.kind === 'image' && e.clips?.length) as Extract<Element, {kind: 'image'}>;
  const next = replaceImage(unit, page.id, photo.id, {asset: 'a'.repeat(64), format: 'jpeg', width: 400, height: 400});
  const el = next.pages[0].blocks.flatMap(b => b.elements).find(e => e.id === photo.id) as Extract<Element, {kind: 'image'}>;
  assert.equal(el.matrix[0], el.matrix[3], 'square stays square');
  assert.equal(el.matrix[0], 120, 'covers the 120 × 90 box');
  assert.deepEqual(el.clips, photo.clips, 'rounded corners kept');
  assert.ok(unitSchema.safeParse(mapElement(next, page.id, photo.id, e => e)).success);
});

test('a missing image is left out and reported instead of failing the export', async () => {
  const r = await read();
  const unit = rawUnit(r);
  const lost = [...r.assets.keys()][0];
  const out = await renderUnit(unit, {fonts, asset: async h => (h === lost ? null : assetsOf(r)(h))});
  assert.deepEqual(out.missing, [lost]);
  assert.equal((await PDFDocument.load(out.bytes)).getPageCount(), 3);
});
