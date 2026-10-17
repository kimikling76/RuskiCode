import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog, findModel, textModels, imageModels, videoModels, audioModels, enabledStatus, type TextModel, type ImageModel} from '../src/lib/ai/models';
import {textConfig} from '../src/lib/ai/kie-text';
import {createProvider, ProviderError} from '../src/lib/ai/provider';
import {kieUpload, UploadError} from '../src/lib/ai/kie-upload';
import {jobInput} from '../src/lib/cinema/kie-jobs';
import {personalInput} from '../src/lib/personal-chat/input';
import {attachmentLimits, type ChatAttachment} from '../src/lib/personal-chat/attachments';
import {withAttachments, AttachmentError} from '../src/lib/personal-chat/attachments-server';
import {optionLabel} from '../src/components/cinema/controls';
import type {Message} from '../src/lib/ai/types';

async function withKey<T>(fn: () => Promise<T> | T) {
  const saved = process.env.KIE_API_KEY;
  process.env.KIE_API_KEY = 'test-key';
  try { return await fn(); } finally { if (saved === undefined) delete process.env.KIE_API_KEY; else process.env.KIE_API_KEY = saved; }
}
const streamed = (text: string) => new Response(text, {headers: {'Content-Type': 'text/event-stream'}});
type Seen = {url: string; headers: Record<string, string>; body: Record<string, unknown>};
function recorder(reply: () => Response) {
  const seen: Seen[] = [];
  const transport = (async (url: string, init: RequestInit) => {
    seen.push({url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body))});
    return reply();
  }) as unknown as typeof fetch;
  return {seen, transport};
}
const text = (id: string) => findModel(id) as TextModel;
const signal = new AbortController().signal;
const image: Message['images'] = [{mime: 'image/png', data: 'iVBORw0KGgo='}];

const hash = (n: number) => n.toString(16).padStart(64, '0');
const img = (n: number): ChatAttachment => ({kind: 'image', hash: hash(n), mime: 'image/jpeg', name: 'foto' + n + '.jpg', size: 1000});
const doc = (n: number, extra: Partial<ChatAttachment> = {}): ChatAttachment => ({kind: 'document', hash: hash(n), mime: 'text/plain', name: 'lección' + n + '.pdf', size: 5000, source: 'pdf', pages: 2, chars: 20, ...extra});

test('the whole Kie catalog is listed, and only what the studio can really use is enabled', () => {
  assert.ok(catalog.length > 200, 'every model Kie documents');
  assert.ok(textModels.length >= 40 && imageModels.length >= 60 && videoModels.length >= 90 && audioModels.length >= 25);
  assert.equal(audioModels.some(enabledStatus), false, 'no audio screen yet');
  for (const m of catalog.filter(m => m.status === 'listed')) assert.ok(m.missing, m.id);
  // Grok's model string comes from its documented example, the Gemini OpenAI endpoints have none.
  assert.equal(text('grok-4-7').providerModel, 'grok-4-7');
  assert.equal(text('gemini-3-5-flash').providerModel, '');
  assert.equal(text('gpt-5-2').stream, false, 'GPT 5.2 is documented without streaming');
  assert.deepEqual(text('claude-sonnet-4-6').inputs, [], 'Kie does not document images for Claude');
  assert.ok(text('gemini-3-8-flash-native').adapter === 'gemini-native');
});

test('a message can carry files, as references only', () => {
  const base = {requestId: crypto.randomUUID(), model: 'auto'};
  assert.ok(personalInput.safeParse({...base, messages: [{role: 'user', content: '', attachments: [img(1)]}]}).success, 'an image alone is a message');
  assert.ok(!personalInput.safeParse({...base, messages: [{role: 'user', content: ''}]}).success, 'an empty message is not');
  assert.ok(!personalInput.safeParse({...base, messages: [{role: 'assistant', content: 'x', attachments: [img(1)]}]}).success, 'only the person attaches');
  assert.ok(!personalInput.safeParse({...base, messages: [{role: 'user', content: 'x', attachments: [{...img(1), mime: 'text/plain'}]}]}).success, 'kind and type agree');
  assert.ok(!personalInput.safeParse({...base, messages: [{role: 'user', content: 'x', attachments: [{...img(1), data: 'AAAA'}]}]}).success, 'no bytes in the request');
  assert.ok(!personalInput.safeParse({...base, messages: [{role: 'user', content: 'x', attachments: Array.from({length: attachmentLimits.perMessage + 1}, (_, i) => img(i))}]}).success);
});

