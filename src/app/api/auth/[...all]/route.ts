import {toNextJsHandler} from 'better-auth/next-js';
import {limit,sameOrigin} from '@/lib/ai/security';
import {auth} from '@/lib/auth/server';
export const runtime='nodejs';
export async function GET(request:Request){try{return await toNextJsHandler(auth()).GET(request);}catch{return Response.json({error:'AUTH_UNAVAILABLE'},{status:503});}}
export async function POST(request:Request){if(!sameOrigin(request)||!request.headers.get('origin'))return Response.json({error:'FORBIDDEN'},{status:403});try{if(!await limit('auth-requests',20))return Response.json({error:'RATE_LIMIT'},{status:429});return await toNextJsHandler(auth()).POST(request);}catch{return Response.json({error:'AUTH_UNAVAILABLE'},{status:503});}}
