import test from 'node:test';
import assert from 'node:assert/strict';
import {kieCredits} from '../src/lib/ai/kie-credits';
import {summarizeUsage} from '../src/lib/usage/summary';

function reply(body: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}})) as typeof fetch;
}

test('the Kie balance is read from the documented endpoint with the server key, and only a real number counts', async () => {
  const saved = process.env.KIE_API_KEY;
  process.env.KIE_API_KEY = 'test-key';
  try {
    let seen: {url: string; auth: string | null} | undefined;
    const transport = (async (url: string | URL | Request, init?: RequestInit) => {
      seen = {url: String(url), auth: new Headers(init?.headers).get('Authorization')};
      return new Response(JSON.stringify({code: 200, msg: 'success', data: 1234.5}));
    }) as typeof fetch;
    assert.equal(await kieCredits(transport), 1234.5);
    assert.equal(seen?.url, 'https://api.kie.ai/api/v1/chat/credit');
    assert.equal(seen?.auth, 'Bearer test-key');
    // Kie reports errors with HTTP 200 and the code in the body.
    await assert.rejects(kieCredits(reply({code: 401, msg: 'You do not have access permissions'})), /PROVIDER_AUTH_ERROR/);
    await assert.rejects(kieCredits(reply({code: 200, data: '100'})), /PROVIDER_UNAVAILABLE/);
    await assert.rejects(kieCredits(reply({code: 200, data: -1})), /PROVIDER_UNAVAILABLE/);
    await assert.rejects(kieCredits(reply({}, 500)), /PROVIDER_UNAVAILABLE/);
    delete process.env.KIE_API_KEY;
    await assert.rejects(kieCredits(transport), /MODEL_NOT_CONFIGURED/);
  } finally {
    if (saved === undefined) delete process.env.KIE_API_KEY; else process.env.KIE_API_KEY = saved;
  }
});

test('usage sums only reported credits, keeps unreported requests visible and puts undated entries last', () => {
  const day = (d: number, h: number) => new Date(2026, 9, d, h).getTime();
  const summary = summarizeUsage([
    {id: 'old', credits: 3},
    {id: 'a', credits: 1.5, at: day(16, 10), studio: 'chat', label: 'Gemini 3.1 Pro'},
    {id: 'b', at: day(16, 12), studio: 'cinema', label: 'Imagen'},
    {id: 'c', credits: 6, at: day(17, 9), studio: 'cinema', label: 'Imagen'},
    {id: 'd', credits: 0.5, at: day(17, 11), studio: 'pdf', label: 'Revisión pedagógica'},
  ]);
  assert.equal(summary.credits, 11);
  assert.equal(summary.requests, 5);
  assert.equal(summary.unreported, 1);
  assert.deepEqual(summary.days.map(d => d.key), ['2026-10-17', '2026-10-16', 'undated']);
  assert.deepEqual(summary.days[0].entries.map(e => e.id), ['d', 'c']);
  assert.equal(summary.days[1].credits, 1.5);
  assert.equal(summary.days[1].unreported, 1);
  assert.deepEqual(summary.byStudio.map(s => [s.studio, s.credits, s.requests]), [['chat', 1.5, 1], ['cinema', 6, 2], ['pdf', 0.5, 1]]);
  assert.equal(summarizeUsage([]).days.length, 0);
});
