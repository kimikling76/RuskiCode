import test from 'node:test';
import assert from 'node:assert/strict';
import {checkBookPlan, checkPdfPlan, stressCount, assistantRequestSchema, type BookContext, type PdfContext} from '../src/lib/assistant/edit-plan';
import {applyBookActions, BookPlanError} from '../src/lib/assistant/book-actions';
import {draftToBlocks, bookFromBlocks, pageBlocks} from '../src/lib/assistant/draft';
import {neighbours, type PdfVersion} from '../src/lib/books/originals';
import {mergeDocChats} from '../src/lib/books/doc-chat';
import {defaultBookSpec} from '../src/lib/books/spec';
import type {EditableBook} from '../src/lib/books/editable';
import {pushSchema} from '../src/lib/sync/server';

const pdf: PdfContext = {kind: 'pdf', name: 'Урок', pageCount: 3, page: 2, pageText: 'Приве́т! Меня́ зову́т Анна. Я живу́ в Москве́.', selection: '', scanned: false};
const answer = (o: unknown) => JSON.stringify(o);

test('a PDF plan is checked against the document: pages, the page text and one action at a time', () => {
  const ok = checkPdfPlan(answer({reply: 'Cambio el nombre.', actions: [{tool: 'replace_text', page: 2, edits: [{find: 'Анна', replace: 'Мари́я'}]}]}), pdf);
  assert.equal(ok.actions.length, 1);
  assert.ok(ok.actions[0].warnings.some(w => w.includes('Stirling reescribe')), 'the formatting risk is always said');

  const invented = checkPdfPlan(answer({reply: '', actions: [{tool: 'replace_text', page: 2, edits: [{find: 'Ольга', replace: 'Мария'}]}]}), pdf);
  assert.equal(invented.actions.length, 0, 'a find text that is not on the page is refused');
  assert.match(invented.rejected[0], /no está en la página/);

  const lost = checkPdfPlan(answer({reply: '', actions: [{tool: 'replace_text', page: 2, edits: [{find: 'Приве́т', replace: 'Привет'}]}]}), pdf);
  assert.ok(lost.actions[0].warnings.some(w => w.includes('tilde de acento')), 'losing a stress mark is flagged');

  assert.equal(checkPdfPlan(answer({actions: [{tool: 'delete_pages', pages: [4]}]}), pdf).actions.length, 0, 'page 4 does not exist');
  assert.equal(checkPdfPlan(answer({actions: [{tool: 'delete_pages', pages: [1, 2, 3]}]}), pdf).actions.length, 0, 'never every page');
  assert.equal(checkPdfPlan(answer({actions: [{tool: 'run_shell', command: 'rm -rf /'}]}), pdf).actions.length, 0, 'only the listed tools');
  assert.equal(checkPdfPlan(answer({actions: [{tool: 'insert_pages', after: 2, blocks: [{type: 'image', prompt: 'x', alt: ''}]}]}), pdf).actions.length, 0, 'no images in PDF pages');

  const two = checkPdfPlan(answer({actions: [{tool: 'rotate', pages: [1], angle: 90}, {tool: 'delete_pages', pages: [3]}]}), pdf);
  assert.equal(two.actions.length, 1);
  assert.match(two.rejected[0], /solo la primera/);

  const pages = checkPdfPlan('```json\n' + answer({reply: 'Agrego ejercicios.', actions: [{tool: 'insert_pages', after: 2, blocks: [{type: 'heading', text: 'Упражне́ния', level: 1}, {type: 'exercise', instruction: 'Отве́тьте', items: ['Как вас зову́т?']}]}]}) + '\n```', pdf);
  const action = pages.actions[0].action as Extract<typeof pages.actions[0]['action'], {tool: 'insert_pages'}>;
  assert.equal(action.blocks.length, 2);
  assert.ok(action.blocks.every(b => b.id && b.id !== 'new'), 'blocks get fresh ids');

  const none = checkPdfPlan(answer({reply: 'No se puede.', actions: [], unsupported: 'Reemplazar una imagen dentro del PDF no es posible.'}), pdf);
  assert.equal(none.unsupported, 'Reemplazar una imagen dentro del PDF no es posible.');
  assert.throws(() => checkPdfPlan('Claro, ya lo hice.', pdf), 'prose instead of a plan is not guessed');
});

