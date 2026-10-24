import test from 'node:test';
import assert from 'node:assert/strict';
import {createImageJob, imageJobStatus, CinemaError} from '../src/lib/cinema/kie-jobs';
import {aspectRatios, resolutions, imageModel} from '../src/lib/cinema/capabilities';
import {parsePlan} from '../src/lib/cinema/plan';
import {personalInput, systemForPersonal} from '../src/lib/personal-chat/input';
import {PERSONAL_SYSTEM} from '../src/lib/personal-chat/state';
import {GET, POST} from '../src/app/api/cinema/images/route';
import {GET as DOWNLOAD} from '../src/app/api/cinema/download/route';

process.env.KIE_API_KEY = 'test-key';
const json = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
async function code(promise: Promise<unknown>) { try { await promise; return 'OK'; } catch (e) { return e instanceof CinemaError ? e.code : 'OTHER'; } }

test('image tasks send only the documented fields for the configured model', async () => {
  let sent: {url: string; body: Record<string, unknown>; auth: string} | undefined;
  const transport = (async (url: string, init: RequestInit) => {
    sent = {url, body: JSON.parse(String(init.body)), auth: String((init.headers as Record<string, string>).Authorization)};
    return new Response(JSON.stringify({code: 200, data: {taskId: 'task_123456'}}));
  }) as unknown as typeof fetch;
  const id = await createImageJob({prompt: 'Una calle de noche', aspect: '16:9', resolution: '2K', references: ['https://file.aiquickdraw.com/a.png']}, transport);
  assert.equal(id, 'task_123456');
  assert.equal(sent?.url, 'https://api.kie.ai/api/v1/jobs/createTask');
  assert.equal(sent?.auth, 'Bearer test-key');
  assert.deepEqual(sent?.body, {model: imageModel.id, input: {prompt: 'Una calle de noche', image_input: ['https://file.aiquickdraw.com/a.png'], aspect_ratio: '16:9', resolution: '2K', output_format: 'png'}});
});

test('Kie errors arrive as HTTP 200 with a body code and are mapped, never hidden', async () => {
  const input = {prompt: 'x', aspect: 'auto' as const, resolution: '1K' as const, references: []};
  assert.equal(await code(createImageJob(input, json({code: 402, msg: 'Insufficient Credits'}) as unknown as typeof fetch)), 'INSUFFICIENT_BALANCE');
  assert.equal(await code(createImageJob(input, json({code: 422}) as unknown as typeof fetch)), 'INVALID_PARAMETERS');
  assert.equal(await code(createImageJob(input, json({code: 429}) as unknown as typeof fetch)), 'RATE_LIMIT');
  assert.equal(await code(createImageJob(input, (async () => { throw new Error('timeout'); }) as unknown as typeof fetch)), 'CREATE_UNCERTAIN');
});

test('task status reports the real Kie state, its result and the cost only when Kie sends it', async () => {
  const success = await imageJobStatus('task_123456', json({code: 200, data: {state: 'success', resultJson: JSON.stringify({resultUrls: ['https://file.aiquickdraw.com/r.png']}), creditsConsumed: 4}}) as unknown as typeof fetch);
  assert.deepEqual(success, {state: 'success', urls: ['https://file.aiquickdraw.com/r.png'], credits: 4});
  const queued = await imageJobStatus('task_123456', json({code: 200, data: {state: 'queuing'}}) as unknown as typeof fetch);
  assert.deepEqual(queued, {state: 'queuing', urls: []});
  const failed = await imageJobStatus('task_123456', json({code: 200, data: {state: 'fail', failMsg: 'content policy'}}) as unknown as typeof fetch);
  assert.equal(failed.state, 'fail');
  assert.equal(failed.failMessage, 'content policy');
  assert.equal(failed.credits, undefined);
  assert.equal(await code(imageJobStatus('task_123456', json({code: 422}) as unknown as typeof fetch)), 'TASK_NOT_FOUND');
  assert.equal(await code(imageJobStatus('task_123456', json({code: 200, data: {state: 'success', resultJson: '{}'}}) as unknown as typeof fetch)), 'RESULT_INVALID');
});

test('capabilities stay small and explicit', () => {
  assert.ok(aspectRatios.includes('auto') && aspectRatios.includes('4:3'));
  assert.deepEqual([...resolutions], ['1K', '2K', '4K']);
});

test('cinema routes keep private login and origin checks', async () => {
  assert.equal((await GET(new Request('https://www.ruskicode.com/api/cinema/images?taskId=task_123456'))).status, 401);
  assert.equal((await POST(new Request('https://www.ruskicode.com/api/cinema/images', {method: 'POST', headers: {origin: 'https://www.ruskicode.com'}, body: '{}'}))).status, 401);
  assert.equal((await POST(new Request('https://www.ruskicode.com/api/cinema/images', {method: 'POST', headers: {origin: 'https://evil.example'}, body: '{}'}))).status, 403);
  assert.equal((await DOWNLOAD(new Request('https://www.ruskicode.com/api/cinema/download?url=https://file.aiquickdraw.com/a.png'))).status, 401);
});

test('Cinema text purposes have their own fixed instructions; the personal chat stays neutral', () => {
  const base = {requestId: 'd0d6c072-a7cf-4f44-9d78-c0cce92bb430', model: 'auto', messages: [{role: 'user', content: 'Una idea'}]};
  assert.equal(systemForPersonal(personalInput.parse({...base, purpose: 'chat'})), PERSONAL_SYSTEM);
  const storyboard = systemForPersonal(personalInput.parse({...base, purpose: 'storyboard'}));
  const prompt = systemForPersonal(personalInput.parse({...base, purpose: 'prompt'}));
  assert.match(storyboard, /"shots"/);
  assert.match(prompt, /ONLY the prompt text/);
  const video = systemForPersonal(personalInput.parse({...base, purpose: 'video-prompt'}));
  assert.match(video, /video-generation prompt/);
  assert.match(video, /camera movement/);
  assert.equal(personalInput.safeParse({...base, purpose: 'storyboard', system: 'x'}).success, false);
});

test('storyboard parsing accepts fenced JSON and rejects anything without usable shots', () => {
  const plan = parsePlan('```json\n{"title":"Invierno","script":"Una calle.","shots":[{"title":"Abre","description":"Calle","prompt":"Calle nevada de noche"},{"title":"Vacío","prompt":""}]}\n```');
  assert.equal(plan?.title, 'Invierno');
  assert.equal(plan?.shots.length, 1);
  assert.equal(parsePlan('No pude.'), null);
  assert.equal(parsePlan('{"title":"x","shots":[]}'), null);
});
