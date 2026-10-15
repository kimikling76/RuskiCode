import {identity,inputSchema,readJson,verifyQuote,failure} from '@/lib/studio-chat/server';
import {getChatModels} from '@/lib/studio-chat/catalog';
import {quotePrice,actualCost,selectChatModel} from '@/lib/studio-chat/pricing';
import {ledger} from '@/lib/studio-chat/ledger';
import {routerEvents} from '@/lib/studio-chat/openrouter';
import {chatSystem} from '@/lib/studio-chat/config';
import {limit} from '@/lib/ai/security';
export const runtime='nodejs';export const maxDuration=120;
export async function POST(req:Request){try{
 const sessionId=await identity(req,true);if(!process.env.OPENROUTER_API_KEY)throw Error('OPENROUTER_NOT_CONFIGURED');if(!await limit('studio-chat:'+sessionId,15)||!await limit('studio-chat-hour:'+sessionId,100,3600))throw Error('RATE_LIMIT');
 const raw=await readJson(req);const input=inputSchema.parse(raw);if(typeof raw.quoteToken!=='string')throw Error('QUOTE_EXPIRED');const signed=verifyQuote(raw.quoteToken,input,sessionId);const model=selectChatModel(await getChatModels(),{...input,model:signed.modelId});const quote=quotePrice(model,input);if(Math.abs(signed.reservedUsd-quote.reservedUsd)>1e-12)throw Error('QUOTE_EXPIRED');
 await ledger(sessionId,{op:'reserve',entry:{id:input.requestId,conversationId:input.conversationId,modelId:model.id,modelName:model.name,studio:'chat',createdAt:new Date().toISOString(),state:'reserved',estimatedUsd:quote.estimatedUsd,reservedUsd:quote.reservedUsd}});
 const abort=new AbortController();const signal=AbortSignal.any([req.signal,abort.signal,AbortSignal.timeout(105000)]);const encoder=new TextEncoder();
 return new Response(new ReadableStream({async start(controller){let accepted=false;let settled=false;let generationId='';let actualModel=model.id;let disconnected=false;let cost:number|null=null;let tokens:{inputTokens?:number;outputTokens?:number}={};
 const send=(e:unknown)=>{if(disconnected)return;try{controller.enqueue(encoder.encode('data: '+JSON.stringify(e)+'\n\n'));}catch{disconnected=true;}};
 try{
  send({type:'model',id:model.id,name:model.name,requestId:input.requestId});
  const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENROUTER_API_KEY}`,'Content-Type':'application/json','HTTP-Referer':process.env.PUBLIC_APP_URL||'https://www.ruskicode.com','X-Title':'Estudio'},body:JSON.stringify({model:model.id,messages:[{role:'system',content:chatSystem},...input.messages],stream:true,max_tokens:input.maxOutput,provider:{sort:'price',max_price:{prompt:quote.inputPrice*1e6,completion:quote.outputPrice*1e6,request:quote.requestPrice}}}),signal});
  if(!r.ok){if([400,401,402,403,404,422,429].includes(r.status)){await ledger(sessionId,{op:'update',id:input.requestId,patch:{state:'failed',actualUsd:0}});settled=true;}throw Error(r.status===402?'INSUFFICIENT_BALANCE':[401,403].includes(r.status)?'PROVIDER_AUTH_ERROR':r.status===429?'RATE_LIMIT':'PROVIDER_UNAVAILABLE');}
  accepted=true;if(!r.body)throw Error('STREAM_INTERRUPTED');let ended=false;
  for await(const event of routerEvents(r.body)){
   if(event.type==='generation'&&!generationId){generationId=event.id;actualModel=event.model||model.id;await ledger(sessionId,{op:'update',id:input.requestId,patch:{generationId,modelId:actualModel}});send({type:'model',id:actualModel,name:actualModel===model.id?model.name:actualModel,requestId:input.requestId});}
   if(event.type==='delta')send(event);
   if(event.type==='usage'){const reported=actualCost(event.usage);if(reported!==null)cost=reported;tokens={inputTokens:event.usage.prompt_tokens??tokens.inputTokens,outputTokens:event.usage.completion_tokens??tokens.outputTokens};}
   if(event.type==='done')ended=true;
  }
  if(cost!==null){await ledger(sessionId,{op:'update',id:input.requestId,patch:{state:'settled',actualUsd:cost,...tokens}});settled=true;send({type:'usage',actualUsd:cost,...tokens});}
  else{await ledger(sessionId,{op:'update',id:input.requestId,patch:{state:'pending',...tokens}});send({type:'usage',actualUsd:null,...tokens});}
  if(!ended)throw Error('STREAM_INTERRUPTED');send({type:'done'});
 }catch(error){if(cost!==null&&!settled){try{await ledger(sessionId,{op:'update',id:input.requestId,patch:{state:'settled',actualUsd:cost,...tokens}});settled=true;send({type:'usage',actualUsd:cost,...tokens});}catch{}}
  if(!settled)try{await ledger(sessionId,{op:'update',id:input.requestId,patch:{state:'pending',...tokens}});}catch{}
  const code=error instanceof Error?error.message:'';send({type:'error',error:['INSUFFICIENT_BALANCE','PROVIDER_AUTH_ERROR','RATE_LIMIT'].includes(code)?code:signal.aborted?'STREAM_INTERRUPTED':accepted?'STREAM_INTERRUPTED':'PROVIDER_UNAVAILABLE'});
 }finally{try{controller.close();}catch{}abort.abort();}},cancel(){abort.abort();}}),{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-store','X-Accel-Buffering':'no'}});
 }catch(e){return failure(e);}}
