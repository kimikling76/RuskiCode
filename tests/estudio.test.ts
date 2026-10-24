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

test('a model that names its images in the prompt: stray «@» dropped, every image named, whole names only', async () => {
  const {mentionPrompt} = await import('../src/lib/cinema/mentions');
  const kling = {mention: '@image_{n}', strictMentions: true};
  assert.equal(mentionPrompt('Una calle @lluvia con @image_1', kling, 2), 'Una calle lluvia con @image_1\n\nUse @image_2.');
  assert.equal(mentionPrompt('Sin imágenes, mail@ejemplo', kling, 0), 'Sin imágenes, mailejemplo');
  // «@image_10» is the tenth image, not the first one followed by a zero.
  assert.equal(mentionPrompt('Fondo de @image_10', kling, 10), 'Fondo de @image_10\n\nUse @image_1, @image_2, @image_3, @image_4, @image_5, @image_6, @image_7, @image_8, @image_9.');
  assert.equal(mentionPrompt('Arranca acá', {mention: '@first_frame', strictMentions: true}, 1), 'Arranca acá\n\nUse @first_frame.');
  // A model without documented names keeps the prompt exactly as written.
  assert.equal(mentionPrompt('Hola @Борис', {}, 3), 'Hola @Борис');
});

test('the cast is told which picture is whose when the model names images', () => {
  const called = mentioned('@Борис camina por el @Café Pushkin', cast);
  const refs = referencesFor([], called, 10);
  const text = composePrompt('@Борис camina por el @Café Pushkin', autoLooks(), called, m => m.reference ? '@image_' + (refs.indexOf(m.reference) + 1) : null);
  assert.equal(text, 'Борис camina por el Café Pushkin\n\nБорис (@image_1): A man of about 45, short beard. Café Pushkin: A 19th-century Moscow café with wooden panels.');
});

test('Kling 4.0 Reference to Video: images as image_urls, duration as a number, every image named', async () => {
  const {jobInput} = await import('../src/lib/cinema/kie-jobs');
  const {findModel} = await import('../src/lib/ai/models');
  const k4 = findModel('kling-4-0-reference-to-video');
  assert.ok(k4 && k4.category === 'video');
  assert.equal(k4.options.durationDefault, '5');
  assert.deepEqual(jobInput(k4, {prompt: 'Un faro de noche, @boceto', aspect: '21:9', resolution: '1080p', duration: '12', references: ['https://tempfile.aiquickdraw.com/a.png', 'https://tempfile.aiquickdraw.com/b.png']}), {
    prompt: 'Un faro de noche, boceto\n\nUse @image_1, @image_2.', image_urls: ['https://tempfile.aiquickdraw.com/a.png', 'https://tempfile.aiquickdraw.com/b.png'], aspect_ratio: '21:9', resolution: '1080p', duration: 12,
  });
  const key = findModel('kling-4-0-keyframe-to-video');
  assert.ok(key && key.category === 'video');
  assert.deepEqual(jobInput(key, {prompt: 'Despega', duration: '5', references: ['https://tempfile.aiquickdraw.com/a.png', 'https://tempfile.aiquickdraw.com/b.png']}), {
    prompt: 'Despega\n\nUse @first_frame.', first_frame_url: 'https://tempfile.aiquickdraw.com/a.png', duration: 5,
  });
});
