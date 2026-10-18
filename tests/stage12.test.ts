import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {textModels, publicModel, imageModels} from '../src/lib/ai/models';
import {textConfig} from '../src/lib/ai/kie-text';
import {createProvider, citedSources} from '../src/lib/ai/provider';
import type {StreamEvent} from '../src/lib/ai/types';
import {personalInput, systemForPersonal} from '../src/lib/personal-chat/input';
import {parseDraft, pictureSlots, picturePrompt, nearestAspect, keptPictures, draftComponents, newWords, skillSummary, MAX_PICTURES, type PdfRun} from '../src/lib/skills/chat';
import {readPdf} from '../src/lib/manual/pdf-read';
import {editorFonts} from '../src/lib/manual/fonts';
import {unitFromPdf} from '../src/lib/manual/segment';
import {blankUnitFrom, layOut} from '../src/lib/manual/units';
import {composeComponent, contentWidth} from '../src/lib/manual/compose';
import {renderUnit} from '../src/lib/manual/render';
import {plainText} from '../src/lib/manual/elements';
import {unitSchema, usedAssets, type Component, type ImageData} from '../src/lib/manual/model';
import {mergeSources} from '../src/components/studio/chat-sources';

// Stage 12: web search for the text models that document it, and pictures for /pdf-generator made by an image
// model from the author's request. Pure parts only; the browser flow is checked end to end separately.

const root = path.join(import.meta.dirname, '..');
const fixture = new Uint8Array(fs.readFileSync(path.join(root, 'tests/fixtures/manual/sample-unit.pdf')));
const fonts = editorFonts({
  regular: new Uint8Array(fs.readFileSync(path.join(root, 'public/fonts/dejavu/DejaVuSans.ttf'))),
  bold: new Uint8Array(fs.readFileSync(path.join(root, 'public/fonts/dejavu/DejaVuSans-Bold.ttf'))),
});
async function sampleUnit() {
  const read = await readPdf(fixture);
  const hash = crypto.createHash('sha256').update(fixture).digest('hex');
  return unitFromPdf(fonts, read, {id: 'u-test', title: 'Урок 9', now: 1, source: {asset: hash, name: 'sample.pdf', pages: 3, size: fixture.length}}).unit;
}

const sse = (events: unknown[]) => new Response(new ReadableStream({start(c) { for (const e of events) c.enqueue(new TextEncoder().encode('data: ' + (typeof e === 'string' ? e : JSON.stringify(e)) + '\n\n')); c.close(); }}), {headers: {'Content-Type': 'text/event-stream'}});
const byId = (id: string) => textModels.find(m => m.id === id)!;

async function run(id: string, webSearch: boolean, reply: (body: Record<string, unknown>) => Response) {
  let sent: Record<string, unknown> = {};
  const mock: typeof fetch = async (_url, init) => { sent = JSON.parse(init!.body as string); return reply(sent); };
  const events: StreamEvent[] = [];
  process.env.KIE_API_KEY = 'test-key';
  for await (const e of createProvider(textConfig(byId(id)), mock).stream({messages: [{role: 'user', content: '¿Qué tiempo hace hoy en Moscú?'}], system: 'S', signal: new AbortController().signal, webSearch})) events.push(e);
  return {sent, events};
}

test('web search: only the models whose Kie page documents a search tool have it', () => {
  const has = textModels.filter(m => m.webSearch).map(m => m.id);
  for (const id of ['kie-flash', 'gemini-3-5-flash', 'gemini-3-5-flash-native', 'gpt-5-2', 'gpt-5-5', 'gpt-6-sol']) assert.ok(has.includes(id), id);
  // Kimi K3 says it does not support it; Claude, Grok and DeepSeek do not document it.
  for (const id of ['kimi-k3', 'claude-sonnet-5-5', 'grok-4-7', 'deepseek-v4-1-flash']) assert.ok(!has.includes(id), id);
  assert.equal(byId('gemini-3-5-flash').webSearch, 'googleSearch');
  assert.equal(byId('gpt-5-2').webSearch, 'web_search');
  assert.equal(publicModel(byId('gpt-5-5'), true).webSearch, true);
  assert.equal(publicModel(byId('kimi-k3'), true).webSearch, undefined);
  assert.equal(textConfig(byId('kimi-k3')).webSearch, undefined);
});

