import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog, textModels, imageModels, videoModels, findModel, enabledStatus, publicModel, mediaSummary} from '../src/lib/ai/models';
import {resolveText, textConfig, availableText} from '../src/lib/ai/kie-text';
import {createProvider, ProviderError} from '../src/lib/ai/provider';
import {jobInput, createJob, CinemaError} from '../src/lib/cinema/kie-jobs';
import {personalInput, systemForPersonal} from '../src/lib/personal-chat/input';
import {PERSONAL_SYSTEM} from '../src/lib/personal-chat/state';
import {canonical, tokenOf} from '../src/lib/sync/canonical';
import {pushSchema} from '../src/lib/sync/server';
import {seedAssistants, isPristineSeed} from '../src/store/assistants';

function sse(text: string) {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({start(c) { for (let i = 0; i < bytes.length; i += 5) c.enqueue(bytes.slice(i, i + 5)); c.close(); }});
}
const streamed = (text: string) => new Response(sse(text), {headers: {'Content-Type': 'text/event-stream'}});
const generate = (p: ReturnType<typeof createProvider>) => p.generate({messages: [{role: 'user', content: 'Привет'}], system: 'Sé breve.', signal: new AbortController().signal});

async function withKey<T>(fn: () => Promise<T> | T) {
  const saved = process.env.KIE_API_KEY;
  process.env.KIE_API_KEY = 'test-key';
  try { return await fn(); } finally { if (saved === undefined) delete process.env.KIE_API_KEY; else process.env.KIE_API_KEY = saved; }
}

