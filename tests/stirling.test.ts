import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {checkAgainst, insertOrder, moveOrder, operationSchemas, pageRanges} from '../src/lib/stirling/operations';
import {pageHtml} from '../src/lib/stirling/page-html';
import {runOperation, stirlingConfig, stirlingErrorFor, StirlingError, isDocxBytes, standardSize} from '../src/lib/stirling/server';

const sample = new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures', 'import', 'sample.pdf')));
const docx = new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures', 'import', 'sample.docx')));

type Sent = {url: string; key: string | null; fields: Record<string, string[]>; files: string[]};

/** A stand-in for Stirling that records what was sent and answers with a PDF. */
function fakeStirling(answer: (sent: Sent) => Response = () => new Response(sample, {headers: {'Content-Type': 'application/pdf'}})) {
  const calls: Sent[] = [];
  const transport = (async (url: string, init: RequestInit) => {
    const form = init.body as FormData;
    const sent: Sent = {url, key: new Headers(init.headers).get('X-API-KEY'), fields: {}, files: []};
    for (const [k, v] of form.entries()) {
      if (typeof v === 'string') (sent.fields[k] ||= []).push(v);
      else sent.files.push((v as File).name);
    }
    calls.push(sent);
    return answer(sent);
  }) as unknown as typeof fetch;
  return {calls, transport};
}

function withKey<T>(fn: () => Promise<T>, url?: string) {
  const before = {key: process.env.STIRLING_API_KEY, url: process.env.STIRLING_API_URL};
  process.env.STIRLING_API_KEY = 'test-key';
  if (url) process.env.STIRLING_API_URL = url; else delete process.env.STIRLING_API_URL;
  return fn().finally(() => {
    if (before.key === undefined) delete process.env.STIRLING_API_KEY; else process.env.STIRLING_API_KEY = before.key;
    if (before.url === undefined) delete process.env.STIRLING_API_URL; else process.env.STIRLING_API_URL = before.url;
  });
}

const signal = () => AbortSignal.timeout(5000);

test('without a key nothing is sent and the studio says Stirling is not connected', async () => {
  delete process.env.STIRLING_API_KEY;
  assert.equal(stirlingConfig(), null);
  const {calls, transport} = fakeStirling();
  await assert.rejects(runOperation('rotate', {pages: [1], angle: 90}, sample, null, signal(), transport), (e: StirlingError) => e.code === 'STIRLING_NOT_CONFIGURED');
  assert.equal(calls.length, 0);
});

test('the key goes only in the server request header, to Stirling Cloud by default', async () => {
  await withKey(async () => {
    assert.equal(stirlingConfig()?.base, 'https://api.stirling.com');
    const {calls, transport} = fakeStirling();
    await runOperation('rotate', {pages: [1], angle: 90}, sample, null, signal(), transport);
    assert.equal(calls[0].url, 'https://api.stirling.com/api/v1/misc/auto-rotate-pdf');
    assert.equal(calls[0].key, 'test-key');
    assert.deepEqual(calls[0].fields, {'pageRotations[0].pageNumber': ['1'], 'pageRotations[0].rotation': ['90']});
  });
  // A plain-http address is refused unless it is this same machine outside production.
  await withKey(async () => { assert.equal(stirlingConfig(), null); }, 'http://stirling.example.com');
  await withKey(async () => { assert.equal(stirlingConfig()?.base, 'http://localhost:8090'); }, 'http://localhost:8090');
});