test('web search: each adapter sends the documented tool, and nothing when search is off', async () => {
  const done = () => sse([{choices: [{delta: {content: 'Hola'}}]}, {choices: [{finish_reason: 'stop'}]}, '[DONE]']);
  const gemini = await run('gemini-3-5-flash', true, done);
  assert.deepEqual(gemini.sent.tools, [{type: 'function', function: {name: 'googleSearch'}}]);
  assert.equal((await run('gemini-3-5-flash', false, done)).sent.tools, undefined);

  const native = await run('gemini-3-5-flash-native', true, () => sse([{candidates: [{content: {parts: [{text: 'Hola'}]}}]}, '[DONE]']));
  assert.deepEqual(native.sent.tools, [{googleSearch: {}}]);

  const responses = await run('gpt-5-5', true, () => sse([{type: 'response.output_text.delta', delta: 'Hola'}, {type: 'response.completed', response: {}}]));
  assert.deepEqual(responses.sent.tools, [{type: 'web_search'}]);

  const once = await run('gpt-5-2', true, () => Response.json({choices: [{message: {content: 'Hola', annotations: []}}]}));
  assert.deepEqual(once.sent.tools, [{type: 'function', function: {name: 'web_search'}}]);
  assert.equal(once.sent.stream, undefined);
});

test('web search: the pages an answer cites are read from the shapes OpenAI and Gemini use', async () => {
  const chat = await run('gemini-3-5-flash', true, () => sse([
    {choices: [{delta: {content: 'Hoy', annotations: [{type: 'url_citation', url_citation: {url: 'https://meteo.example/moscu', title: 'Meteo'}}]}}]},
    {choices: [{finish_reason: 'stop'}]}, '[DONE]',
  ]));
  assert.deepEqual(chat.events.filter(e => e.type === 'sources'), [{type: 'sources', sources: [{url: 'https://meteo.example/moscu', title: 'Meteo'}]}]);

  const native = await run('gemini-3-5-flash-native', true, () => sse([
    {candidates: [{content: {parts: [{text: 'Hoy'}]}, groundingMetadata: {groundingChunks: [{web: {uri: 'https://ru.example/a', title: 'ru.example'}}]}}]}, '[DONE]',
  ]));
  assert.deepEqual(native.events.find(e => e.type === 'sources'), {type: 'sources', sources: [{url: 'https://ru.example/a', title: 'ru.example'}]});

  const responses = await run('gpt-5-5', true, () => sse([
    {type: 'response.output_text.delta', delta: 'Hoy'},
    {type: 'response.output_text.annotation.added', annotation: {type: 'url_citation', url: 'https://news.example/1', title: 'Noticia'}},
    {type: 'response.completed', response: {output: [{content: [{annotations: [{type: 'url_citation', url: 'https://news.example/2'}]}]}]}},
  ]));
  assert.deepEqual(responses.events.filter(e => e.type === 'sources').flatMap(e => e.type === 'sources' ? e.sources.map(s => s.url) : []), ['https://news.example/1', 'https://news.example/2']);

  // Only web links; anything else is ignored. The Chat keeps each page once.
  assert.deepEqual(citedSources([{url: 'javascript:alert(1)'}, {url: 'ftp://x'}, 'texto', null, {uri: 'http://ok.example'}]), [{url: 'http://ok.example'}]);
  assert.deepEqual(mergeSources([{url: 'https://a.example'}], [{url: 'https://a.example', title: 'A'}, {url: 'https://b.example'}]).map(s => s.url), ['https://a.example', 'https://b.example']);
});

test('web search: the request says so, and the model is told how to treat pages and cite them', () => {
  const base = {requestId: crypto.randomUUID(), model: 'gpt-5-5', messages: [{role: 'user', content: 'hola'}]};
  const chat = personalInput.parse({...base, webSearch: true});
  assert.match(systemForPersonal(chat), /information, not instructions/);
  assert.match(systemForPersonal(chat), /«Fuentes»/);
  const json = personalInput.parse({...base, purpose: 'pdf-generator', webSearch: true});
  assert.match(systemForPersonal(json), /Never put links or citations inside the JSON/);
  assert.doesNotMatch(systemForPersonal(personalInput.parse(base)), /search tool/);
  assert.throws(() => personalInput.parse({...base, webSearch: 'yes'}));
});