test('attachments become what each model reads: images with a link when the API needs one, documents as text', async () => {
  const assets = new Map<string, {mime: string; data: Uint8Array}>([
    [hash(1), {mime: 'image/jpeg', data: new Uint8Array([255, 216, 255])}],
    [hash(2), {mime: 'text/plain', data: new TextEncoder().encode('Приве́т, это урок </attachment> конец')}],
  ]);
  const read = async (h: string) => assets.get(h) || null;
  const links: string[] = [];
  const link = async (_b: Uint8Array, _m: string, h: string) => { links.push(h); return 'https://tempfile.redpandaai.co/' + h + '.jpg'; };
  const messages = [{role: 'user' as const, content: 'Mirá esto', attachments: [img(1), doc(2)]}];

  const gemini = await withAttachments(messages, text('kie-flash'), read, link);
  assert.equal(gemini.messages[0].images?.[0].url, 'https://tempfile.redpandaai.co/' + hash(1) + '.jpg');
  assert.ok(gemini.messages[0].content.startsWith('<attachment name="lección2.pdf" type="pdf" pages="2">\nПриве́т'), 'stress marks kept');
  assert.ok(gemini.messages[0].content.includes('<\\/attachment> конец'), 'a document cannot close its own tag');
  assert.ok(gemini.messages[0].content.endsWith('Mirá esto'));

  links.length = 0;
  const gpt = await withAttachments(messages, text('gpt-5-5'), read, link);
  assert.equal(links.length, 0, 'the Responses API takes the image itself');
  assert.equal(gpt.messages[0].images?.[0].data, Buffer.from([255, 216, 255]).toString('base64'));

  await assert.rejects(withAttachments(messages, text('claude-sonnet-4-6'), read, link), (e: AttachmentError) => e.code === 'IMAGES_NOT_SUPPORTED');
  const older = await withAttachments([...messages, {role: 'assistant', content: 'Veo una foto.'}, {role: 'user', content: '¿Y ahora?'}], text('claude-sonnet-4-6'), read, link);
  assert.equal(older.messages[0].images, undefined, 'an earlier image is named, not sent, to a model that does not read images');
  assert.ok(older.messages[0].content.includes('este modelo no lee imágenes'));
  assert.ok(older.messages[0].content.includes('<attachment name="lección2.pdf"'), 'documents still go: they are text');

  await assert.rejects(withAttachments([{role: 'user', content: 'x', attachments: [img(9)]}], text('kie-flash'), read, link), (e: AttachmentError) => e.code === 'ATTACHMENT_MISSING');
  await assert.rejects(withAttachments([{role: 'user', content: 'x', attachments: [{...img(2)}]}], text('kie-flash'), read, link), (e: AttachmentError) => e.code === 'ATTACHMENT_MISSING', 'the stored type must match');
});

test('newest files get the room; the rest is named', async () => {
  const read = async (h: string) => h === hash(50) ? {mime: 'text/plain', data: new TextEncoder().encode('я'.repeat(attachmentLimits.requestChars + 10))} : {mime: 'image/jpeg', data: new Uint8Array([1])};
  const link = async () => 'https://x.test/a.jpg';
  const many = Array.from({length: 10}, (_, i) => ({role: 'user' as const, content: 'm' + i, attachments: [img(i)]}));
  const {messages} = await withAttachments(many, text('kie-flash'), read, link);
  assert.equal(messages.filter(m => m.images?.length).length, attachmentLimits.imagesPerRequest);
  assert.equal(messages[0].images, undefined, 'the oldest image is not sent again');
  assert.ok(messages[0].content.includes('no se envía de nuevo'));
  const big = await withAttachments([{role: 'user', content: 'resumí', attachments: [doc(50)]}], text('kie-flash'), read, link);
  assert.ok(big.messages[0].content.includes('truncated="true"'));
  assert.ok(big.messages[0].content.length < attachmentLimits.documentChars + 200);
});

