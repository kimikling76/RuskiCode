import test from 'node:test';
import assert from 'node:assert/strict';
import {applyPlan, planImport, refsWithFiles} from '../src/lib/kb/import';
import {entrySchema, KB_FORMAT, type EntryOf, type KbEntry, type KbRef} from '../src/lib/kb/model';
import {bookPicturePrompt, defaultPicks, pictureWarnings, placeMember, placeOfBook, plannedRefs} from '../src/lib/kb/picture';
import {retrieve} from '../src/lib/kb/retrieve';
import {parseDraft, pictureSlots, picturePrompt} from '../src/lib/skills/chat';
import {systemForPersonal, personalInput} from '../src/lib/personal-chat/input';
import crypto from 'node:crypto';

// «Lugares»: places of the book with approved pictures that go to image models as the place.

const ref = (n: number, review: KbRef['review'] = 'approved', extra: Partial<KbRef> = {}): KbRef => ({hash: String(n).repeat(64).slice(0, 64), mime: 'image/png', name: 'lugar-' + n + '.png', size: 1000, kind: 'scene', review, verified: 'unlisted', addedAt: n, ...extra});
const now = 1_700_000_000_000;
function entry<K extends 'character' | 'place'>(kind: K, id: string, title: string, data: Record<string, unknown>): EntryOf<K> {
  return entrySchema.parse({schema: 1, project: 'p', id, kind, title, body: '', status: 'approved', data, sources: [], tags: [], version: 1, createdAt: now, updatedAt: now, note: '', history: []}) as EntryOf<K>;
}
const school = entry('place', 'place.school', 'Школа', {nameRu: 'Школа', aliases: ['Школа', 'la escuela', 'school'], look: 'Red brick building with large windows.', refs: [ref(1), ref(2, 'observed')], mainRef: ref(1).hash});
const house = entry('place', 'place.house', 'Дом Миши и Маши', {nameRu: 'Дом Миши и Маши', aliases: ['casa de Misha y Masha'], refs: []});
const misha = entry('character', 'char.misha', 'Миша', {nameRu: 'Миша', aliases: ['Миша'], distinct: [], relations: [], refs: [ref(5)], mainRef: ref(5).hash});

test('a place is an entry with its pictures, and an export brings them back', () => {
  assert.equal(school.kind, 'place');
  assert.ok(!entrySchema.safeParse({...school, data: {...school.data, refs: 'x'}}).success);
  const file = {name: 'lugares.json', text: JSON.stringify({format: KB_FORMAT, entries: [{id: school.id, kind: 'place', title: school.title, status: 'observed', data: school.data}]})};
  const plan = planImport([file], []);
  const kept = refsWithFiles(plan.patches, new Map([[ref(1).hash, {}]]));
  assert.deepEqual(kept.left, ['lugar-2.png'], 'a picture whose file is not there is left out');
  const {entries, report} = applyPlan('p', new Map(), kept.patches, now);
  assert.deepEqual(report.created, ['place.school']);
  const made = entries[0] as EntryOf<'place'>;
  assert.equal(made.status, 'observed', 'imported as it says, never approved by the import itself');
  assert.equal(made.data.mainRef, ref(1).hash);
  assert.equal(made.data.refs.length, 1);
});

test('the place goes after the faces, within the limit, and the prompt names it', () => {
  const picks = [...defaultPicks([misha]), ...defaultPicks([school])];
  const {sent, left} = plannedRefs([misha, school], picks, 10);
  assert.deepEqual(sent.map(s => s.character), ['char.misha', 'place.school']);
  const prompt = bookPicturePrompt([misha], sent, {action: 'Misha reads', scene: 'Morning.', composition: '', style: ''}, school);
  assert.match(prompt, /Setting: Школа — keep the place exactly as in reference image 2 .*Red brick building with large windows\. Morning\./);
  const one = plannedRefs([misha, school], picks, 1);
  assert.deepEqual(one.sent.map(s => s.character), ['char.misha'], 'with one image the face wins');
  assert.ok(pictureWarnings([misha], one.sent, one.left, 1, school).some(w => w.includes('«Школа» va sin imagen')));
  assert.equal(left.length, 0);
});

test('a place is found by its name or an alias, never by a guess', () => {
  const all: KbEntry[] = [school, house, misha];
  assert.equal(placeOfBook('la Escuela', all)?.id, 'place.school');
  assert.equal(placeOfBook('школа', all)?.id, 'place.school');
  assert.equal(placeOfBook('a school', all), undefined);
  assert.equal(placeOfBook('Миша', all), undefined, 'a character is not a place');
  const twin = entry('place', 'place.school2', 'Школа №2', {nameRu: 'Школа №2', aliases: ['school'], refs: []});
  assert.equal(placeOfBook('school', [...all, twin]), undefined, 'two places with the same alias: none');
  assert.deepEqual(placeMember(school), {id: 'place.school', title: 'Школа', hash: ref(1).hash, file: 'lugar-1.png', look: 'Red brick building with large windows.'});
  assert.equal(placeMember(house).hash, undefined);
});

