import {z} from 'zod';
import {identity,readJson,failure} from '@/lib/studio-chat/server';
import {ledger,totals} from '@/lib/studio-chat/ledger';
import {creditConfig} from '@/lib/studio-chat/config';
import {limit} from '@/lib/ai/security';
export const runtime='nodejs';
export async function GET(req:Request){try{const id=await identity(req);const l=await ledger(id);return Response.json({...l,...totals(l),usdPerCredit:creditConfig.usdPerCredit},{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
const mutation=z.discriminatedUnion('action',[z.object({action:z.literal('limit'),credits:z.number().min(0).max(100000)}),z.object({action:z.literal('reconcile'),id:z.string().uuid()})]);
export async function POST(req:Request){try{const id=await identity(req,true);if(!await limit('studio-usage:'+id,30))throw Error('RATE_LIMIT');const body=mutation.parse(await readJson(req));let l=await ledger(id);
 if(body.action==='limit')l=await ledger(id,{op:'limit',limitUsd:body.credits*creditConfig.usdPerCredit});
 else{const e=l.entries.find(e=>e.id===body.id);if(!e)throw Error('REQUEST_NOT_FOUND');if(e.state==='pending'||e.state==='reserved'){
  if(!e.generationId||!process.env.OPENROUTER_API_KEY)throw Error('COST_PENDING');
  const r=await fetch('https://openrouter.ai/api/v1/generation?id='+encodeURIComponent(e.generationId),{headers:{Authorization:`Bearer ${process.env.OPENROUTER_API_KEY}`},signal:AbortSignal.timeout(10000),cache:'no-store'});if(!r.ok)throw Error('COST_PENDING');const {data}=await r.json();if(typeof data?.total_cost!=='number'||!Number.isFinite(data.total_cost)||data.total_cost<0||(data.finish_reason==null&&!data.cancelled))throw Error('COST_PENDING');
  l=await ledger(id,{op:'update',id:e.id,patch:{state:'settled',actualUsd:data.total_cost,inputTokens:data.native_tokens_prompt??data.tokens_prompt,outputTokens:data.native_tokens_completion??data.tokens_completion}});
 }}return Response.json({...l,...totals(l),usdPerCredit:creditConfig.usdPerCredit});}catch(e){return failure(e);}}
