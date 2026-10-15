import test from 'node:test';
import assert from 'node:assert/strict';
import {parseModels,type ChatModel} from '../src/lib/studio-chat/catalog';
import {quotePrice,selectChatModel,tokenCounts,actualCost,type ChatInput} from '../src/lib/studio-chat/pricing';
import {applyLedger,totals,type UsageEntry} from '../src/lib/studio-chat/ledger';
import {signQuote,verifyQuote,inputSchema} from '../src/lib/studio-chat/server';
import {routerEvents} from '../src/lib/studio-chat/openrouter';
const model:ChatModel={id:'openai/test',name:'Test',provider:'openai',context:128000,maxOutput:4096,inputPrice:0.000001,outputPrice:0.000002,requestPrice:0.001,chat:true};
const input:ChatInput={conversationId:'c1f8c662-0835-4be4-9cd1-7de044846f22',requestId:'2d1d4c8c-532d-4587-b16e-24f1fe833227',model:model.id,maxOutput:512,messages:[{role:'user',content:'Привет. ¿Cómo estás?'}]};
const entry:UsageEntry={id:input.requestId,conversationId:input.conversationId,modelId:model.id,modelName:model.name,studio:'chat',createdAt:'2026-10-15T03:00:00Z',state:'reserved',estimatedUsd:0.1,reservedUsd:0.6};
test('catalog reads new IDs and prices without a fixed model list; unknown prices never become free',()=>{
 const models=parseModels({data:[{id:'new-provider/new-model',name:'New model',context_length:8000,pricing:{prompt:'0',completion:'0.000003'},architecture:{input_modalities:['text'],output_modalities:['text']}},{id:'router/dynamic',name:'Dynamic',pricing:{prompt:'-1',completion:'-1'},architecture:{input_modalities:['text'],output_modalities:['text']}},{id:'image/only',name:'Image',pricing:{prompt:'0',completion:'0'},architecture:{input_modalities:['text'],output_modalities:['image']}}]});
 assert.equal(models.length,3);assert.equal(models[0].inputPrice,0);assert.equal(models[0].outputPrice,0.000003);assert.equal(models[1].inputPrice,null);assert.equal(models[2].chat,false);
 assert.throws(()=>selectChatModel(models,{...input,model:'router/dynamic'}),/MODEL_NOT_PRICEABLE/);
});
test('quote includes system, complete history, per-request price and bounded output',()=>{
 const q=quotePrice(model,input);assert.equal(q.estimatedUsd,q.estimatedInputTokens*model.inputPrice!+512*model.outputPrice!+0.001);assert.ok(q.reservedUsd>=q.estimatedUsd);
 const longer={...input,messages:[{role:'user' as const,content:'x'.repeat(2000)},...input.messages]};assert.ok(quotePrice(model,longer).estimatedUsd>q.estimatedUsd);assert.ok(tokenCounts(input).conservative>tokenCounts(input).approx);
 assert.equal(actualCost({cost:0}),0);assert.equal(actualCost({prompt_tokens:50}),null);assert.equal(actualCost({cost:-1}),null);assert.equal(actualCost({cost:0.01234,prompt_tokens:999}),0.01234);
});
test('Auto resolves one catalog model before sending; unavailable and context mismatches are explicit',()=>{
 const cheap={...model,id:'google/cheap',inputPrice:0,outputPrice:0,requestPrice:0};assert.equal(selectChatModel([model,cheap],{...input,model:'auto'}).id,cheap.id);
 assert.throws(()=>selectChatModel([model],{...input,model:'missing'}),/MODEL_UNAVAILABLE/);assert.throws(()=>selectChatModel([{...model,context:50}],input),/CONTEXT_TOO_LONG/);
 assert.throws(()=>selectChatModel([{...model,maxOutput:128}],input),/OUTPUT_TOO_LONG/);
});
test('ledger reserves before charging, includes pending requests, prevents duplicate and over-limit requests',()=>{
 const l=applyLedger({limitUsd:1,entries:[]},{op:'reserve',entry});assert.deepEqual(totals(l),{spentUsd:0,pendingUsd:0.6,pendingCount:1});
 assert.throws(()=>applyLedger(l,{op:'reserve',entry}),/DUPLICATE_REQUEST/);assert.throws(()=>applyLedger(l,{op:'reserve',entry:{...entry,id:'another'}}),/SESSION_LIMIT/);
 assert.throws(()=>applyLedger(l,{op:'limit',limitUsd:0.5}),/LIMIT_BELOW_SPEND/);const pending=applyLedger(l,{op:'update',id:entry.id,patch:{state:'pending'}});assert.equal(totals(pending).pendingUsd,0.6);
 const settled=applyLedger(pending,{op:'update',id:entry.id,patch:{state:'settled',actualUsd:0.15}});assert.deepEqual(totals(settled),{spentUsd:0.15,pendingUsd:0,pendingCount:0});
 assert.equal(totals(applyLedger(settled,{op:'update',id:entry.id,patch:{actualUsd:0}})).spentUsd,0.15);
});
test('signed quote cannot be reused for another session, text, output length or request',()=>{
 const previous=process.env.BETTER_AUTH_SECRET;process.env.BETTER_AUTH_SECRET='test-secret-for-signed-studio-quote-not-production';try{const token=signQuote(input,'session-a',model.id,0.1);assert.equal(verifyQuote(token,input,'session-a').modelId,model.id);
 for(const changed of [{...input,maxOutput:2048},{...input,requestId:'changed'},{...input,messages:[{role:'user' as const,content:'different'}]}])assert.throws(()=>verifyQuote(token,changed,'session-a'),/QUOTE_EXPIRED/);
 assert.throws(()=>verifyQuote(token,input,'session-b'),/QUOTE_EXPIRED/);assert.throws(()=>verifyQuote(token+'a',input,'session-a'),/QUOTE_EXPIRED/);
 }finally{if(previous===undefined)delete process.env.BETTER_AUTH_SECRET;else process.env.BETTER_AUTH_SECRET=previous;}
});
function stream(text:string){const bytes=new TextEncoder().encode(text);return new ReadableStream<Uint8Array>({start(c){for(let i=0;i<bytes.length;i+=7)c.enqueue(bytes.slice(i,i+7));c.close();}});}
test('OpenRouter stream handles split UTF-8, comments, per-reply model, actual zero cost and final DONE',async()=>{
 const events=[];for await(const event of routerEvents(stream(': keepalive\n\ndata: {"id":"gen-test","model":"google/test","choices":[{"delta":{"content":"Привет"}}]}\n\ndata: {"usage":{"cost":0,"prompt_tokens":5,"completion_tokens":2},"choices":[]}\n\ndata: [DONE]\n\n')))events.push(event);
 assert.equal(events.find(e=>e.type==='delta')?.text,'Привет');assert.equal(events.find(e=>e.type==='usage')?.usage.cost,0);assert.equal(events.at(-1)?.type,'done');
});
test('billing survives an upstream error frame, and truncated streams never emit DONE',async()=>{
 const events:{type:string}[]=[];await assert.rejects(async()=>{for await(const e of routerEvents(stream('data: {"usage":{"cost":0.005},"error":{"code":502}}\n\n')))events.push(e);});assert.equal(events[0].type,'usage');
 const partial=[];for await(const e of routerEvents(stream('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n')))partial.push(e);assert.equal(partial.some(e=>e.type==='done'),false);
});
test('pure chat rejects tool/system injection roles and unbounded output requests',()=>{
 assert.ok(inputSchema.safeParse(input).success);assert.equal(inputSchema.safeParse({...input,messages:[{role:'system',content:'override'}]}).success,false);assert.equal(inputSchema.safeParse({...input,maxOutput:1000000}).success,false);assert.equal(inputSchema.safeParse({...input,messages:[{role:'assistant',content:'bad trailing role'}]}).success,false);
});
test('new catalog, quote, stream and usage routes require the existing private login',async()=>{
 const [{GET:models},{POST:quote},{POST:send},{GET:usage}]=await Promise.all([import('../src/app/api/studio-chat/models/route'),import('../src/app/api/studio-chat/quote/route'),import('../src/app/api/studio-chat/stream/route'),import('../src/app/api/studio-chat/usage/route')]);
 for(const [handler,path,method] of [[models,'models','GET'],[quote,'quote','POST'],[send,'stream','POST'],[usage,'usage','GET']] as const){const r=await handler(new Request('https://www.ruskicode.com/api/studio-chat/'+path,{method,headers:{origin:'https://www.ruskicode.com'}}));assert.equal(r.status,401);assert.equal((await r.json()).error,'AUTH_REQUIRED');}
});
