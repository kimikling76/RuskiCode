import {creditConfig} from './config';
export type UsageEntry={id:string;conversationId:string;modelId:string;modelName:string;studio:'chat'|'pdf'|'cinema';createdAt:string;state:'reserved'|'pending'|'settled'|'failed';estimatedUsd:number;reservedUsd:number;actualUsd?:number;inputTokens?:number;outputTokens?:number;generationId?:string};
export type Ledger={limitUsd:number;entries:UsageEntry[]};
export type LedgerAction={op:'read'}|{op:'limit';limitUsd:number}|{op:'reserve';entry:UsageEntry}|{op:'update';id:string;patch:Partial<UsageEntry>};
export function totals(l:Ledger){return {spentUsd:l.entries.reduce((n,e)=>n+(e.actualUsd??0),0),pendingUsd:l.entries.filter(e=>e.state==='reserved'||e.state==='pending').reduce((n,e)=>n+e.reservedUsd,0),pendingCount:l.entries.filter(e=>e.state==='reserved'||e.state==='pending').length};}
export function applyLedger(state:Ledger,action:LedgerAction):Ledger{
 const l=structuredClone(state);if(action.op==='limit'){const t=totals(l);if(action.limitUsd+1e-9<t.spentUsd+t.pendingUsd)throw Error('LIMIT_BELOW_SPEND');l.limitUsd=action.limitUsd;}
 if(action.op==='reserve'){if(l.entries.some(e=>e.id===action.entry.id))throw Error('DUPLICATE_REQUEST');if(l.entries.length>=1000)throw Error('SESSION_FULL');const t=totals(l);if(t.spentUsd+t.pendingUsd+action.entry.reservedUsd>l.limitUsd+1e-9)throw Error('SESSION_LIMIT');l.entries.push(action.entry);}
 if(action.op==='update'){const e=l.entries.find(e=>e.id===action.id);if(!e)throw Error('REQUEST_NOT_FOUND');if(e.state!=='settled'&&e.state!=='failed')Object.assign(e,action.patch);}
 return l;
}
const script=`local l=cjson.decode(redis.call('GET',KEYS[1]) or ARGV[1]); local a=cjson.decode(ARGV[2]); local spent=0;local pending=0;for _,e in ipairs(l.entries) do spent=spent+(e.actualUsd or 0);if e.state=='reserved' or e.state=='pending' then pending=pending+e.reservedUsd end end
if a.op=='limit' then if a.limitUsd+0.000000001<spent+pending then return cjson.encode({error='LIMIT_BELOW_SPEND'}) end;l.limitUsd=a.limitUsd end
if a.op=='reserve' then for _,e in ipairs(l.entries) do if e.id==a.entry.id then return cjson.encode({error='DUPLICATE_REQUEST'}) end end;if #l.entries>=1000 then return cjson.encode({error='SESSION_FULL'}) end;if spent+pending+a.entry.reservedUsd>l.limitUsd+0.000000001 then return cjson.encode({error='SESSION_LIMIT'}) end;table.insert(l.entries,a.entry) end
if a.op=='update' then local found=false;for _,e in ipairs(l.entries) do if e.id==a.id then found=true;if e.state~='settled' and e.state~='failed' then for k,v in pairs(a.patch) do e[k]=v end end end end;if not found then return cjson.encode({error='REQUEST_NOT_FOUND'}) end end
local out=cjson.encode(l);redis.call('SET',KEYS[1],out,'EX',ARGV[3]);return out`;
const local=new Map<string,Ledger>();
export async function ledger(sessionId:string,action:LedgerAction={op:'read'}):Promise<Ledger>{
 const initial:Ledger={limitUsd:creditConfig.defaultSessionLimitCredits*creditConfig.usdPerCredit,entries:[]};const url=process.env.UPSTASH_REDIS_REST_URL;const token=process.env.UPSTASH_REDIS_REST_TOKEN;
 if(!url||!token){if(process.env.NODE_ENV==='production')throw Error('LEDGER_UNAVAILABLE');const result=applyLedger(local.get(sessionId)??initial,action);local.set(sessionId,result);return result;}
 const r=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(['EVAL',script,'1','ruskicode:studio-usage:'+sessionId,JSON.stringify(initial),JSON.stringify(action),String(creditConfig.sessionTtlSeconds)]),signal:AbortSignal.timeout(8000),cache:'no-store'});
 if(!r.ok)throw Error('LEDGER_UNAVAILABLE');const body=await r.json();if(typeof body.result!=='string')throw Error('LEDGER_UNAVAILABLE');const result=JSON.parse(body.result);if(result.error)throw Error(result.error);if(!Array.isArray(result.entries))result.entries=[];return result;
}