test('/pdf-generator: the text model gets the places and names them in its pictures', () => {
  const ctx = retrieve([school, house, misha], {query: 'Unidad 0', cast: true});
  const places = ctx.items.find(i => i.id === 'places');
  assert.ok(places);
  assert.match(places!.text, /- Школа \[aprobado\].*imagen aprobada/);
  assert.match(places!.text, /- Дом Миши и Маши .*sin imagen aprobada/);
  assert.equal(retrieve([school], {query: 'x'}).items.some(i => i.id === 'places'), false, 'only when the cast is asked for');
  const system = systemForPersonal(personalInput.parse({requestId: crypto.randomUUID(), model: 'auto', purpose: 'pdf-generator', messages: [{role: 'user', content: 'x'}]}));
  assert.match(system, /add "place"/);
  const draft = parseDraft(JSON.stringify({title: 'Алфавит', characters: [{name: 'Миша', look: 'A boy of 11.'}], blocks: [
    {type: 'image', prompt: 'Misha at his desk', aspect: '4:3', characters: ['Миша'], place: 'Школа'},
    {type: 'gallery', aspect: '1:1', items: [{prompt: 'An apple', label: 'А', place: ''}]},
  ]}))!;
  const slots = pictureSlots(draft);
  assert.equal(slots[0].place, 'Школа');
  assert.equal(slots[1].place, undefined);
  const text = picturePrompt(slots[0], 'Photo.', {cast: draft.characters, place: {title: 'Школа', look: 'Red brick building.', withPicture: true}});
  assert.match(text, /Place: Школа — keep the place exactly as in its reference picture .*Red brick building\./);
  assert.doesNotMatch(picturePrompt(slots[1], 'Photo.'), /Place:/);
});

// ---------- Repairing a book that got another book's file ----------
import {planUndo} from '../src/lib/kb/versions';

test('an export brings the whole entry: a field an older file wrote is taken out', () => {
  const first = {name: 'a.json', text: JSON.stringify({format: KB_FORMAT, entries: [{id: 'char.misha', kind: 'character', title: 'Миша', status: 'observed', data: {nameRu: 'Миша', aliases: [], distinct: [], relations: [], refs: [], age: 'unos 11 años (a confirmar)', look: 'A boy of about 11.'}}]})};
  const second = {name: 'b.json', text: JSON.stringify({format: KB_FORMAT, entries: [{id: 'char.misha', kind: 'character', title: 'Миша', status: 'observed', data: {nameRu: 'Миша', aliases: [], distinct: [], relations: [], refs: [], look: '14 years old.'}}]})};
  const one = applyPlan('p', new Map(), planImport([first], []).patches, now).entries;
  const two = applyPlan('p', new Map(one.map(e => [e.id, e])), planImport([second], []).patches, now + 1).entries[0] as EntryOf<'character'>;
  assert.equal(two.data.age, undefined);
  assert.equal(two.data.look, '14 years old.');
});

test('undoing an import: what it created goes, what it changed goes back, and later edits are counted', () => {
  const adult = {name: 'adultos.json', text: JSON.stringify({format: KB_FORMAT, entries: [{id: 'char.misha', kind: 'character', title: 'Миша', status: 'observed', data: {nameRu: 'Миша', aliases: [], distinct: [], relations: [], refs: [], look: '14 years old.'}}]})};
  const kids = {name: 'ninos.json', text: JSON.stringify({format: KB_FORMAT, entries: [
    {id: 'char.misha', kind: 'character', title: 'Миша', status: 'proposed', data: {nameRu: 'Миша', aliases: [], distinct: [], relations: [], refs: [], look: 'About 11.'}},
    {id: 'place.ufo', kind: 'place', title: 'НЛО', status: 'proposed', data: {nameRu: 'НЛО', aliases: [], refs: []}},
  ]})};
  let store = new Map<string, KbEntry>();
  for (const [f, t] of [[adult, now], [kids, now + 10]] as const) for (const e of applyPlan('p', store, planImport([f], []).patches, t).entries) store.set(e.id, e);
  const steps = planUndo([...store.values()], ['ninos.json']);
  assert.deepEqual(steps.map(s => [s.id, s.action, s.version, s.later]), [['place.ufo', 'remove', undefined, 0], ['char.misha', 'restore', 1, 0]]);
  assert.deepEqual(planUndo([...store.values()], ['otro.json']), []);
  // An approval after the wrong import is counted, so the author is told it goes too.
  const misha = store.get('char.misha')!;
  const approved = {...misha, version: misha.version + 1, status: 'approved', note: 'Aprobado por el autor', history: [...misha.history, {version: misha.version, at: now, status: misha.status, title: misha.title, body: misha.body, data: misha.data, sources: misha.sources, note: misha.note}]} as KbEntry;
  assert.equal(planUndo([approved], ['ninos.json'])[0].later, 1);
});