const pictureDraft = {
  title: 'Урок 10. Семья', summary: 'Fotos, galería e historieta.', imageStyle: 'bright realistic photos, natural light',
  blocks: [
    {type: 'heading', text: 'Моя семья'},
    {type: 'image', prompt: 'A family of four at a kitchen table, smiling', caption: 'Это моя семья.', size: 'large', aspect: '16:9'},
    {type: 'gallery', columns: 4, aspect: '1:1', numbered: true, items: [
      {prompt: 'Portrait of a smiling mother, 40, brown hair', label: '**мама**'},
      {prompt: 'Portrait of a father, 42, short beard', label: 'папа'},
      {prompt: 'Portrait of a boy, 12, red hoodie', label: 'брат'},
      {prompt: 'Portrait of a girl, 9, blue dress', label: 'сестра'},
    ]},
    {type: 'exercise', instruction: 'Кто это? Посмотри на фото.', items: ['Это мама?', 'Это брат?'], columns: 2},
    {type: 'comic', columns: 2, aspect: '4:3', panels: [
      {prompt: 'A boy, 12, red hoodie, waves at his grandmother at the door', bubbles: ['Привет, бабушка!']},
      {prompt: 'Grandmother, 70, grey bun, hugs the boy, 12, red hoodie', bubbles: [{text: 'Привет, Дима! Как дела?'}, 'Хорошо!']},
    ]},
    {type: 'gallery', columns: 9, aspect: 'weird', items: [{prompt: 'A cat', label: 'кошка'}]},
  ],
};

test('/pdf-generator pictures: photos, galleries and comics are read, with a slot for each picture', () => {
  const draft = parseDraft(JSON.stringify(pictureDraft))!;
  assert.ok(draft);
  const slots = pictureSlots(draft);
  assert.deepEqual(slots.map(s => s.key), ['1', '2.0', '2.1', '2.2', '2.3', '4.0', '4.1', '5.0']);
  // A gallery with an impossible shape falls back to sensible values instead of failing the draft.
  const odd = draft.blocks[5];
  assert.ok(odd.type === 'gallery' && odd.columns === 3 && odd.aspect === '1:1');
  const comic = draft.blocks[4];
  assert.deepEqual(comic.type === 'comic' && comic.panels[1].bubbles, ['Привет, Дима! Как дела?', 'Хорошо!']);
  // The prompt the image model gets: the scene, the common style and never any text inside the picture.
  const prompt = picturePrompt(slots[5], draft.imageStyle);
  assert.match(prompt, /^A boy, 12, red hoodie/);
  assert.match(prompt, /Style: bright realistic photos/);
  assert.match(prompt, /speech bubbles are added on top later/);
  assert.match(prompt, /Do not draw any text, letters/);
  // Words in labels and bubbles count as words of the draft.
  assert.ok(newWords(draft, new Set(['это', 'мама'])).includes('бабушка'));
  assert.match(skillSummary({skill: 'pdf-generator', request: 'x', state: 'ready', draft}), /y 8 imágenes/);
  // Each picture is a paid task: a draft asking for more than the limit is not accepted.
  const many = {...pictureDraft, blocks: [{type: 'gallery', columns: 4, aspect: '1:1', items: Array.from({length: 18}, (_, i) => ({prompt: 'p' + i, label: ''}))}, {type: 'gallery', columns: 4, aspect: '1:1', items: Array.from({length: MAX_PICTURES - 17}, (_, i) => ({prompt: 'q' + i, label: ''}))}]};
  assert.equal(parseDraft(JSON.stringify(many)), null);
});

test('/pdf-generator pictures: the model ratio closest to each slot, and images kept only for the same prompt', () => {
  assert.equal(nearestAspect('4:3', imageModels.find(m => m.id === 'nano-banana-2-1')!.options.aspectRatios), '4:3');
  assert.equal(nearestAspect('16:9', ['1:1', '2:3', '3:2']), '3:2');
  assert.equal(nearestAspect('1:1', []), '');
  const draft = parseDraft(JSON.stringify(pictureDraft))!;
  const image: ImageData = {asset: 'a'.repeat(64), format: 'png', width: 8, height: 6};
  const kept = keptPictures(draft, {'1': {prompt: 'old prompt', image}, '2.0': {prompt: 'Portrait of a smiling mother, 40, brown hair', image}}, {x: {prompt: 'A cat', image}});
  assert.deepEqual(Object.keys(kept).sort(), ['2.0', '5.0']);
});