test('parameters are validated before anything reaches Stirling', async () => {
  await withKey(async () => {
    const {calls, transport} = fakeStirling();
    const code = (p: Promise<unknown>) => p.then(() => 'ok', (e: StirlingError) => e.code);
    // The sample PDF has 2 pages.
    assert.equal(await code(runOperation('remove', {pages: [3]}, sample, null, signal(), transport)), 'PAGE_OUT_OF_RANGE');
    assert.equal(await code(runOperation('remove', {pages: [1, 2]}, sample, null, signal(), transport)), 'CANNOT_REMOVE_ALL');
    assert.equal(await code(runOperation('reorder', {order: [1, 1]}, sample, null, signal(), transport)), 'INVALID_ORDER');
    assert.equal(await code(runOperation('rotate', {pages: [1], angle: 45}, sample, null, signal(), transport)), 'INVALID_REQUEST');
    assert.equal(await code(runOperation('rotate', {pages: [1], angle: 90, extra: 'x'}, sample, null, signal(), transport)), 'INVALID_REQUEST');
    assert.equal(await code(runOperation('rotate', {pages: [1], angle: 90}, docx, null, signal(), transport)), 'NOT_PDF');
    assert.equal(await code(runOperation('from-word', {}, sample, null, signal(), transport)), 'NOT_DOCX');
    assert.equal(await code(runOperation('insert-pdf', {after: 1}, sample, null, signal(), transport)), 'NOT_PDF');
    // An image block cannot go in a generated page (Stirling drops embedded images).
    assert.equal(await code(runOperation('insert-pages', {after: 1, blocks: [{type: 'image', id: 'i', prompt: 'x', alt: ''}]}, sample, null, signal(), transport)), 'INVALID_REQUEST');
    assert.equal(calls.length, 0, 'nothing was sent');
  });
});

test('composite operations: new pages are laid out, merged and moved into place on the server', async () => {
  await withKey(async () => {
    const {calls, transport} = fakeStirling();
    const result = await runOperation('insert-pages', {after: 1, blocks: [{type: 'heading', id: 'h', text: 'Упражне́ния', level: 1}]}, sample, null, signal(), transport);
    // The sample is US Letter: Stirling lays the page out in A4, then it is scaled to Letter.
    assert.deepEqual(calls.map(c => c.url.replace('https://api.stirling.com', '')), ['/api/v1/convert/html/pdf', '/api/v1/general/scale-pages', '/api/v1/general/merge-pdfs', '/api/v1/general/rearrange-pages']);
    assert.deepEqual(calls[1].fields.pageSize, ['LETTER']);
    assert.deepEqual(calls[2].fields.sortType, ['orderProvided']);
    assert.equal(calls[2].files.length, 2);
    // 2 own pages, 2 new ones (the fake answers with the 2-page sample) after page 1.
    assert.deepEqual(calls[3].fields.pageNumbers, ['1,3,4,2']);
    assert.equal(result.calls, 4);
    assert.equal(result.note, null);
  });
});

test('find and replace, notes, stamps and OCR send the fields Stirling 3.2.0 expects', async () => {
  await withKey(async () => {
    const {calls, transport} = fakeStirling();
    await runOperation('replace-text', {pages: [2], edits: [{find: 'Анна', replace: 'Мари́я'}]}, sample, null, signal(), transport);
    assert.deepEqual(calls[0].fields, {pageNumbers: ['2'], wholeWordSearch: ['false'], 'edits[0].find': ['Анна'], 'edits[0].replace': ['Мари́я']});
    await runOperation('note', {page: 1, x: 500, y: 760, text: 'Проверьте ударе́ние'}, sample, null, signal(), transport);
    assert.deepEqual(JSON.parse(calls[1].fields.comments[0])[0], {pageIndex: 0, x: 500, y: 760, width: 20, height: 20, text: 'Проверьте ударе́ние', author: 'PDF Studio', subject: 'Nota'});
    await runOperation('stamp', {pages: [1, 2], text: 'Черновик', position: 8, size: 18, color: '#216B5C', opacity: 1}, sample, null, signal(), transport);
    assert.equal(calls[2].fields.customMargin[0], 'medium');
    assert.equal(calls[2].fields.pageNumbers[0], '1,2');
    await runOperation('ocr', {languages: ['rus', 'eng']}, sample, null, signal(), transport);
    assert.deepEqual(calls[3].fields.languages, ['rus', 'eng']);
    assert.deepEqual(calls[3].fields.ocrType, ['skip-text']);
  });
});

