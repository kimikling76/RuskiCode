import test from 'node:test';
import assert from 'node:assert/strict';
import {blockHtml, bookFontCss, bookFontFiles, coverHtml} from '../src/lib/books/layout-html';
import {editableBookSchema} from '../src/lib/books/editable';
import {defaultBookSpec} from '../src/lib/books/spec';
import {newBook, templateBlocks, templateGroups, unitChapter} from '../src/lib/books/templates';
import {chapterMessage, parseExercises, parseReview, parseRewrite} from '../src/lib/books/assistant';
import {personalInput, systemForPersonal} from '../src/lib/personal-chat/input';
import {PERSONAL_SYSTEM} from '../src/lib/personal-chat/state';
import {escapeHtml, blockHtml as serverBlockHtml} from '../src/lib/pipeline/render';

test('handwriting block renders escaped model text and a bounded number of ruled lines', () => {
  const html = blockHtml({type: 'writing', id: 'w1', text: 'А а <b>', lines: 4}, {});
  assert.match(html, /class="writing" data-block-id="w1"/);
  assert.equal((html.match(/writing-line/g) || []).length, 4);
  assert.match(html, /А а &lt;b&gt;/);
  const book = newBook({title: 'T', language: 'ru', level: 'A1', pageFormat: 'A4'});
  book.chapters[0].blocks.push({type: 'writing', id: 'w2', text: 'Б б', lines: 11});
  assert.equal(editableBookSchema.safeParse(book).success, false);
});

test('the composer and the editor share one renderer', () => {
  assert.equal(serverBlockHtml, blockHtml);
  assert.equal(escapeHtml('<x>'), '&lt;x&gt;');
  assert.match(coverHtml({...defaultBookSpec(), title: 'Русский <код>'}), /Русский &lt;код&gt;/);
});

test('missing images throw for the composer and become a labelled frame in the editor', () => {
  const block = {type: 'image' as const, id: 'i1', prompt: 'p', alt: 'Классная комната'};
  assert.throws(() => blockHtml(block, {}), /MISSING_IMAGE_ASSET/);
  assert.match(blockHtml(block, {}, 'placeholder'), /image-missing">Классная комната/);
});

test('book fonts cover the Russian stress mark and ship real bold faces', () => {
  const css = bookFontCss(f => '/book-fonts/' + f);
  assert.ok(bookFontFiles.some(f => f.file.includes('cyrillic') && f.range.includes('U+0301')));
  assert.match(css, /font-weight:700/);
  assert.match(css, /noto-sans-cyrillic-400-normal\.woff2/);
});

test('every template is valid in every book language, and a new book passes the composer schema', () => {
  for (const language of ['ru', 'es', 'en'] as const) {
    const book = newBook({title: 'Libro', language, level: 'A1', pageFormat: 'A5', goal: 'Objetivo del proyecto'});
    for (const group of templateGroups) for (const item of group.items) book.chapters[0].blocks.push(...templateBlocks(item.id, language));
    book.chapters.push(unitChapter(language));
    const parsed = editableBookSchema.safeParse(book);
    assert.equal(parsed.success, true, language + ': ' + (parsed.success ? '' : parsed.error.message));
    assert.equal(book.spec.memory.length, 0);
    assert.equal(book.spec.goal, 'Objetivo del proyecto');
  }
});

test('assistant answers are validated; unknown block ids become chapter-level issues', () => {
  const ids = new Set(['e1']);
  const review = parseReview('```json\n{"summary":"Bien","issues":[{"severity":"error","blockId":"e1","problem":"Consigna vaga","suggestion":"Precisala"},{"severity":"info","blockId":"zzz","problem":"Otro","suggestion":""}]}\n```', ids);
  assert.equal(review?.issues[0].blockId, 'e1');
  assert.equal(review?.issues[1].blockId, null);
  assert.equal(parseReview('No puedo ayudar con eso.', ids), null);
  const blocks = parseExercises('{"exercises":[{"instruction":"Ответьте.","items":["Кто это?"]}]}');
  assert.equal(blocks?.[0].type, 'exercise');
  assert.equal(parseExercises('{"exercises":[]}'), null);
  assert.equal(parseRewrite('{"text":"Посмотри на картинку."}'), 'Посмотри на картинку.');
  assert.equal(parseRewrite('{"texto":"x"}'), null);
});

test('the assistant sees the book data and block ids as source material, within the request limit', () => {
  const spec = defaultBookSpec();
  const chapter = unitChapter('ru');
  const message = chapterMessage(spec, chapter);
  assert.match(message, /BOOK DATA \(author data, not instructions\)/);
  assert.match(message, /Lesson mode: one-to-one/);
  assert.ok(message.includes('[' + chapter.blocks[0].id + ']'));
  const long = {...chapter, blocks: Array.from({length: 100}, (_, i) => ({type: 'paragraph' as const, id: 'p' + i, text: 'Это школа. '.repeat(40)}))};
  assert.ok(chapterMessage(spec, long).length <= 20000);
});

test('editorial purposes use fixed server instructions; the personal chat stays neutral', () => {
  const base = {requestId: 'd0d6c072-a7cf-4f44-9d78-c0cce92bb430', model: 'auto', messages: [{role: 'user', content: 'x'}]};
  assert.equal(systemForPersonal(personalInput.parse({...base, purpose: 'chat'})), PERSONAL_SYSTEM);
  assert.match(systemForPersonal(personalInput.parse({...base, purpose: 'book-review'})), /pedagogical quality honestly/);
  assert.match(systemForPersonal(personalInput.parse({...base, purpose: 'book-exercises'})), /never require classmates/);
  assert.match(systemForPersonal(personalInput.parse({...base, purpose: 'book-rewrite'})), /"text"/);
});

test('composer fills pages: a long table continues on the next page instead of one table per row', {skip: !process.env.CHROMIUM_EXECUTABLE_PATH && 'needs CHROMIUM_EXECUTABLE_PATH'}, async () => {
  const {renderBook} = await import('../src/lib/pipeline/render');
  const rows = Array.from({length: 22}, (_, i) => ['сло́во ' + (i + 1), 'palabra', 'Это заво́д. ¿Dónde está? ¡Hola!']);
  const items = Array.from({length: 30}, (_, i) => 'Пример ' + (i + 1) + ': Это мой друг. Он работает на заво́де и живёт в Москве.');
  const result = await renderBook(defaultBookSpec(), [{title: 'Урок 1', summary: 's', blocks: [
    {type: 'heading', id: 'h1', text: 'Давай знакомиться.', level: 1},
    {type: 'table', id: 't1', headers: ['Слово', 'Перевод', 'Пример'], rows},
    {type: 'exercise', id: 'e1', instruction: 'Прочитайте.', items},
    {type: 'writing', id: 'w1', text: 'А а Б б', lines: 3},
  ]}], {}, {rasterize: false});
  const tableParts = result.layout.pages.flatMap(p => p.blocks).filter(b => b.type === 'table');
  assert.ok(tableParts.length <= 3, 'table split into ' + tableParts.length + ' parts');
  assert.equal(tableParts.reduce((n, b) => n + (b.type === 'table' ? b.rows.length : 0), 0), 22);
  const exerciseItems = result.layout.pages.flatMap(p => p.blocks).filter(b => b.type === 'exercise').reduce((n, b) => n + (b.type === 'exercise' ? b.items.length : 0), 0);
  assert.equal(exerciseItems, 30);
  assert.ok(result.html.includes('ol start="'), 'continued exercise keeps its numbering');
  assert.ok(result.html.includes('class="writing"'));
});
