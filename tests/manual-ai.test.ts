import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {readPdf} from '../src/lib/manual/pdf-read';
import {editorFonts} from '../src/lib/manual/fonts';
import {unitFromPdf} from '../src/lib/manual/segment';
import {addComponent, charStyles, setLocked} from '../src/lib/manual/edit';
import {nextExercise} from '../src/lib/manual/compose';
import {plainText} from '../src/lib/manual/elements';
import type {Component, Element, Unit} from '../src/lib/manual/model';
import {applyFinding, parseReview, reviewRequest, reviewTexts} from '../src/lib/manual/review';
import {bookPicturePrompt, bubbleLines} from '../src/lib/kb/picture';

// «Revisar con IA» and «Crear ejercicio con IA» in the manual editor, on the synthetic unit of stage 10.

const root = path.join(import.meta.dirname, '..');
const fixture = new Uint8Array(fs.readFileSync(path.join(root, 'tests/fixtures/manual/sample-unit.pdf')));
const fonts = editorFonts({
  regular: new Uint8Array(fs.readFileSync(path.join(root, 'public/fonts/dejavu/DejaVuSans.ttf'))),
  bold: new Uint8Array(fs.readFileSync(path.join(root, 'public/fonts/dejavu/DejaVuSans-Bold.ttf'))),
});
const hash = crypto.createHash('sha256').update(fixture).digest('hex');
const meta = {id: 'u-ai', title: 'Prueba', now: 1, source: {asset: hash, name: 'sample-unit.pdf', pages: 3, size: fixture.length}};

type Text = Extract<Element, {kind: 'text'}>;
async function unit(): Promise<Unit> { return unitFromPdf(fonts, await readPdf(fixture), meta).unit; }
/** The first editable page with a text line of at least `min` letters, and that line. */
function line(u: Unit, min = 8) {
  for (const page of u.pages) {
    if (page.conserved) continue;
    for (const b of page.blocks) {
      if (b.locked || b.component) continue;
      const el = b.elements.find((e): e is Text => e.kind === 'text' && plainText(e).trim().length >= min && !/\d/.test(plainText(e)));
      if (el) return {page, block: b, el};
    }
  }
  throw Error('no line');
}
const answer = (findings: unknown[], summary = 'Resumen') => '```json\n' + JSON.stringify({summary, findings}) + '\n```';

test('the page goes to the model as numbered texts in reading order, with their block; approved blocks are marked', async () => {
  const u = await unit();
  const {page} = line(u);
  const texts = reviewTexts(page);
  assert.ok(texts.length > 2);
  assert.deepEqual(texts.map(t => t.id), texts.map((_, i) => 't' + (i + 1)));
  // The footer and the side tab come locked from the import.
  const lockedIds = new Set(page.blocks.filter(b => b.locked).map(b => b.id));
  for (const t of texts) assert.equal(t.locked, lockedIds.has(t.target.blockId));
  const request = reviewRequest(texts, {unit: 'Prueba', page: 1, pages: 3, picture: true});
  assert.match(request, /Va adjunta una imagen/);
  assert.ok(texts.every(t => request.includes('[' + t.id + '] (' + t.block + ') ' + t.text)));
});

test('findings are checked against the page: unknown ids dropped, approved, missing or repeated words only as notes', async () => {
  const u = await unit();
  const {page, block, el} = line(u);
  const texts = reviewTexts(page);
  const mine = texts.find(t => t.target.kind === 'element' && t.target.elementId === el.id)!;
  const locked = texts.find(t => t.locked)!;
  const word = plainText(el).trim().split(/\s+/)[0];
  const r = parseReview(answer([
    {id: mine.id, quote: word, fix: word + 'X', lang: 'ru', kind: 'ortografía', problem: 'Falta una letra.'},
    {id: 't999', quote: 'nada', fix: 'algo', problem: 'No existe.'},
    {id: locked.id, quote: locked.text.slice(0, 3), fix: 'zzz', lang: 'en', kind: 'traducción', problem: 'Aprobado.'},
    {id: mine.id, quote: 'palabras que no están', fix: 'otras', problem: 'No coincide.'},
    {id: 'image', quote: 'Пирвет', fix: 'Привет', kind: 'ortografía', problem: 'En el globo.'},
    {id: mine.id, quote: word, fix: word, problem: 'Solo un consejo.'},
    {id: mine.id, quote: '', problem: 'Vacío.'},
  ]), texts, page.id);
  assert.ok(r);
  assert.equal(r.summary, 'Resumen');
  assert.equal(r.findings.length, 5);
  const [fix, approved, missing, image, advice] = r.findings;
  assert.deepEqual(fix.apply?.target, {kind: 'element', blockId: block.id, elementId: el.id});
  assert.equal(fix.apply?.after, plainText(el).replace(word, word + 'X'));
  assert.match(approved.note!, /aprobado/);
  assert.equal(approved.apply, undefined);
  assert.match(missing.note!, /no están tal cual/);
  assert.match(image.note!, /dentro de una imagen/);
  assert.equal(advice.apply, undefined);
  assert.equal(advice.note, undefined);
  assert.equal(parseReview('No pude revisar.', texts, page.id), null);
});