test('the catalog is consistent: unique ids, Kie endpoints, a reason for every disabled model, no invented options', () => {
  assert.equal(new Set(catalog.map(m => m.id)).size, catalog.length);
  for (const m of catalog) {
    assert.ok(m.endpoint.startsWith('https://api.kie.ai/'), m.id + ' endpoint');
    assert.ok(/^https:\/\/(docs\.)?kie\.ai\//.test(m.docs), m.id + ' docs');
    assert.ok(m.checked, m.id + ' checked');
    if (!enabledStatus(m)) assert.ok(m.missing, m.id + ' says what is missing');
    // An adapter the server does not implement, or a kind of model with no screen, can never be enabled.
    if (m.adapter === 'kie-dedicated' || m.category === 'audio') assert.equal(enabledStatus(m), false, m.id);
    if (m.category === 'text') assert.ok(['openai-chat', 'anthropic-messages', 'openai-responses', 'gemini-native'].includes(m.adapter), m.id);
    if (m.price) assert.ok(m.price.source, m.id + ' price needs its source');
  }
  for (const m of [...imageModels, ...videoModels].filter(enabledStatus)) {
    const o = m.options;
    assert.ok(o.fields.prompt, m.id);
    if (o.aspectRatios.length) assert.ok(o.fields.aspect, m.id + ' aspect field');
    if (o.resolutions.length) assert.ok(o.fields.resolution, m.id + ' resolution field');
    if (o.durations.length) assert.ok(o.fields.duration, m.id + ' duration field');
    if (o.maxReferences) assert.ok(o.fields.images, m.id + ' references field');
    if (o.fields.imagesSingle) assert.equal(o.maxReferences, 1, m.id + ' takes one image');
    if (!o.modes.includes('create')) assert.ok(o.maxReferences, m.id + ' edits, so it takes images');
    assert.ok(o.maxVariants >= 1, m.id);
  }
  // Today: the two Gemini models and the image model are in real use; the rest comes from Kie's documentation.
  assert.deepEqual(catalog.filter(m => m.status === 'tested').map(m => m.id), ['kie-flash', 'kie-pro', 'nano-banana-2-1']);
  assert.ok(videoModels.some(enabledStatus));
  assert.ok(textModels.some(m => m.adapter === 'anthropic-messages' && m.status === 'docs'));
  // A tested entry replaces the generated one for the same endpoint, and keeps what the documentation says it reads.
  assert.equal(textModels.filter(m => m.endpoint.endsWith('/gemini-3-8-flash-openai/v1/chat/completions')).length, 1);
  assert.deepEqual(findModel('kie-flash')!.category === 'text' && (findModel('kie-flash') as {inputs?: string[]}).inputs, ['image', 'pdf']);
});

test('the browser only sees what the pickers need: no endpoint or provider id', () => {
  const m = publicModel(findModel('claude-sonnet-4-6')!, true);
  assert.equal(m.available, true);
  assert.equal('endpoint' in m, false);
  assert.equal('providerModel' in m, false);
  assert.equal(publicModel(findModel('ai-music-api-generate')!, true).available, false, 'a model without a screen is never available');
  assert.equal(publicModel(findModel('kie-flash')!, false).available, false, 'no key, nothing available');
});

test('«Auto» still means the fast Gemini model, and disabled, other kinds or unknown ids never resolve', () => withKey(() => {
  assert.equal(resolveText('auto')?.id, 'kie-flash');
  assert.equal(resolveText('claude-haiku-4-5')?.id, 'claude-haiku-4-5');
  assert.equal(resolveText('ai-music-api-generate'), undefined);
  assert.equal(resolveText('nano-banana-2-1'), undefined);
  assert.equal(resolveText('no-existe'), undefined);
  assert.ok(availableText().every(enabledStatus));
  const saved = process.env.KIE_API_KEY;
  delete process.env.KIE_API_KEY;
  try { assert.deepEqual(availableText(), []); } finally { process.env.KIE_API_KEY = saved; }
}));

test('Claude through Kie uses the Anthropic format with a Bearer key, not the OpenAI one', () => withKey(async () => {
  const m = findModel('claude-sonnet-4-6');
  assert.ok(m && m.category === 'text');
  let seen: {url: string; headers: Record<string, string>; body: Record<string, unknown>} | undefined;
  const mock = (async (url: string, init?: RequestInit) => {
    seen = {url: String(url), headers: init!.headers as Record<string, string>, body: JSON.parse(init!.body as string)};
    return streamed('data: {"type":"message_start","message":{"usage":{"input_tokens":7}}}\n\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Здравствуйте"}}\n\ndata: {"type":"message_delta","usage":{"output_tokens":2}}\n\ndata: {"type":"message_stop"}\n\n');
  }) as typeof fetch;
  const r = await generate(createProvider(textConfig(m), mock));
  assert.equal(r.text, 'Здравствуйте');
  assert.equal(seen?.url, 'https://api.kie.ai/claude/v1/messages');
  assert.equal(seen?.headers.Authorization, 'Bearer test-key');
  assert.equal(seen?.headers['x-api-key'], undefined);
  assert.equal(seen?.body.model, 'claude-sonnet-4-6');
  assert.equal(seen?.body.system, 'Sé breve.');
  assert.equal('choices' in (seen?.body || {}), false);
}));

test('the Responses adapter sends instructions + input, reads deltas, and treats failures and cut streams as errors', () => withKey(async () => {
  const m = findModel('gpt-5-5');
  assert.ok(m && m.category === 'text' && m.adapter === 'openai-responses');
  let sent: Record<string, unknown> | undefined;
  const ok = (async (_u: string, init?: RequestInit) => {
    sent = JSON.parse(init!.body as string);
    return streamed('data: {"type":"response.output_text.delta","delta":"При"}\n\ndata: {"type":"response.output_text.delta","delta":"вет"}\n\ndata: {"type":"response.completed","response":{"usage":{"input_tokens":3,"output_tokens":2}}}\n\n');
  }) as typeof fetch;
  const r = await generate(createProvider(textConfig(m), ok));
  assert.equal(r.text, 'Привет');
  assert.equal(sent?.instructions, 'Sé breve.');
  assert.deepEqual(sent?.input, [{role: 'user', content: 'Привет'}]);
  const failed = (async () => streamed('data: {"type":"response.output_text.delta","delta":"x"}\n\ndata: {"type":"response.failed"}\n\n')) as typeof fetch;
  await assert.rejects(generate(createProvider(textConfig(m), failed)), ProviderError);
  const cut = (async () => streamed('data: {"type":"response.output_text.delta","delta":"x"}\n\n')) as typeof fetch;
  await assert.rejects(generate(createProvider(textConfig(m), cut)), ProviderError);
}));

test('jobInput only sends the fields the model documents', () => {
  const nano = imageModels.find(m => m.id === 'nano-banana-2-1')!;
  assert.deepEqual(jobInput(nano, {prompt: 'Aula', aspect: '16:9', resolution: '2K', duration: '5', references: ['https://x.test/a.png']}), {
    prompt: 'Aula', image_input: ['https://x.test/a.png'], aspect_ratio: '16:9', resolution: '2K', output_format: nano.options.outputFormat,
  });
  const noRefs = {...nano, options: {...nano.options, maxReferences: 0}};
  assert.equal('image_input' in jobInput(noRefs, {prompt: 'Aula', references: ['https://x.test/a.png']}), false);
});

test('createTask checks both the HTTP status and Kie\'s code, and a lost reply is «uncertain», not «failed»', () => withKey(async () => {
  const nano = imageModels.find(m => m.id === 'nano-banana-2-1')!;
  const input = {prompt: 'Aula', aspect: '1:1', resolution: '1K', references: []};
  const reply = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), {status})) as typeof fetch;
  assert.equal(await createJob(nano, input, reply({code: 200, data: {taskId: 't1'}})), 't1');
  await assert.rejects(createJob(nano, input, reply({code: 402, msg: 'Insufficient credits'})), (e: CinemaError) => e.message === 'INSUFFICIENT_BALANCE');
  await assert.rejects(createJob(nano, input, reply({code: 200, data: {}})), (e: CinemaError) => e.message === 'PROVIDER_UNAVAILABLE');
  await assert.rejects(createJob(nano, input, reply({}, 500)), (e: CinemaError) => e.message !== 'CREATE_UNCERTAIN');
  const lost = (async () => { throw new TypeError('network'); }) as typeof fetch;
  await assert.rejects(createJob(nano, input, lost), (e: CinemaError) => e.message === 'CREATE_UNCERTAIN');
  const dedicated = videoModels.find(m => m.adapter === 'kie-dedicated')!;
  await assert.rejects(createJob(dedicated, input, reply({code: 200, data: {taskId: 'x'}})), (e: CinemaError) => e.message === 'MODEL_NOT_CONFIGURED');
}));

