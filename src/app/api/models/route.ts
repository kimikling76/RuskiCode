import {modelCatalog,configured} from '@/lib/ai/catalog';
import {authorized} from '@/lib/ai/security';
export const dynamic='force-dynamic';
export async function GET(req:Request){return Response.json({authenticated:await authorized(req),accessConfigured:Boolean(process.env.BETTER_AUTH_SECRET),models:modelCatalog.map(m=>({id:m.id,name:m.name,enabled:configured(m),costPerToken:null,supportsTools:false,supportsVision:false})),multimedia:false},{headers:{'Cache-Control':'no-store'}});}
