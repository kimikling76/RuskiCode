import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {z} from 'zod';
import {textJobSchema} from '../src/lib/ai/text-jobs';
import {jobId} from '../src/lib/ai/text-request';
import {continuationContext, draftComponents, draftOutline, mergeDrafts, parseDraft, PART_BLOCKS} from '../src/lib/skills/chat';
import {textEstimate, chatEstimate, estimateText} from '../src/lib/personal-chat/estimate';
import {systemForPersonal, personalInput} from '../src/lib/personal-chat/input';
import type {Unit} from '../src/lib/manual/model';

// Money safety: text requests that run on the server, long drafts in parts, and the estimated cost before sending.

const normal = (sql: string) => sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim();

test('the job table the server creates is exactly the migration, and only adds', () => {
  const migration = readFileSync(new URL('../prisma/migrations/202611070001_text_jobs/migration.sql', import.meta.url), 'utf8');
  assert.deepEqual(textJobSchema.map(normal), normal(migration).split(';').map(s => s.trim()).filter(Boolean));
  for (const s of textJobSchema) assert.match(s, /^CREATE (TABLE|INDEX) IF NOT EXISTS /);
});

test('a job id is the same for the same card, part and try, and is a valid request id', async () => {
  const a = await jobId('msg-1:2:0');
  assert.equal(a, await jobId('msg-1:2:0'));
  assert.notEqual(a, await jobId('msg-1:2:1'));
  assert.ok(z.string().uuid().safeParse(a).success, a);
});

const part1 = parseDraft(JSON.stringify({title: 'Алфавит', characters: [{name: 'Миша', look: 'A boy of 14.'}], more: 'Las letras Р a Я y los ejercicios.', blocks: [
  {type: 'heading', text: 'Алфавит'},
  {type: 'gallery', columns: 4, aspect: '1:1', numbered: true, items: Array.from({length: 17}, (_, i) => ({prompt: 'Letter ' + i, label: String(i)}))},
]}))!;
const part2 = parseDraft(JSON.stringify({title: 'Алфавит', characters: [{name: 'Миша', look: 'Other look'}, {name: 'Дима', look: 'A boy of 14.'}], blocks: [
  {type: 'gallery', columns: 4, aspect: '1:1', numbered: true, items: Array.from({length: 16}, (_, i) => ({prompt: 'Letter ' + i, label: String(i)}))},
  {type: 'exercise', instruction: 'Читай.', items: ['а', 'б', 'в']},
]}))!;

test('a draft that says what is missing keeps it, and the next part is added at its end', () => {
  assert.equal(part1.more, 'Las letras Р a Я y los ejercicios.');
  const merged = mergeDrafts(part1, part2);
  assert.equal(merged.blocks.length, 4);
  assert.equal(merged.more, undefined, 'nothing more after the last part');
  assert.deepEqual(merged.characters.map(c => [c.name, c.look]), [['Миша', 'A boy of 14.'], ['Дима', 'A boy of 14.']], 'the first look stays; a new character is added');
  const g = merged.blocks[2] as {first?: number};
  assert.equal(g.first, 18, 'the alphabet goes on counting from 18');
  const components = draftComponents(merged, {number: 1, unit: '0', audio: 1});
  assert.equal((components.find((c, i) => c.type === 'gallery' && i > 1) as {first?: number}).first, 18);
});

test('the next part is asked with what is written, what is missing and the same names', () => {
  const unit = {title: 'Урок 1', pages: []} as unknown as Unit;
  const text = continuationContext(unit, {mode: 'append', unitId: 'u'}, 'El alfabeto completo', new Set(['дом']), part1, part1.more, 2);
  assert.match(text, /parte 2/);
  assert.match(text, /1\. Título: Алфавит\n2\. Galería numerada desde 1: 0, 1, 2/);
  assert.match(text, /Falta: Las letras Р a Я y los ejercicios\./);
  assert.match(text, /Миша/);
  assert.match(text, new RegExp('como máximo ' + PART_BLOCKS + ' bloques'));
  assert.ok(draftOutline(part1, 40).endsWith('…'), 'a long outline is cut');
  const system = systemForPersonal(personalInput.parse({requestId: crypto.randomUUID(), model: 'auto', purpose: 'pdf-generator', messages: [{role: 'user', content: 'x'}]}));
  assert.match(system, /at most 12 blocks in one answer/);
  assert.match(system, /"more"/);
});

test('the estimate is the median of what Kie reported for the same task and model', () => {
  const usage = [3, 30, 10, 12, 11, 9, 100].map((credits, i) => ({id: 'u' + i, credits, at: i, label: '/pdf-generator', asked: 'kie-opus', studio: 'chat' as const}));
  usage.push({id: 'x', credits: 1, at: 50, label: '/pdf-generator', asked: 'kie-flash', studio: 'chat'});
  const e = textEstimate(usage, '/pdf-generator', 'kie-opus')!;
  assert.deepEqual(e, {credits: 12, from: 6}, 'the last six: 30 10 12 11 9 100');
  assert.equal(textEstimate(usage, '/pdf-generator', 'kie-sonnet'), null);
  assert.match(estimateText(e, ' por parte'), /^≈ 12 créditos por parte \(según tus últimos 6 pedidos/);
  assert.match(estimateText(null), /Kie no publica el precio/);
  assert.deepEqual(chatEstimate([{id: 'a', credits: 0.4, at: 1, studio: 'chat', label: 'Gemini', model: 'kie-flash'}, {id: 'b', credits: 9, at: 2, studio: 'chat', label: '/pdf-generator', asked: 'kie-flash'}], 'kie-flash'), {credits: 0.4, from: 1});
});
