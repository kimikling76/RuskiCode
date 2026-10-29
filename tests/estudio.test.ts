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

test('«@image1», «@image2»… name the pictures sent, in each model\'s own words', async () => {
  const {mentionPrompt} = await import('../src/lib/cinema/mentions');
  // Models without documented names: plain «image 1», as image models read it. A picture not sent stays as written.
  assert.equal(mentionPrompt('La chica de @image1 frente a @Image_2 y @image3', {}, 2), 'La chica de image 1 frente a image 2 y @image3');
  // Kling 4.0 Reference: its own `@image_1`; everything sent is named, so nothing is added.
  assert.equal(mentionPrompt('@image1 camina hacia @image2', {mention: '@image_{n}', strictMentions: true}, 2), '@image_1 camina hacia @image_2');
  // Kling 4.0 Keyframe: the one starting picture is `@first_frame`; a second one does not exist, so its «@» goes.
  assert.equal(mentionPrompt('Desde @image1 hasta @image2', {mention: '@first_frame', strictMentions: true}, 1), 'Desde @first_frame hasta image2');
  // «@image10» is the tenth picture, not «@image1» followed by a zero.
  assert.equal(mentionPrompt('@image10', {}, 10), 'image 10');
});

test('video models whose seconds Kie gives as a range offer every second, from the documented default', async () => {
  const {jobInput} = await import('../src/lib/cinema/kie-jobs');
  const {findModel, videoModels, enabledStatus} = await import('../src/lib/ai/models');
  const seconds = (lo: number, hi: number) => Array.from({length: hi - lo + 1}, (_, i) => String(lo + i));
  // «Video duration in 4-15 seconds or -1» (only in the description), «within [2, 30]», «(6-30)», minimum and maximum.
  for (const [id, lo, hi, def] of [['bytedance-seedance-2', 4, 15, '5'], ['bytedance-seedance-2-5', 4, 30, '5'], ['wan-3-0-video', 2, 30, '5'], ['wan-2-7-text-to-video', 2, 15, '5'],
    ['happyhorse-1-1-text-to-video', 3, 15, '5'], ['vidu-q4-image-to-video', 3, 16, '5'], ['grok-imagine-text-to-video', 6, 30, undefined], ['grok-imagine-video-1-5-preview', 1, 15, '8']] as const) {
    const m = findModel(id);
    assert.ok(m && m.category === 'video', id);
    assert.deepEqual(m.options.durations, seconds(lo, hi), id);
    assert.equal(m.options.durationDefault, def, id);
  }
  const seedance = findModel('bytedance-seedance-2');
  assert.ok(seedance && seedance.category === 'video');
  assert.equal(jobInput(seedance, {prompt: 'Olas', duration: '12', references: []}).duration, 12);
  // Grok Imagine Image to Video types its duration as a string: it goes as one.
  const grok = findModel('grok-imagine-image-to-video');
  assert.ok(grok && grok.category === 'video');
  assert.equal(jobInput(grok, {prompt: 'Olas', duration: '10', references: []}).duration, '10');
  // Every enabled video model that sends a duration offers at least one, and its default is one of them.
  for (const m of videoModels.filter(enabledStatus)) {
    if (m.options.fields.duration) assert.ok(m.options.durations.length, m.id);
    if (m.options.durationDefault) assert.ok(m.options.durations.includes(m.options.durationDefault), m.id);
  }
});

test('each model takes the longest prompt its page documents; without one, 20 000 for images and the old 4000 for video', async () => {
  const {findModel, promptLimit, imageModels, videoModels, enabledStatus} = await import('../src/lib/ai/models');
  const limit = (id: string) => { const m = findModel(id); assert.ok(m && 'options' in m && m.options, id); return promptLimit(m.options, m.category === 'video' ? 'video' : 'image'); };
  assert.equal(limit('nano-banana-2-1'), 20000);
  assert.equal(limit('kling-4-0-reference-to-video'), 8000);
  assert.equal(limit('hailuo-02-text-to-video-pro'), 1500);
  assert.equal(limit('veo-3-1'), 4000);
  // No documented limit: images take 20 000, the longest Kie documents; «up to 20,000 characters» is read too.
  assert.equal(limit('gpt-image-1-5-text-to-image'), 20000);
  assert.equal(limit('gpt-image-2-image-to-image'), 20000);
  for (const m of [...imageModels, ...videoModels].filter(enabledStatus)) assert.ok(promptLimit(m.options, m.category) >= 200, m.id);
});