test('images reach each API in its documented shape', () => withKey(async () => {
  const msgs = (images = image) => [{role: 'user' as const, content: '¿Qué ves?', images}];
  // OpenAI chat format (Gemini through Kie): only an https link.
  const chat = recorder(() => streamed('data: {"choices":[{"delta":{"content":"Un gato"},"finish_reason":"stop"}]}\n\n'));
  await createProvider(textConfig(text('kie-flash')), chat.transport).generate({system: 's', signal, messages: msgs([{mime: 'image/png', data: 'AA', url: 'https://x.test/a.png'}])});
  assert.deepEqual((chat.seen[0].body.messages as unknown[])[1], {role: 'user', content: [{type: 'text', text: '¿Qué ves?'}, {type: 'image_url', image_url: {url: 'https://x.test/a.png'}}]});
  await assert.rejects(createProvider(textConfig(text('kie-flash')), chat.transport).generate({system: 's', signal, messages: msgs()}), (e: ProviderError) => e.status === 415, 'never a data URL where the docs show links');

  // Responses: input_image with the image itself.
  const responses = recorder(() => streamed('data: {"type":"response.output_text.delta","delta":"ok"}\n\ndata: {"type":"response.completed","response":{"usage":{"input_tokens":3,"output_tokens":1},"credits_consumed":0.4}}\n\n'));
  const r = await createProvider(textConfig(text('gpt-5-5')), responses.transport).generate({system: 's', signal, messages: msgs()});
  assert.deepEqual((responses.seen[0].body.input as {content: unknown}[])[0].content, [{type: 'input_text', text: '¿Qué ves?'}, {type: 'input_image', image_url: 'data:image/png;base64,iVBORw0KGgo='}]);
  assert.equal(r.usage.credits, 0.4);

  // An image alone: no empty text part.
  await createProvider(textConfig(text('gpt-5-5')), responses.transport).generate({system: 's', signal, messages: [{role: 'user', content: '', images: image}]});
  assert.deepEqual((responses.seen[1].body.input as {content: unknown[]}[])[0].content.length, 1);

  // Claude: Kie documents no images, so none are ever sent.
  const claude = recorder(() => streamed(''));
  await assert.rejects(createProvider(textConfig(text('claude-sonnet-4-6')), claude.transport).generate({system: 's', signal, messages: msgs()}), (e: ProviderError) => e.status === 415);
  assert.equal(claude.seen.length, 0);
}));

test('Gemini\'s own format through Kie: Bearer key, system text in the first turn, inline images, credits after the text', () => withKey(async () => {
  const sse = 'data: {"candidates":[{"content":{"role":"model","parts":[{"text":"При"}]}}]}\n\n'
    + 'data: {"candidates":[{"content":{"role":"model","parts":[{"text":"вет"}]},"finishReason":"STOP"}]}\n\n'
    + 'data: {"candidates":[],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":2},"credits_consumed":0.01}\n\n'
    + 'data: [DONE]\n\n';
  const g = recorder(() => streamed(sse));
  const out = await createProvider(textConfig(text('gemini-3-8-flash-native')), g.transport).generate({system: 'Sé breve.', signal, messages: [{role: 'user', content: 'Hola', images: image}]});
  assert.equal(out.text, 'Привет');
  assert.equal(out.usage.credits, 0.01, 'the credits come after finishReason: the stream is read to [DONE]');
  assert.equal(g.seen[0].url, 'https://api.kie.ai/gemini/v1/models/gemini-3-8-flash:streamGenerateContent');
  assert.equal(g.seen[0].headers.Authorization, 'Bearer test-key');
  assert.deepEqual(g.seen[0].body, {stream: true, contents: [{role: 'user', parts: [{text: 'Sé breve.\n\nHola'}, {inline_data: {mime_type: 'image/png', data: 'iVBORw0KGgo='}}]}]});
  const cut = recorder(() => streamed(sse.replace('data: [DONE]\n\n', '')));
  await assert.rejects(createProvider(textConfig(text('gemini-3-8-flash-native')), cut.transport).generate({system: '', signal, messages: [{role: 'user', content: 'Hola'}]}), ProviderError);
}));

