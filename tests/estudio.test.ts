import test from 'node:test';
import assert from 'node:assert/strict';
import {autoLooks, composePrompt, mentioned, mentionQuery, referencesFor, type Mention} from '../src/lib/cinema/studio-looks';

const cast: Mention[] = [
  {name: 'Борис', description: 'A man of about 45, short beard.', reference: 'asset:' + 'a'.repeat(64)},
  {name: 'Борис Петрович', description: 'A doctor of about 45 in a white coat.', reference: 'asset:' + 'b'.repeat(64)},
  {name: 'Café Pushkin', description: 'A 19th-century Moscow café with wooden panels.'},
];

test('«@» finds each name once, the longest first, and keeps the order of the scene', () => {
  const called = mentioned('@Борис Петрович entra al @Café Pushkin', cast);
  assert.deepEqual(called.map(m => m.name), ['Борис Петрович', 'Café Pushkin']);
  assert.deepEqual(mentioned('En el @Café Pushkin, @Борис espera a @Борис Петрович', cast).map(m => m.name), ['Café Pushkin', 'Борис', 'Борис Петрович']);
  assert.equal(mentionQuery('una escena con @Бо'), 'Бо');
  assert.equal(mentionQuery('correo@ejemplo'), null);
  assert.equal(mentionQuery('@'), '');
});

test('the prompt says who is called and the chosen looks; «Auto» adds nothing', () => {
  assert.equal(composePrompt('  Una calle de noche ', autoLooks(), []), 'Una calle de noche');
  const called = mentioned('@Борис Петрович camina', cast);
  const text = composePrompt('@Борис Петрович camina', {...autoLooks(), camera: 'drone', light: 'neon'}, called);
  assert.equal(text, 'Борис Петрович camina\n\nБорис Петрович: A doctor of about 45 in a white coat.\nAerial drone shot. Neon lighting, colored reflections.');
});

test('references: the chosen ones first, then the called pictures, without repeats and up to the model limit', () => {
  const chosen = ['https://tempfile.aiquickdraw.com/x.png'];
  const called = mentioned('@Борис Петрович y @Борис', cast);
  assert.deepEqual(referencesFor(chosen, called, 10), ['https://tempfile.aiquickdraw.com/x.png', 'asset:' + 'b'.repeat(64), 'asset:' + 'a'.repeat(64)]);
  assert.deepEqual(referencesFor(chosen, mentioned('@Борис y @Борис Петрович', cast), 2), ['https://tempfile.aiquickdraw.com/x.png', 'asset:' + 'a'.repeat(64)]);
  assert.deepEqual(referencesFor(chosen, called, 1), ['https://tempfile.aiquickdraw.com/x.png']);
  assert.deepEqual(referencesFor(chosen, called, 0), []);
});