test('the normal Chat stays neutral; a chosen assistant adds its instructions without promising actions', () => {
  const base = {requestId: crypto.randomUUID(), model: 'auto', messages: [{role: 'user' as const, content: 'Hola'}]};
  assert.equal(systemForPersonal(personalInput.parse(base)), PERSONAL_SYSTEM);
  const chosen = systemForPersonal(personalInput.parse({...base, assistant: {name: 'Director de video', instructions: 'Pensá en planos.'}}));
  assert.ok(chosen.startsWith(PERSONAL_SYSTEM));
  assert.ok(chosen.includes('«Director de video»'));
  assert.ok(chosen.includes('<assistant_instructions>\nPensá en planos.\n</assistant_instructions>'));
  assert.ok(chosen.includes('never claim to have saved, generated'));
  assert.equal(chosen.includes('Verified generation options'), false);
  const withMedia = systemForPersonal(personalInput.parse({...base, assistant: {name: 'Coach', instructions: 'Ayudá con prompts.', mediaCatalog: true}}));
  assert.ok(withMedia.includes(mediaSummary()));
  const studio = systemForPersonal(personalInput.parse({...base, purpose: 'prompt', assistant: {name: 'Coach', instructions: 'Ayudá con prompts.'}}));
  assert.ok(studio.includes('Never break the required output format'));
  assert.throws(() => personalInput.parse({...base, assistant: {name: 'X', instructions: 'a'.repeat(8001)}}));
  assert.throws(() => personalInput.parse({...base, assistant: {name: 'X', instructions: 'ok', tools: ['web']}}));
});

test('the media summary details the tested models, names the other enabled ones and never a disabled one', () => {
  const s = mediaSummary();
  assert.ok(s.includes('- Nano Banana 2.1 (imagen): proporciones'));
  assert.ok(s.includes('Otros modelos de video habilitados') && s.includes('Veo 3.1'));
  assert.equal(s.includes('Topaz'), false, 'an upscaler has no screen');
  assert.equal(s.includes('Suno'), false);
  assert.ok(s.length < 6000, 'short enough for a system prompt');
});

test('sync change detection ignores key order (jsonb reorders) but not real changes', () => {
  const a = {b: 1, a: [{y: 2, x: 1}], c: undefined};
  const b = {a: [{x: 1, y: 2}], b: 1};
  assert.equal(canonical(a), canonical(b));
  assert.equal(tokenOf(a), tokenOf(b));
  assert.notEqual(tokenOf({a: [1, 2]}), tokenOf({a: [2, 1]}));
  assert.notEqual(tokenOf({title: 'Чат'}), tokenOf({title: 'Чат '}));
});

test('sync pushes are validated: known kinds, safe keys, data or a deletion, at most 100 changes', () => {
  const ok = {device: 'd1', changes: [{kind: 'chat', key: 'abc-1', base: 0, data: {title: 'x'}}, {kind: 'chat', key: 'abc-2', base: 3, deleted: true}]};
  assert.ok(pushSchema.safeParse(ok).success);
  assert.equal(pushSchema.safeParse({device: 'd1', changes: [{kind: 'secret', key: 'a', base: 0, data: 1}]}).success, false);
  assert.equal(pushSchema.safeParse({device: 'd1', changes: [{kind: 'chat', key: '../a', base: 0, data: 1}]}).success, false);
  assert.equal(pushSchema.safeParse({device: 'd1', changes: [{kind: 'chat', key: 'a', base: 0}]}).success, false);
  assert.equal(pushSchema.safeParse({device: 'd1', changes: [{kind: 'chat', key: 'a', base: 1, deleted: true, data: 1}]}).success, false);
  assert.equal(pushSchema.safeParse({device: 'd1', changes: Array.from({length: 101}, (_, i) => ({kind: 'chat', key: 'k' + i, base: 0, data: 1}))}).success, false);
});

test('the three starter assistants are identical on every computer, so seeding twice never conflicts', () => {
  assert.deepEqual(seedAssistants.map(a => a.name), ['Editor del libro de ruso', 'Coach de prompts para imagen y video', 'Director de video']);
  for (const a of seedAssistants) {
    assert.ok(isPristineSeed({...a}));
    assert.equal(isPristineSeed({...a, instructions: a.instructions + ' más'}), false);
    assert.ok(a.instructions.length <= 8000);
  }
  // The book editor never decides on its own.
  assert.ok(/confirm/i.test(seedAssistants[0].instructions));
});
