import {getChatModels} from '@/lib/studio-chat/catalog';
import {identity,failure} from '@/lib/studio-chat/server';
import {creditConfig} from '@/lib/studio-chat/config';
export const runtime='nodejs';
export async function GET(req:Request){try{await identity(req);const models=await getChatModels();return Response.json({models,configured:Boolean(process.env.OPENROUTER_API_KEY),creditConfig,cacheHours:creditConfig.catalogCacheSeconds/3600},{headers:{'Cache-Control':'private, no-store'}});}catch(e){return failure(e);}}
