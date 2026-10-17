import {authorized, limit} from '@/lib/ai/security';
import {kieCredits, CreditsError} from '@/lib/ai/kie-credits';

export const runtime = 'nodejs';

const status: Record<string, number> = {MODEL_NOT_CONFIGURED: 503, PROVIDER_AUTH_ERROR: 502, RATE_LIMIT: 429, RATE_LIMIT_UNAVAILABLE: 503, PROVIDER_UNAVAILABLE: 502};
const headers = {'Cache-Control': 'no-store'};

// A short cache per server instance so the sidebar and the Usage page do not ask Kie twice in a row.
const CACHE_MS = 20_000;
let cached: {credits: number; checkedAt: string; at: number} | null = null;

/** The real Kie balance for the team's key. `?fresh=1` (the refresh button) skips the short cache. */
export async function GET(req: Request) {
  if (!await authorized(req)) return Response.json({error: 'AUTH_REQUIRED'}, {status: 401, headers});
  const fresh = new URL(req.url).searchParams.get('fresh') === '1';
  if (!fresh && cached && Date.now() - cached.at < CACHE_MS) return Response.json({credits: cached.credits, checkedAt: cached.checkedAt, cached: true}, {headers});
  try {
    if (!await limit('kie-credits', 20, 60)) return Response.json({error: 'RATE_LIMIT'}, {status: 429, headers});
  } catch {
    return Response.json({error: 'RATE_LIMIT_UNAVAILABLE'}, {status: 503, headers});
  }
  try {
    const credits = await kieCredits();
    cached = {credits, checkedAt: new Date().toISOString(), at: Date.now()};
    return Response.json({credits, checkedAt: cached.checkedAt}, {headers});
  } catch (error) {
    const code = error instanceof CreditsError ? error.code : 'PROVIDER_UNAVAILABLE';
    return Response.json({error: code}, {status: status[code] || 502, headers});
  }
}
