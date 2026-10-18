import {z} from 'zod';
import {sameOrigin,limit} from '@/lib/ai/security';
import {studioSession} from '@/lib/auth/server';
import {textModels,publicModel} from '@/lib/ai/models';
import {resolveText,textConfig} from '@/lib/ai/kie-text';
import {createProvider,ProviderError} from '@/lib/ai/provider';
import {kieUpload,UploadError} from '@/lib/ai/kie-upload';
import {getAsset} from '@/lib/sync/server';
import {personalInput,systemForPersonal} from '@/lib/personal-chat/input';
import {withAttachments,AttachmentError,ATTACHMENTS_NOTE} from '@/lib/personal-chat/attachments-server';
import type {Message} from '@/lib/ai/types';
export const runtime='nodejs';export const maxDuration=120;

export async function GET(req:Request){if(!await studioSession(req.headers))return Response.json({error:'AUTH_REQUIRED'},{status:401});const key=Boolean(process.env.KIE_API_KEY);return Response.json({models:textModels.map(m=>publicModel(m,key))},{headers:{'Cache-Control':'no-store'}});}
export async function POST(req:Request){
 if(!sameOrigin(req)||!req.headers.get('origin'))return Response.json({error:'FORBIDDEN'},{status:403});const session=await studioSession(req.headers);if(!session)return Response.json({error:'AUTH_REQUIRED'},{status:401});
 let input:z.infer<typeof personalInput>;try{const text=await req.text();if(text.length>100000)throw Error();input=personalInput.parse(JSON.parse(text));}catch{return Response.json({error:'INVALID_REQUEST'},{status:400});}
 const entry=resolveText(input.model);if(!entry)return Response.json({error:'MODEL_NOT_CONFIGURED'},{status:503});const selected=textConfig(entry);if(input.webSearch&&!selected.webSearch)return Response.json({error:'SEARCH_NOT_SUPPORTED'},{status:422});
 try{if(!await limit('personal-kie-new',10,10)||!await limit('personal-hour',100,3600))return Response.json({error:'RATE_LIMIT'},{status:429});if(!await limit('personal-request:'+input.requestId,1,3600))return Response.json({error:'ALREADY_SENT'},{status:409});}catch{return Response.json({error:'RATE_LIMIT_UNAVAILABLE'},{status:503});}
 // Attached files are read from the person's own stored files, by hash; images that need a link are uploaded to Kie.
 let messages:Message[]=input.messages;let system=systemForPersonal(input);
 if(input.messages.some(m=>m.attachments?.length)){try{const resolved=await withAttachments(input.messages,entry,hash=>getAsset(session.user.id,hash),(bytes,mime,hash)=>kieUpload(bytes,mime,hash));messages=resolved.messages;if(resolved.sent)system+='\n\n'+ATTACHMENTS_NOTE;}catch(e){const code=e instanceof AttachmentError||e instanceof UploadError?e.code:'ATTACHMENTS_UNAVAILABLE';return Response.json({error:code},{status:code==='IMAGES_NOT_SUPPORTED'||code==='ATTACHMENT_MISSING'?422:code==='UPLOAD_FAILED'?502:503});}}
 const abort=new AbortController();const signal=AbortSignal.any([req.signal,abort.signal,AbortSignal.timeout(105000)]);const encoder=new TextEncoder();
 return new Response(new ReadableStream({async start(controller){let closed=false;let started=false;const send=(e:unknown)=>{if(closed)return;try{controller.enqueue(encoder.encode('data: '+JSON.stringify(e)+'\n\n'));}catch{closed=true;}};
 try{send({type:'model',id:selected.id,name:selected.name});for await(const e of createProvider(selected).stream({messages,system,signal,webSearch:input.webSearch})){if(e.type==='delta')started=true;send(e);}send({type:'done'});}catch(e){send({type:'error',error:e instanceof ProviderError&&e.status===402?'INSUFFICIENT_BALANCE':e instanceof ProviderError&&[401,403].includes(e.status)?'PROVIDER_AUTH_ERROR':e instanceof ProviderError&&e.status===429?'RATE_LIMIT':e instanceof ProviderError&&e.status===415?'IMAGES_NOT_SUPPORTED':started||signal.aborted?'STREAM_INTERRUPTED':'PROVIDER_UNAVAILABLE'});}finally{closed=true;try{controller.close();}catch{}abort.abort();}},cancel(){abort.abort();}}),{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-store','X-Accel-Buffering':'no'}});
}