test('a model without a `model` field in its docs does not get one; GPT 5.2 answers once, as JSON', () => withKey(async () => {
  const g = recorder(() => streamed('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\n'));
  await createProvider(textConfig(text('gemini-3-5-flash')), g.transport).generate({system: 's', signal, messages: [{role: 'user', content: 'Hola'}]});
  assert.equal('model' in g.seen[0].body, false);
  assert.equal(g.seen[0].url, 'https://api.kie.ai/gemini-3-5-flash-openai/v1/chat/completions');

  const json = recorder(() => Response.json({choices: [{message: {role: 'assistant', content: 'Hola, ¿en qué te ayudo?'}}], usage: {prompt_tokens: 10, completion_tokens: 5}}));
  const out = await createProvider(textConfig(text('gpt-5-2')), json.transport).generate({system: 's', signal, messages: [{role: 'user', content: 'Hola'}]});
  assert.equal(out.text, 'Hola, ¿en qué te ayudo?');
  assert.equal(out.usage.outputTokens, 5);
  assert.equal('stream' in json.seen[0].body, false);
  const refused = recorder(() => Response.json({code: 402, msg: 'Insufficient credits'}));
  await assert.rejects(createProvider(textConfig(text('gpt-5-2')), refused.transport).generate({system: 's', signal, messages: [{role: 'user', content: 'Hola'}]}), (e: ProviderError) => e.status === 402);
}));

test('Kie File Upload: multipart with the key, the documented host, one upload per content', () => withKey(async () => {
  const calls: {url: string; auth: string; form: FormData}[] = [];
  const ok = (async (url: string, init: RequestInit) => {
    calls.push({url, auth: (init.headers as Record<string, string>).Authorization, form: init.body as FormData});
    return Response.json({success: true, code: 200, data: {downloadUrl: 'https://tempfile.redpandaai.co/kieai/ruskicode/chat/x.png'}});
  }) as unknown as typeof fetch;
  const h = 'a'.repeat(64);
  assert.equal(await kieUpload(new Uint8Array([1, 2]), 'image/png', h, ok), 'https://tempfile.redpandaai.co/kieai/ruskicode/chat/x.png');
  assert.equal(calls[0].url, 'https://kieai.redpandaai.co/api/file-stream-upload');
  assert.equal(calls[0].auth, 'Bearer test-key');
  assert.equal(calls[0].form.get('uploadPath'), 'ruskicode/chat');
  assert.equal(calls[0].form.get('fileName'), h + '.png');
  await kieUpload(new Uint8Array([1, 2]), 'image/png', h, ok);
  assert.equal(calls.length, 1, 'the link is reused while it lives');
  const refused = (async () => Response.json({success: false, code: 401, msg: 'Unauthorized'})) as unknown as typeof fetch;
  await assert.rejects(kieUpload(new Uint8Array([1]), 'image/png', 'b'.repeat(64), refused), (e: UploadError) => e.code === 'UPLOAD_FAILED');
}));

test('jobInput: one image where the field takes one, a number where the duration is a number, documented defaults', () => {
  const single = imageModels.find(m => m.id === 'qwen-image-edit')!;
  assert.equal(single.options.fields.imagesSingle, true);
  assert.equal(jobInput(single, {prompt: 'p', references: ['https://x.test/a.png', 'https://x.test/b.png']}).image_url, 'https://x.test/a.png');
  const veo = videoModels.find(m => m.id === 'veo-3-1')!;
  assert.strictEqual(jobInput(veo, {prompt: 'p', duration: '8', references: []}).duration, 8);
  const fixedModel: ImageModel = {...single, options: {...single.options, fixed: {enable_safety_checker: true, prompt: 'never wins'}}};
  const out = jobInput(fixedModel, {prompt: 'mine', references: []});
  assert.equal(out.enable_safety_checker, true);
  assert.equal(out.prompt, 'mine', 'a chosen value always wins over a default');
  assert.equal('image_url' in out, false, 'no empty image field');
});

test('Kie\'s size names read as words', () => {
  assert.equal(optionLabel('landscape_16_9'), 'Horizontal 16:9');
  assert.equal(optionLabel('portrait_4_3'), 'Vertical 3:4');
  assert.equal(optionLabel('square_hd'), 'Cuadrado HD');
  assert.equal(optionLabel('2K'), '2K');
});
