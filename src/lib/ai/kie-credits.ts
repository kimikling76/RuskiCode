// Remaining account credits, from Kie's documented Common API:
// GET https://api.kie.ai/api/v1/chat/credit with the API key as a Bearer token.
// The answer is {code: 200, msg: 'success', data: <credits>}; errors also arrive as HTTP 200 with the code in the body.
// Source: https://docs.kie.ai/common-api/get-account-credits
// KIE_BASE_URL exists only for local tests against a fake Kie; production never sets it.
const creditUrl = () => (process.env.KIE_BASE_URL || 'https://api.kie.ai') + '/api/v1/chat/credit';

export class CreditsError extends Error {
  constructor(public code: string) { super(code); }
}

function fromKieCode(code: number) {
  if (code === 401 || code === 403) return 'PROVIDER_AUTH_ERROR';
  if (code === 429) return 'RATE_LIMIT';
  return 'PROVIDER_UNAVAILABLE';
}

/** The balance Kie reports for the server's key. Never estimated: anything unexpected is an error. */
export async function kieCredits(transport: typeof fetch = fetch): Promise<number> {
  const secret = process.env.KIE_API_KEY;
  if (!secret) throw new CreditsError('MODEL_NOT_CONFIGURED');
  let response: Response;
  try {
    response = await transport(creditUrl(), {headers: {Authorization: `Bearer ${secret}`, Accept: 'application/json'}, signal: AbortSignal.timeout(10000), cache: 'no-store'});
  } catch {
    throw new CreditsError('PROVIDER_UNAVAILABLE');
  }
  if (!response.ok) throw new CreditsError(fromKieCode(response.status));
  let body: {code?: unknown; data?: unknown};
  try { body = await response.json(); } catch { throw new CreditsError('PROVIDER_UNAVAILABLE'); }
  if (body.code !== 200) throw new CreditsError(typeof body.code === 'number' ? fromKieCode(body.code) : 'PROVIDER_UNAVAILABLE');
  if (typeof body.data !== 'number' || !Number.isFinite(body.data) || body.data < 0) throw new CreditsError('PROVIDER_UNAVAILABLE');
  return body.data;
}
