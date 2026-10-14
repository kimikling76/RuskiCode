import {modelCatalog,configured} from '@/lib/ai/catalog';
import {authorized} from '@/lib/ai/security';
export const dynamic='force-dynamic';
export function GET(req:Request){return Response.json({authenticated:authorized(req),accessConfigured:Boolean(process.env.STUDIO_ACCESS_CODE),models:modelCatalog.map(m=>({id:m.id,name:m.name,enabled:configured(m),costPerToken:null,supportsTools:false,supportsVision:false})),multimedia:false},{headers:{'Cache-Control':'no-store'}});}
