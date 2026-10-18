import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {chatSkills, matchSkills, splitCommand, parseDraft, draftComponents, newWords, wordsOf, unitVocabulary, autoChecks, parseReview, unitPagesText, pdfContext, skillSummary, refValue} from '../src/lib/skills/chat';
import {readPdf} from '../src/lib/manual/pdf-read';
import {editorFonts} from '../src/lib/manual/fonts';
import {unitFromPdf} from '../src/lib/manual/segment';
import {blankUnitFrom, layOut} from '../src/lib/manual/units';
import {nextExercise} from '../src/lib/manual/compose';
import {renderUnit} from '../src/lib/manual/render';
import {plainText} from '../src/lib/manual/elements';
import {unitSchema} from '../src/lib/manual/model';
import {videoModels, imageModels, enabledStatus} from '../src/lib/ai/models';
import {jobInput} from '../src/lib/cinema/kie-jobs';
import {personalInput, systemForPersonal} from '../src/lib/personal-chat/input';

// Stage 11: skills of the Chat. Pure parts only (the browser flow is checked end to end separately).

const root = path.join(import.meta.dirname, '..');
const fixture = new Uint8Array(fs.readFileSync(path.join(root, 'tests/fixtures/manual/sample-unit.pdf')));
const fonts = editorFonts({
  regular: new Uint8Array(fs.readFileSync(path.join(root, 'public/fonts/dejavu/DejaVuSans.ttf'))),
  bold: new Uint8Array(fs.readFileSync(path.join(root, 'public/fonts/dejavu/DejaVuSans-Bold.ttf'))),
});
async function sampleUnit() {
  const read = await readPdf(fixture);
  const hash = crypto.createHash('sha256').update(fixture).digest('hex');
  return {read, hash, ...unitFromPdf(fonts, read, {id: 'u-test', title: 'Урок 9', now: 1, source: {asset: hash, name: 'sample.pdf', pages: 3, size: fixture.length}})};
}

const draftText = '```json\n' + JSON.stringify({
  title: 'Урок 10. Семья', summary: 'Dos ejercicios sobre la familia.',
  blocks: [
    {type: 'heading', text: 'Моя семья'},
    {type: 'exercise', instruction: 'Скажи по образцу.', example: ['Это мама. — Это ==моя== мама.'], items: ['1. Это папа.', '2) Это брат.', 'Это сестра.'], answers: ['Это мой папа.', 'Это мой брат.', 'Это моя сестра.'], columns: 2},
    {type: 'text', text: 'Это моя семья. Это мама, это папа.'},
    {type: 'exercise', instruction: 'Ответь.', items: ['Кто это?', 'Что это?'], columns: 1},
  ],
}) + '\n```';

test('the / menu: four skills, filtered by what is typed, and a full command in the message', () => {
  assert.deepEqual(chatSkills.map(s => s.command), ['/image-generation', '/video-generation', '/pdf-generator', '/revisar-ruso']);
  assert.deepEqual(matchSkills('/').map(s => s.id).length, 4);
  assert.deepEqual(matchSkills('/vid').map(s => s.id), ['video-generation']);
  assert.deepEqual(matchSkills('/rev').map(s => s.id), ['revisar-ruso']);
  assert.deepEqual(splitCommand('/image-generation Маша в школе'), {skill: 'image-generation', rest: 'Маша в школе'});
  assert.deepEqual(splitCommand('/pdf-generator'), {skill: 'pdf-generator', rest: ''});
  assert.deepEqual(splitCommand('/no-existe hola'), {rest: '/no-existe hola'});
  assert.deepEqual(splitCommand('hola /image-generation'), {rest: 'hola /image-generation'});
});

test('/pdf-generator: the draft is read from the answer, items lose their numbers, the studio numbers exercises', () => {
  const draft = parseDraft(draftText)!;
  assert.ok(draft);
  assert.equal(draft.blocks.length, 4);
  const ex = draft.blocks[1];
  assert.ok(ex.type === 'exercise');
  assert.deepEqual(ex.type === 'exercise' && ex.items, ['Это папа.', 'Это брат.', 'Это сестра.']);
  const comps = draftComponents(draft, {number: 13, unit: '1', audio: 16});
  assert.deepEqual(comps.filter(c => c.type === 'exercise').map(c => c.type === 'exercise' && [c.number, c.audio]), [['13', '1.16'], ['14', '1.17']]);
  assert.equal(parseDraft('Lo siento, no puedo.'), null);
  assert.equal(parseDraft(JSON.stringify({title: 'x', blocks: [{type: 'image', url: 'x'}]})), null, 'unknown components are refused');
});

test('/pdf-generator: laid out with the template of the unit, as a new unit or after its last page', async () => {
  const {unit} = await sampleUnit();
  const draft = parseDraft(draftText)!;
  // New unit: number after the highest one, exercises from 1 and audio codes from 10.01.
  const base = blankUnitFrom(fonts, unit, {id: 'u-new', title: draft.title, number: '10', now: 2});
  const fresh = layOut(fonts, base, draftComponents(draft, {number: 1, unit: '10', audio: 1}), false);
  assert.ok(unitSchema.safeParse(fresh.unit).success);
  const els = fresh.unit.pages.flatMap(p => p.blocks.flatMap(b => b.elements));
  assert.ok(els.some(e => e.role === 'ex-number' && plainText(e) === '1') && els.some(e => e.role === 'ex-audio' && plainText(e) === '10.01'));
  assert.ok(els.some(e => e.role === 'unit-tab' && plainText(e) === '10'), 'side tab with the new number');
  assert.ok(els.some(e => e.role === 'page-number' && plainText(e) === '1'));
  assert.deepEqual(fresh.overflow, []);
  // Append: after exercise 3 · 9.03 comes 4 · 9.04, on a new page at the end.
  const next = nextExercise(unit);
  assert.deepEqual(next, {number: '4', audio: '9.04'});
  const appended = layOut(fonts, unit, draftComponents(draft, {number: 4, unit: '9', audio: 4}), true);
  assert.equal(appended.pages[0], unit.pages.length);
  const newEls = appended.pages.flatMap(i => appended.unit.pages[i].blocks.flatMap(b => b.elements));
  assert.ok(newEls.some(e => e.role === 'ex-audio' && plainText(e) === '9.04') && newEls.some(e => e.role === 'ex-audio' && plainText(e) === '9.05'));
  const out = await renderUnit(appended.unit, {fonts, asset: async () => null, pages: appended.pages});
  assert.deepEqual(out.overflows, []);
});

