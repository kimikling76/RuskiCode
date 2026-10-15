import {z} from 'zod';
import {bookSpecSchema} from '@/lib/books/spec';
import {skillIds} from '@/lib/skills/schemas';
import {runSkill} from '@/lib/skills/runner';
import {authorized,sameOrigin,limit} from '@/lib/ai/security';
import {candidates} from '@/lib/ai/catalog';
import {createProvider,ProviderError} from '@/lib/ai/provider';
export const runtime='nodejs';export const maxDuration=120;
const schema=z.object({skill:z.enum(skillIds),spec:bookSpecSchema,brief:z.string().min(1).max(20000),previousContext:z.string().max(20000).default(''),model:z.string().max(60),locale:z.enum(['es','ru','en'])}).strict();
export async function POST(req:Request){if(!sameOrigin(req))return Response.json({error:'FORBIDDEN'},{status:403});if(!await authorized(req))return Response.json({error:'AUTH_REQUIRED'},{status:401});let input:z.infer<typeof schema>;try{const raw=await req.text();if(raw.length>100000)return Response.json({error:'REQUEST_TOO_LARGE'},{status:413});input=schema.parse(JSON.parse(raw));}catch{return Response.json({error:'INVALID_REQUEST'},{status:400});}const model=candidates(input.model,'book')[0];if(!model)return Response.json({error:'MODEL_NOT_CONFIGURED'},{status:503});try{if(!await limit('skills',3)||!await limit('chat-hour',100,3600))return Response.json({error:'RATE_LIMIT'},{status:429});const signal=AbortSignal.any([req.signal,AbortSignal.timeout(110000)]);const result=await runSkill({...input,provider:createProvider(model),signal});return Response.json({...result,model:model.name},{headers:{'Cache-Control':'no-store'}});}catch(error){const code=error instanceof Error&&error.message==='INVALID_SKILL_OUTPUT'?'INVALID_SKILL_OUTPUT':error instanceof ProviderError&&error.status===402?'INSUFFICIENT_BALANCE':error instanceof Error&&error.message==='RATE_LIMIT_UNAVAILABLE'?'RATE_LIMIT_UNAVAILABLE':'SKILL_FAILED';return Response.json({error:code},{status:502});}}
