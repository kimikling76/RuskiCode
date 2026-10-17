import {z} from 'zod';
import {authorized,sameOrigin,limit} from '@/lib/ai/security';
import {textModels,publicModel} from '@/lib/ai/models';
import {resolveText,textConfig} from '@/lib/ai/kie-text';
import {createProvider,ProviderError} from '@/lib/ai/provider';
import {personalInput,systemForPersonal} from '@/lib/personal-chat/input';
export const runtime='nodejs';export const maxDuration=120;

export async function GET(req:Request){if(!await authorized(req))return Response.json({error:'AUTH_REQUIRED'},{status:401});const key=Boolean(process.env.KIE_API_KEY);return Response.json({models:textModels.map(m=>publicModel(m,key))},{headers:{'Cache-Control':'no-store'}});}
export async function POST(req:Request){
 if(!sameOrigin(req)||!req.headers.get('origin'))return Response.json({error:'FORBIDDEN'},{status:403});if(!await authorized(req))return Response.json({error:'AUTH_REQUIRED'},{status:401});
 let input:z.infer<typeof personalInput>;try{const text=await req.text();if(text.length>100000)throw Error();input=personalInput.parse(JSON.parse(text));}catch{return Response.json({error:'INVALID_REQUEST'},{status:400});}
 const entry=resolveText(input.model);if(!entry)return Response.json({error:'MODEL_NOT_CONFIGURED'},{status:503});const selected=textConfig(entry);
 try{if(!await limit('personal-kie-new',10,10)||!await limit('personal-hour',100,3600))return Response.json({error:'RATE_LIMIT'},{status:429});if(!await limit('personal-request:'+input.requestId,1,3600))return Response.json({error:'ALREADY_SENT'},{status:409});}catch{return Response.json({error:'RATE_LIMIT_UNAVAILABLE'},{status:503});}
 const abort=new AbortController();const signal=AbortSignal.any([req.signal,abort.signal,AbortSignal.timeout(105000)]);const encoder=new TextEncoder();const system=systemForPersonal(input);
 return new Response(new ReadableStream({async start(controller){let closed=false;let started=false;const send=(e:unknown)=>{if(closed)return;try{controller.enqueue(encoder.encode('data: '+JSON.stringify(e)+'\n\n'));}catch{closed=true;}};
 try{send({type:'model',id:selected.id,name:selected.name});for await(const e of createProvider(selected).stream({messages:input.messages,system,signal})){if(e.type==='delta')started=true;send(e);}send({type:'done'});}catch(e){send({type:'error',error:e instanceof ProviderError&&e.status===402?'INSUFFICIENT_BALANCE':e instanceof ProviderError&&[401,403].includes(e.status)?'PROVIDER_AUTH_ERROR':e instanceof ProviderError&&e.status===429?'RATE_LIMIT':started||signal.aborted?'STREAM_INTERRUPTED':'PROVIDER_UNAVAILABLE'});}finally{closed=true;try{controller.close();}catch{}abort.abort();}},cancel(){abort.abort();}}),{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-store','X-Accel-Buffering':'no'}});
}
