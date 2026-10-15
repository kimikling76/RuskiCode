import {identity,inputSchema,readJson,signQuote,failure} from '@/lib/studio-chat/server';
import {getChatModels} from '@/lib/studio-chat/catalog';
import {quotePrice,selectChatModel} from '@/lib/studio-chat/pricing';
import {ledger,totals} from '@/lib/studio-chat/ledger';
import {creditConfig} from '@/lib/studio-chat/config';
import {limit} from '@/lib/ai/security';
export const runtime='nodejs';
export async function POST(req:Request){try{const id=await identity(req,true);if(!await limit('studio-quotes:'+id,120))throw Error('RATE_LIMIT');const input=inputSchema.parse(await readJson(req));const model=selectChatModel(await getChatModels(),input);const quote=quotePrice(model,input);const usage=await ledger(id);const t=totals(usage);return Response.json({...quote,token:signQuote(input,id,model.id,quote.reservedUsd),budget:{...t,limitUsd:usage.limitUsd,willExceed:t.spentUsd+t.pendingUsd+quote.reservedUsd>usage.limitUsd+1e-9,warning:t.spentUsd+t.pendingUsd+quote.reservedUsd>=usage.limitUsd*creditConfig.warningRatio}},{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
