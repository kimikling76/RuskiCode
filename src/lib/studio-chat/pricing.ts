import type {ChatModel} from './catalog';
import {chatSystem,creditConfig} from './config';
export type ChatInput={conversationId:string;requestId:string;model:string;maxOutput:number;messages:{role:'user'|'assistant';content:string}[]};
export function tokenCounts(input:Pick<ChatInput,'messages'>){const all=[{role:'system',content:chatSystem},...input.messages];return {approx:all.reduce((n,m)=>n+Math.ceil(m.content.length/3)+12,12),conservative:all.reduce((n,m)=>n+new TextEncoder().encode(m.content).length+32,32)};}
export function priceable(m:ChatModel){return m.chat&&m.inputPrice!==null&&m.outputPrice!==null&&m.requestPrice!==null;}
export function selectChatModel(models:ChatModel[],input:ChatInput){
 const tokens=tokenCounts(input).conservative;
 if(input.model!=='auto'){const m=models.find(m=>m.id===input.model);if(!m)throw Error('MODEL_UNAVAILABLE');if(!priceable(m))throw Error('MODEL_NOT_PRICEABLE');if(m.context&&tokens+input.maxOutput>m.context)throw Error('CONTEXT_TOO_LONG');if(m.maxOutput&&input.maxOutput>m.maxOutput)throw Error('OUTPUT_TOO_LONG');return m;}
 const eligible=models.filter(m=>priceable(m)&&(!m.context||m.context>=tokens+input.maxOutput)&&(!m.maxOutput||m.maxOutput>=input.maxOutput)&&!m.id.startsWith('openrouter/'));
 // Prefer a low-cost general conversational model from the live catalog. No hidden paid fallback.
 const mainstream=eligible.filter(m=>/^(google|openai|anthropic|meta-llama|mistralai|deepseek|qwen)\//.test(m.id)&&m.context>=16000);
 const ranked=(mainstream.length?mainstream:eligible).sort((a,b)=>((a.inputPrice!+a.outputPrice!)*1e6+a.requestPrice!*1e6)-((b.inputPrice!+b.outputPrice!)*1e6+b.requestPrice!*1e6)||b.context-a.context||a.id.localeCompare(b.id));
 if(!ranked.length)throw Error('MODEL_UNAVAILABLE');return ranked[0];
}
export function quotePrice(model:ChatModel,input:ChatInput){if(!priceable(model))throw Error('MODEL_NOT_PRICEABLE');const tokens=tokenCounts(input);const out=Math.min(input.maxOutput,creditConfig.defaultOutputTokens);return {modelId:model.id,modelName:model.name,estimatedInputTokens:tokens.approx,estimatedOutputTokens:out,maxOutput:input.maxOutput,estimatedUsd:tokens.approx*model.inputPrice!+out*model.outputPrice!+model.requestPrice!,reservedUsd:tokens.conservative*model.inputPrice!+input.maxOutput*model.outputPrice!+model.requestPrice!,inputPrice:model.inputPrice!,outputPrice:model.outputPrice!,requestPrice:model.requestPrice!};}
export function actualCost(usage:unknown):number|null{if(!usage||typeof usage!=='object')return null;const n=(usage as {cost?:unknown}).cost;return typeof n==='number'&&Number.isFinite(n)&&n>=0?n:null;}