test('reference videos: the models that take them, sent in the model\'s field and named @video1, @video2…', async () => {
  const {jobInput} = await import('../src/lib/cinema/kie-jobs');
  const {findModel} = await import('../src/lib/ai/models');
  const {mentionPrompt} = await import('../src/lib/cinema/mentions');
  const {uploadedVideoSchema, videoLimitBytes, VIDEO_PART_BYTES} = await import('../src/lib/cinema/video-refs');
  const video = (id: string) => { const m = findModel(id); assert.ok(m && m.category === 'video', id); return m; };
  // What each page documents: field, count, size per file, seconds per video and in total.
  const seedance = video('bytedance-seedance-2');
  assert.equal(seedance.options.fields.videos, 'reference_video_urls');
  assert.equal(seedance.options.maxVideos, 3);
  assert.equal(seedance.options.videoMaxMB, 50);
  assert.deepEqual(seedance.options.videoSeconds, [2, 15]);
  assert.equal(seedance.options.videoTotalSeconds, 15);
  const v2v = video('wan-2-6-video-to-video');
  assert.equal(v2v.status, 'docs');
  assert.ok(v2v.options.videosRequired);
  assert.equal(v2v.options.videoMaxMB, 10);
  const r2v = video('wan-2-7-r2v');
  assert.equal(r2v.options.maxMedia, 5);
  assert.ok(r2v.options.mediaRequired);
  const edit = video('happyhorse-video-edit');
  assert.ok(edit.options.fields.videosSingle && edit.options.videosRequired);
  // The request: videos in their field (a list, or one link), images apart.
  const link = 'https://tempfile.redpandaai.co/kieai/ruskicode/chat/a.mp4';
  assert.deepEqual(jobInput(seedance, {prompt: 'Baila como @video1', duration: '5', references: [], videos: [link]}).reference_video_urls, [link]);
  assert.equal(jobInput(edit, {prompt: 'Que sea de noche', references: [], videos: [link]}).video_url, link);
  // Kling 4.0 names them `@video_1`; every video sent is named, and stray «@» are dropped.
  const k4 = video('kling-4-0-reference-to-video');
  assert.equal(k4.options.videoMention, '@video_{n}');
  assert.equal(jobInput(k4, {prompt: 'Como en @video1, con @image1', duration: '5', references: ['https://tempfile.aiquickdraw.com/a.png'], videos: [link, link]}).prompt, 'Como en @video_1, con @image_1\n\nUse @video_2.');
  // Elsewhere «@video1» becomes «video 1».
  assert.equal(mentionPrompt('Como @video1', {}, 0, 1), 'Como video 1');
  // A video from this computer travels in parts; the parts must match the size.
  const sha = 'a'.repeat(64);
  assert.ok(uploadedVideoSchema.safeParse({sha, mime: 'video/mp4', size: VIDEO_PART_BYTES + 1, parts: ['b'.repeat(64), 'c'.repeat(64)]}).success);
  assert.equal(uploadedVideoSchema.safeParse({sha, mime: 'video/mp4', size: VIDEO_PART_BYTES + 1, parts: ['b'.repeat(64)]}).success, false);
  assert.equal(uploadedVideoSchema.safeParse({sha, mime: 'video/webm', size: 10, parts: ['b'.repeat(64)]}).success, false);
  // The studio never passes on more than 50 MB; a page may allow less.
  assert.equal(videoLimitBytes(200), 50_000_000);
  assert.equal(videoLimitBytes(10), 10_000_000);
});

test('Gemini Omni: one video as a clip {url, start, ends} of up to 10 s, taking two of its seven image slots', async () => {
  const {jobInput} = await import('../src/lib/cinema/kie-jobs');
  const {findModel} = await import('../src/lib/ai/models');
  const {clipProblem, defaultClip, videoRoom} = await import('../src/lib/cinema/video-refs');
  for (const id of ['gemini-omni-video', 'google-gemini-omni-flash-1-1']) {
    const m = findModel(id);
    assert.ok(m && m.category === 'video', id);
    const o = m.options;
    assert.ok(o.fields.videoClips);
    assert.equal(o.fields.videos, 'video_list');
    assert.equal(o.maxReferences, 7);
    assert.equal(o.maxVideos, 1);
    assert.equal(o.videoClipSeconds, 10);
    assert.deepEqual(o.videoSeconds, [0.5, 30]);
    assert.equal(o.videoSlots, 2);
    assert.equal(o.maxMedia, 7);
    // With 5 images there is room for one video (2 slots); with 6, none.
    assert.equal(videoRoom(o, 5), 1);
    assert.equal(videoRoom(o, 6), 0);
    const link = 'https://tempfile.redpandaai.co/kieai/ruskicode/chat/a.mp4';
    assert.deepEqual(jobInput(m, {prompt: 'Como @video1', duration: '8', references: [], videos: [link], clips: [{start: 2, ends: 9.5}]}).video_list, [{url: link, start: 2, ends: 9.5}]);
    assert.deepEqual(defaultClip(o, 4), {start: 0, ends: 4});
    assert.deepEqual(defaultClip(o), {start: 0, ends: 10});
    assert.equal(clipProblem({start: 0, ends: 12}, o), 'El tramo dura 12 s: este modelo toma hasta 10 s.');
    assert.match(clipProblem({start: 3, ends: 2}, o), /después del comienzo/);
    assert.match(clipProblem({start: 20, ends: 28}, o, 25), /pasa el largo del video/);
    assert.equal(clipProblem({start: 20, ends: 28}, o), '');
  }
});