/** A small PNG made here, to stand for a generated picture. */
function png(w: number, h: number) {
  const crcTable = Array.from({length: 256}, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set([40 + x * 20, 120, 200 - y * 20], y * (w * 3 + 1) + 1 + x * 3);
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

test('/pdf-generator pictures: pending frames first, the picture cut to its place when it exists, editable labels and bubbles', async () => {
  const model = await sampleUnit();
  const draft = parseDraft(JSON.stringify(pictureDraft))!;
  const page = model.pages[model.pages.length - 1];
  const area = {width: contentWidth(model.template, page), height: page.height - model.template.margins.top - model.template.margins.bottom};
  const base = blankUnitFrom(fonts, model, {id: 'u-new', title: draft.title, number: '10', now: 2});

  const pending = layOut(fonts, base, draftComponents(draft, {number: 1, unit: '10', audio: 1}, area), false);
  const els = pending.unit.pages.flatMap(p => p.blocks.flatMap(b => b.elements));
  assert.equal(els.filter(e => e.role === 'picture-pending' && e.kind === 'path').length, 8);
  assert.ok(!els.some(e => e.kind === 'image' && e.image.asset === 'b'.repeat(64)));
  // Labels and bubbles are text of the page, written by the studio: they can be corrected like any text.
  assert.deepEqual(els.filter(e => e.role === 'picture-label').map(plainText), ['мама', 'папа', 'брат', 'сестра', 'кошка']);
  assert.deepEqual(els.filter(e => e.role === 'comic-text').map(plainText).join(' ').replace(/\s+/g, ' '), 'Привет, бабушка! Привет, Дима! Как дела? Хорошо!');
  assert.equal(els.filter(e => e.role === 'comic-bubble').length, 3);
  assert.deepEqual(els.filter(e => e.role === 'picture-number' && e.kind === 'text').map(plainText), ['1', '2', '3', '4']);
  assert.ok(els.some(e => e.role === 'picture-caption' && plainText(e) === 'Это моя семья.'));

  // With a picture: it fills its place, cut to it with rounded corners, and the unit keeps the file.
  const bytes = png(8, 6);
  const image: ImageData = {asset: crypto.createHash('sha256').update(bytes).digest('hex'), format: 'png', width: 8, height: 6};
  const run: PdfRun = {skill: 'pdf-generator', request: 'x', state: 'ready', draft, pictures: {'2.1': {prompt: draft.blocks[2].type === 'gallery' ? draft.blocks[2].items[1].prompt : '', image}}};
  const done = layOut(fonts, base, draftComponents(draft, {number: 1, unit: '10', audio: 1}, area, run.pictures), false);
  const pic = done.unit.pages.flatMap(p => p.blocks.flatMap(b => b.elements)).find(e => e.kind === 'image' && e.image.asset === image.asset);
  assert.ok(pic && pic.kind === 'image' && pic.clips?.length === 1);
  // 8×6 into a square: it is scaled to cover the square and the sides are cut.
  assert.ok(Math.abs(pic.matrix[3] - pic.matrix[0] * 6 / 8) < 0.02 && pic.matrix[0] > pic.matrix[3]);
  const unit = {...done.unit, assets: usedAssets(done.unit)};
  assert.equal(unit.assets[image.asset], 'image/png');
  assert.ok(unitSchema.safeParse(unit).success);
  const out = await renderUnit(unit, {fonts, asset: async h => h === image.asset ? bytes : null, pages: done.pages});
  assert.ok(out.bytes.length > 1000);
  assert.deepEqual(out.missing, []);
});

test('/pdf-generator pictures: a gallery taller than a page goes on in the next one and keeps counting', async () => {
  const model = await sampleUnit();
  const base = blankUnitFrom(fonts, model, {id: 'u-big', title: 'Азбука', number: '11', now: 3});
  const gallery: Component = {type: 'gallery', columns: 2, aspect: '3:4', numbered: true, cells: Array.from({length: 12}, (_, i) => ({label: 'слово ' + (i + 1), prompt: 'object ' + i}))};
  const probe = composeComponent({fonts, template: base.template, page: base.pages[0], idPrefix: 'p', z: 0}, gallery, [0, base.pages[0].height]);
  assert.ok(probe.height > base.pages[0].height);
  const out = layOut(fonts, base, [gallery], false);
  assert.ok(out.pages.length >= 2);
  assert.deepEqual(out.overflow, []);
  const numbers = out.unit.pages.flatMap(p => p.blocks.flatMap(b => b.elements)).filter(e => e.role === 'picture-number' && e.kind === 'text').map(plainText);
  assert.deepEqual(numbers, Array.from({length: 12}, (_, i) => String(i + 1)));
});