function sampleBook(): EditableBook {
  return {spec: defaultBookSpec(), assets: {}, chapters: [
    {title: 'Урок 1', summary: '—', blocks: [
      {type: 'heading', id: 'h1', level: 1, text: 'Уро́к 1'},
      {type: 'paragraph', id: 'p1', text: 'Приве́т! Меня́ зову́т Анна.'},
      {type: 'image', id: 'i1', prompt: 'Una mujer saluda', alt: ''},
    ]},
  ]};
}
const bookCtx = (b: EditableBook): BookContext => ({kind: 'book', title: b.spec.title, language: 'ru', level: 'A1', data: '', chapters: b.chapters.map(c => c.title), chapter: 0, blocks: b.chapters[0].blocks.map(x => ({id: x.id, type: x.type, text: 'text' in x ? x.text : 'prompt' in x ? x.prompt : ''})), selected: 'p1'});

test('a book plan only touches blocks that exist, and the preview is computed on a copy', () => {
  const book = sampleBook();
  const plan = checkBookPlan(answer({reply: 'Agrego un cuadro.', actions: [
    {tool: 'insert_blocks', chapter: 0, after: 'p1', blocks: [{type: 'table', headers: ['Сло́во', 'Перево́д'], rows: [['дом', 'casa']]}]},
    {tool: 'update_text', blockId: 'p1', text: 'Привет! Меня зовут Анна.'},
    {tool: 'update_text', blockId: 'nope', text: 'x'},
    {tool: 'update_text', blockId: 'i1', text: 'x'},
  ]}), bookCtx(book));
  assert.equal(plan.actions.length, 2);
  assert.equal(plan.rejected.length, 2);
  assert.ok(plan.actions[1].warnings[0].includes('tildes de acento'), 'stress marks lost in a rewrite are flagged');

  const {book: next, changes} = applyBookActions(book, plan.actions.map(a => a.action));
  assert.equal(book.chapters[0].blocks.length, 3, 'the original book is untouched');
  assert.equal(next.chapters[0].blocks.length, 4);
  assert.equal(next.chapters[0].blocks[2].type, 'table', 'inserted right after the selected block');
  assert.equal(changes[1].kind, 'update');

  const cover = checkBookPlan(answer({actions: [{tool: 'add_chapter', at: 0, title: 'Portada', blocks: [{type: 'heading', text: 'Русский код', level: 1}, {type: 'image', prompt: 'Portada', alt: ''}]}]}), bookCtx(book));
  assert.equal(applyBookActions(book, cover.actions.map(a => a.action)).book.chapters[0].title, 'Portada');

  const image = checkBookPlan(answer({actions: [{tool: 'replace_image', blockId: 'i1', prompt: 'Dos personas se saludan en Moscú', alt: 'Saludo'}]}), bookCtx(book));
  assert.equal((applyBookActions(book, image.actions.map(a => a.action)).book.chapters[0].blocks[2] as {prompt: string}).prompt, 'Dos personas se saludan en Moscú');

  // The book changed after the proposal: it is refused instead of applied somewhere else.
  const stale = {...book, chapters: [{...book.chapters[0], blocks: book.chapters[0].blocks.filter(b => b.id !== 'p1')}]};
  assert.throws(() => applyBookActions(stale, plan.actions.map(a => a.action)), BookPlanError);
});

