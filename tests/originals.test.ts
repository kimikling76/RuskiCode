import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {isPdf, fileSize, SYNC_LIMIT} from '../src/lib/books/originals';
import {pushSchema, assetMimes, MAX_ASSET_BYTES} from '../src/lib/sync/server';

const bytes = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

test('only real PDFs are kept as originals', () => {
  assert.equal(isPdf(bytes(fs.readFileSync(path.join(__dirname, 'fixtures', 'import', 'sample.pdf')))), true);
  assert.equal(isPdf(bytes(fs.readFileSync(path.join(__dirname, 'fixtures', 'import', 'sample.docx')))), false);
  // Some PDFs carry a few bytes before the header; it must be within the first kilobyte.
  assert.equal(isPdf(bytes(Buffer.concat([Buffer.from('\n\n'), Buffer.from('%PDF-1.7\n')]))), true);
  assert.equal(isPdf(new ArrayBuffer(0)), false);
});

test('sizes read naturally and the sync limit matches what the server accepts', () => {
  assert.equal(fileSize(22_892), '23 KB');
  assert.equal(fileSize(300), '1 KB');
  assert.equal(fileSize(2_400_000), '2,4 MB');
  assert.equal(SYNC_LIMIT, MAX_ASSET_BYTES);
  assert.ok((assetMimes as readonly string[]).includes('application/pdf'));
});

test('the sync server accepts original PDFs as their own kind, with the file as an asset reference', () => {
  const change = {kind: 'pdf-original', key: crypto.randomUUID(), base: 0, data: {id: 'x', name: 'Libro', size: 10, createdAt: 1, updatedAt: 1, file: 'sync-asset:' + 'a'.repeat(64) + ':application/pdf'}};
  assert.ok(pushSchema.safeParse({device: 'd', changes: [change]}).success);
  assert.ok(pushSchema.safeParse({device: 'd', changes: [{...change, data: {...change.data, file: null}}]}).success, 'a file over the limit travels without it');
});