test('Stirling answers become the studio\'s own errors', async () => {
  assert.equal(stirlingErrorFor(401, '').code, 'STIRLING_AUTH');
  assert.equal(stirlingErrorFor(402, '{"error":"PAYG_LIMIT_REACHED"}').code, 'STIRLING_LIMIT');
  assert.equal(stirlingErrorFor(400, '{"detail":"Invalid OCR languages format: none of the selected languages are valid"}').code, 'OCR_LANGUAGE_MISSING');
  assert.equal(stirlingErrorFor(500, '{"error":"Job failed: …"}').code, 'STIRLING_REJECTED');
  assert.equal(stirlingErrorFor(503, '').code, 'STIRLING_UNAVAILABLE');
  await withKey(async () => {
    const {transport} = fakeStirling(() => Response.json({error: 'PAYG_LIMIT_REACHED'}, {status: 402}));
    await assert.rejects(runOperation('rotate', {pages: [1], angle: 90}, sample, null, signal(), transport), (e: StirlingError) => e.code === 'STIRLING_LIMIT');
    // A JSON answer with status 200 is never taken as a PDF.
    const json = fakeStirling(() => Response.json({error: 'Job failed'}));
    await assert.rejects(runOperation('rotate', {pages: [1], angle: 90}, sample, null, signal(), json.transport), (e: StirlingError) => e.code === 'STIRLING_REJECTED');
  });
});

test('new pages are scaled to the document\'s size when it is a standard one', () => {
  assert.deepEqual(standardSize({width: 612, height: 792}), {name: 'LETTER', orientation: 'PORTRAIT'});
  assert.deepEqual(standardSize({width: 841.9, height: 595.3}), {name: 'A4', orientation: 'LANDSCAPE'});
  assert.deepEqual(standardSize({width: 420, height: 595}), {name: 'A5', orientation: 'PORTRAIT'});
  assert.equal(standardSize({width: 432, height: 648}), null, '6 × 9 in is not a size Stirling offers');
});

test('page orders and ranges', () => {
  assert.deepEqual(moveOrder(5, [4], 1), [1, 4, 2, 3, 5]);
  assert.deepEqual(moveOrder(5, [1, 2], 3), [3, 4, 5, 1, 2]);
  assert.deepEqual(moveOrder(3, [3], 0), [3, 1, 2]);
  assert.deepEqual(insertOrder(3, 2, 0), [4, 5, 1, 2, 3]);
  assert.deepEqual(insertOrder(3, 1, 3), [1, 2, 3, 4]);
  assert.equal(pageRanges([5, 1, 2, 3, 9]), '1–3, 5, 9');
  assert.deepEqual(checkAgainst('move', {pages: [2], after: 4}, 3), {ok: false, error: 'PAGE_OUT_OF_RANGE'});
  assert.ok(operationSchemas.ocr.safeParse({languages: ['rus']}).success);
  assert.ok(!operationSchemas.ocr.safeParse({languages: ['xyz']}).success);
});

test('generated pages escape the text and style every element inline (Stirling removes <style>)', () => {
  const html = pageHtml([
    {type: 'heading', id: 'a', text: '<script>alert(1)</script> Уро́к', level: 1},
    {type: 'table', id: 'b', headers: ['Сло́во', 'Перево́д'], rows: [['дом', 'casa']]},
    {type: 'exercise', id: 'c', instruction: 'Отве́тьте', items: ['Как вас зову́т?']},
  ], {accent: '#123456'});
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('Уро́к') && html.includes('Перево́д'), 'Cyrillic and stress marks are kept');
  assert.ok(!/<style/i.test(html));
  assert.ok(html.includes('color:#123456'));
  assert.ok(/<th style="[^"]*border/.test(html));
  assert.equal(isDocxBytes(docx), true);
});