test('/pdf-generator: words of the draft that the manual does not have, and the context sent to the model', async () => {
  const {unit} = await sampleUnit();
  const known = unitVocabulary([unit]);
  assert.ok(known.has('лампа'), 'stress marks are ignored');
  assert.deepEqual(wordsOf('Э́то ла́мпа, а это — кот.'), ['это', 'лампа', 'это', 'кот']);
  const words = newWords(parseDraft(draftText)!, known);
  assert.ok(words.includes('семья') && words.includes('папа'));
  assert.ok(!words.includes('это'), 'known word');
  const context = pdfContext(unit, {mode: 'new', unitId: unit.id}, 'Ejercicios de la familia', known);
  assert.match(context, /UNIT CONTEXT/);
  assert.match(context, /Скажи по образцу\. Используй «тоже»\./, 'the manual\'s own instructions, for style');
  assert.match(context, /PEDIDO DEL AUTOR:\nEjercicios de la familia/);
});

test('/revisar-ruso: automatic checks find Latin letters in Russian words and «A1» written two ways', () => {
  const issues = autoChecks([
    {page: 1, text: 'Русский код · A1\nЭто мaма.'}, // Latin «a» inside «мама»
    {page: 2, text: 'Русский код · А1'},
  ]);
  const mixed = issues.find(i => i.quote === 'мaма');
  assert.ok(mixed);
  assert.equal(mixed!.suggestion, 'мама');
  const forms = issues.find(i => i.quote.includes('/'));
  assert.ok(forms && /páginas 1/.test(forms.problem) && /páginas 2/.test(forms.problem), forms?.problem);
  assert.deepEqual(autoChecks([{page: 1, text: 'Это мама. Unit A1.'}]), [], 'no false alarm');
});

test('/revisar-ruso: the review is read from the answer and unit pages are sent page by page', async () => {
  const r = parseReview(JSON.stringify({summary: 'Dos problemas.', issues: [{page: 2, quote: 'учительница', problem: 'x', suggestion: 'y', kind: 'gramática'}, {page: null, quote: '', problem: 'z', kind: 'rarísimo'}]}))!;
  assert.equal(r.issues.length, 2);
  assert.equal(r.issues[1].kind, 'otro');
  assert.equal(parseReview('no es JSON'), null);
  const {unit} = await sampleUnit();
  const pages = unitPagesText(unit, 1, 9);
  assert.equal(pages.length, 3);
  assert.match(pages[1].text, /Это школа/);
});

test('the model gets each skill\'s own instructions, and a card leaves a line for the history', () => {
  const base = {requestId: crypto.randomUUID(), model: 'auto', messages: [{role: 'user' as const, content: 'x'}]};
  assert.match(systemForPersonal(personalInput.parse({...base, purpose: 'pdf-generator'})), /Never write exercise numbers or audio codes/);
  assert.match(systemForPersonal(personalInput.parse({...base, purpose: 'russian-review'})), /Return ONLY a JSON object: \{"summary"/);
  assert.equal(skillSummary({skill: 'image-generation', prompt: 'кот', model: 'nano-banana-2-1', aspect: '1:1', resolution: '1K', count: 1, refs: []}), '[/image-generation · borrador · modelo nano-banana-2-1 · prompt: «кот»]');
  assert.equal(refValue({kind: 'asset', hash: 'a'.repeat(64), mime: 'image/png', name: 'x'}), 'asset:' + 'a'.repeat(64));
});

test('video from an image: models that need a start image get it in the field their documentation names', () => {
  const needing = videoModels.filter(m => enabledStatus(m) && !m.options.modes.includes('create'));
  assert.ok(needing.length >= 15, 'image-to-video models are enabled for /video-generation: ' + needing.length);
  for (const m of needing) assert.ok(m.options.fields.images && m.options.maxReferences >= 1, m.id);
  const veo = videoModels.find(m => m.id === 'veo-3-1')!;
  assert.deepEqual(veo.options.modes, ['create', 'edit']);
  const input = jobInput(veo, {prompt: 'Маша идёт в школу', aspect: '16:9', resolution: '720p', duration: '8', references: ['https://file.aiquickdraw.com/a.png']});
  assert.deepEqual(input.image_urls, ['https://file.aiquickdraw.com/a.png']);
  assert.equal(input.duration, 8);
  const single = needing.find(m => m.options.fields.imagesSingle)!;
  assert.equal(typeof jobInput(single, {prompt: 'x', references: ['https://file.aiquickdraw.com/a.png']})[single.options.fields.images!], 'string');
  assert.ok(imageModels.some(m => enabledStatus(m)), 'image models still there');
});