test('applying a correction keeps the style of every letter that does not change, and refuses what cannot be made', async () => {
  let u = await unit();
  const {page, block, el} = line(u);
  const texts = reviewTexts(page);
  const id = texts.find(t => t.target.kind === 'element' && t.target.elementId === el.id)!.id;
  const original = plainText(el);
  const words = original.trim().split(/\s+/);
  const [first, last] = [words[0], words[words.length - 1]];
  const r = parseReview(answer([
    {id, quote: first, fix: first.slice(0, -1), problem: 'uno'},
    {id, quote: last, fix: last.slice(0, -1), problem: 'dos'},
  ]), texts, page.id)!;
  const styleBefore = charStyles(el);
  // First correction, then the second one on the same line, which changed meanwhile.
  for (const f of r.findings) {
    const out = applyFinding(fonts, u, page.id, f.apply!);
    assert.ok('unit' in out, JSON.stringify(out));
    u = out.unit;
  }
  const after = u.pages.find(p => p.id === page.id)!.blocks.find(b => b.id === block.id)!.elements.find(e => e.id === el.id) as Text;
  assert.equal(plainText(after), original.replace(first, first.slice(0, -1)).replace(last, last.slice(0, -1)));
  // The letters that stayed keep their font and size: the first letter of the line is the same as before.
  assert.deepEqual(charStyles(after)[0].style, styleBefore[0].style);

  // Approved block: refused, even if the finding said it could be applied.
  const lockedUnit = setLocked(u, page.id, block.id, true);
  const refused = applyFinding(fonts, lockedUnit, page.id, {...r.findings[0].apply!});
  assert.ok('error' in refused && /aprobado/.test(refused.error));
  // A letter the font does not have.
  const glyph = applyFinding(fonts, u, page.id, {target: r.findings[0].apply!.target, before: plainText(after), after: plainText(after) + '𝔄', quote: plainText(after), fix: plainText(after) + '𝔄'});
  assert.ok('error' in glyph && /fuente no tiene/.test(glyph.error));
  // Text that no longer fits its line.
  if (after.maxWidth !== undefined) {
    const long = plainText(after) + ' ' + 'очень длинное продолжение '.repeat(12);
    const overflow = applyFinding(fonts, u, page.id, {target: r.findings[0].apply!.target, before: plainText(after), after: long, quote: plainText(after), fix: long});
    assert.ok('error' in overflow && /ya no entra/.test(overflow.error));
  }
});

test('a correction in an exercise made in the editor changes that field and lays the exercise out again', async () => {
  let u = await unit();
  const {page} = line(u);
  const {number, audio} = nextExercise(u);
  const exercise: Component = {type: 'exercise', number, audio, instruction: 'Прочитайте текст.', example: [], items: ['Я живу в Москве.', 'Он говорить по-русски.'], answers: ['', ''], columns: 1};
  const added = addComponent(fonts, u, page.id, exercise, [40, 400]);
  u = added.unit;
  const p = u.pages.find(x => x.id === page.id)!;
  const texts = reviewTexts(p);
  const item = texts.find(t => t.target.kind === 'field' && t.target.path === 'items.1')!;
  assert.ok(item, 'the item is offered as a field');
  const r = parseReview(answer([{id: item.id, quote: 'говорить', fix: 'говорит', kind: 'gramática', problem: 'Concordancia.'}]), texts, p.id)!;
  const out = applyFinding(fonts, u, p.id, r.findings[0].apply!);
  assert.ok('unit' in out);
  const block = out.unit.pages.find(x => x.id === p.id)!.blocks.find(b => b.id === added.block!.id)!;
  assert.equal(block.component?.type === 'exercise' && block.component.items[1], 'Он говорит по-русски.');
  assert.ok(block.elements.some(e => e.kind === 'text' && plainText(e).includes('говорит по-русски')));
});

test('speech bubbles: the image model is asked to write each line exactly, in Cyrillic, and nothing else', () => {
  assert.deepEqual(bubbleLines('Иван: Приве́т!\n\n  Как дела?  \nАнна: Хорошо́'), [{speaker: 'Иван', words: 'Приве́т!'}, {speaker: '', words: 'Как дела?'}, {speaker: 'Анна', words: 'Хорошо́'}]);
  const prompt = bookPicturePrompt([], [], {action: 'Two friends meet in a park', scene: '', composition: '', style: 'Comic style', bubbles: 'Иван: Приве́т!\nАнна: Хорошо́'});
  assert.match(prompt, /2 comic-style speech bubbles/);
  assert.match(prompt, /1\. Иван says: «Приве́т!»/);
  assert.match(prompt, /2\. Анна says: «Хорошо́»/);
  assert.match(prompt, /No other text/);
  assert.doesNotMatch(prompt, /No text, letters, labels, speech bubbles/);
  // Without bubbles the old rule stays: no text inside pictures.
  assert.match(bookPicturePrompt([], [], {action: 'A park', scene: '', composition: '', style: ''}), /No text, letters, labels, speech bubbles or logos/);
});

test('the server takes both new requests, with their own instructions: Russian and English only, the template\'s exercise', async () => {
  const {personalInput, systemForPersonal} = await import('../src/lib/personal-chat/input');
  const base = {requestId: crypto.randomUUID(), model: 'auto', messages: [{role: 'user' as const, content: 'TEXTOS'}]};
  const review = personalInput.parse({...base, purpose: 'manual-review'});
  assert.match(systemForPersonal(review), /Review ONLY the Russian text and the English translations; never report anything about Spanish/);
  assert.match(systemForPersonal(review), /id "image"/);
  const exercise = personalInput.parse({...base, purpose: 'manual-exercise'});
  assert.match(systemForPersonal(exercise), /Never write exercise numbers or audio codes/);
  assert.match(systemForPersonal(exercise), /"exercise": \{"instruction"/);
});