test('«Crear con IA» answers become blocks: an instruction with a numbered list is an exercise', () => {
  const md = '# Уро́к 2. Семья́\n\nЭ́то моя́ семья́.\n\nОтве́тьте на вопро́сы:\n1. Как зову́т ма́му?\n2. Ско́лько ей лет?\n\n| Сло́во | Перево́д |\n|---|---|\n| мать | madre |\n| оте́ц | padre |\n\n> Запо́мните: семья́ — femenino.';
  const {blocks} = draftToBlocks(md);
  assert.deepEqual(blocks.map(b => b.type), ['heading', 'paragraph', 'exercise', 'table', 'callout']);
  const ex = blocks[2] as Extract<typeof blocks[2], {type: 'exercise'}>;
  assert.equal(ex.items.length, 2);
  assert.ok(ex.instruction.includes('Отве́тьте'), 'stress marks are kept');
  const book = bookFromBlocks(blocks, 'Libro');
  assert.equal(book.spec.language, 'ru');
  assert.equal(book.spec.title, 'Уро́к 2. Семья́');
  assert.equal(pageBlocks([...blocks, {type: 'image', id: 'x', prompt: 'p', alt: ''}]).length, blocks.length);
});

test('versions: undo goes to the parent, redo to the newest child, nothing is lost', () => {
  const v = (id: string, parent?: string, at = 0): PdfVersion => ({id, docId: 'd', label: id, createdAt: at, size: 1, ...(parent ? {parent} : {})});
  const versions = [v('original', undefined, 1), v('rotar', 'original', 2), v('nota', 'rotar', 3)];
  assert.equal(neighbours(versions, 'nota').back?.id, 'rotar');
  assert.equal(neighbours(versions, 'rotar').forward?.id, 'nota');
  // After going back to «rotar» and making a new change, both branches stay; redo from «rotar» goes to the newest.
  const branched = [...versions, v('borrar', 'rotar', 4)];
  assert.equal(neighbours(branched, 'rotar').forward?.id, 'borrar');
  assert.equal(neighbours(branched, 'original').back, undefined);
});

test('a document\'s chats from two computers merge without losing a message', () => {
  const a = {doc: 'pdf:x', updatedAt: 2, messages: [
    {id: '1', thread: 'create' as const, role: 'user' as const, content: 'Hola', createdAt: 1},
    {id: '2', thread: 'assistant' as const, role: 'assistant' as const, content: 'Propuesta', createdAt: 2, status: 'proposed' as const},
  ]};
  const b = {doc: 'pdf:x', updatedAt: 3, messages: [
    {id: '2', thread: 'assistant' as const, role: 'assistant' as const, content: 'Propuesta', createdAt: 2, status: 'applied' as const, updatedAt: 5},
    {id: '3', thread: 'create' as const, role: 'user' as const, content: 'Otra', createdAt: 4},
  ]};
  const merged = mergeDocChats(a, b);
  assert.deepEqual(merged.messages.map(m => m.id), ['1', '2', '3']);
  assert.equal(merged.messages[1].status, 'applied', 'the newest copy of a message wins');
});

test('the new records sync as their own kinds', () => {
  for (const kind of ['pdf-version', 'book-version', 'doc-chat']) {
    assert.ok(pushSchema.safeParse({device: 'd', changes: [{kind, key: 'pdf:abc-123', base: 0, data: {x: 1}}]}).success, kind);
  }
});

test('the assistant request is bounded and typed', () => {
  const base = {requestId: crypto.randomUUID(), model: 'auto', instruction: 'Agregá una página de ejercicios', context: pdf};
  assert.ok(assistantRequestSchema.safeParse(base).success);
  assert.ok(!assistantRequestSchema.safeParse({...base, context: {...pdf, kind: 'shell'}}).success);
  assert.ok(!assistantRequestSchema.safeParse({...base, instruction: 'x'.repeat(2001)}).success);
  assert.equal(stressCount('приве́т, зову́т'), 2);
});

test('conversations sent to a model start with the author and alternate', async () => {
  const {alternateTurns} = await import('../src/lib/assistant/edit-plan');
  assert.deepEqual(alternateTurns([
    {role: 'assistant', content: 'respuesta vieja'},
    {role: 'user', content: 'uno'},
    {role: 'user', content: 'dos'},
    {role: 'assistant', content: ''},
    {role: 'assistant', content: 'tres'},
  ]), [{role: 'user', content: 'uno\n\ndos'}, {role: 'assistant', content: 'tres'}]);
});
