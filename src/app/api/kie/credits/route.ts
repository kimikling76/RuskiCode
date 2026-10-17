import {authorized, limit} from '@/lib/ai/security';
import {kieCredits, CreditsError} from '@/lib/ai/kie-credits';

export const runtime = 'nodejs';

const status: Record<string, number> = {MODEL_NOT_CONFIGURED: 503, PROVIDER_AUTH_ERROR: 502, RATE_LIMIT: 429, RATE_LIMIT_UNAVAILABLE: 503, PROVIDER_UNAVAILABLE: 502};
const headers = {'Cache-Control': 'no-store'};

/** The real Kie balance for the team's key, read on demand from the Usage page. */
export async function GET(req: Request) {
  if (!await authorized(req)) return Response.json({error: 'AUTH_REQUIRED'}, {status: 401, headers});
  try {
    if (!await limit('kie-credits', 20, 60)) return Response.json({error: 'RATE_LIMIT'}, {status: 429, headers});
  } catch {
    return Response.json({error: 'RATE_LIMIT_UNAVAILABLE'}, {status: 503, headers});
  }
  try {
    return Response.json({credits: await kieCredits(), checkedAt: new Date().toISOString()}, {headers});
  } catch (error) {
    const code = error instanceof CreditsError ? error.code : 'PROVIDER_UNAVAILABLE';
    return Response.json({error: code}, {status: status[code] || 502, headers});
  }
}
