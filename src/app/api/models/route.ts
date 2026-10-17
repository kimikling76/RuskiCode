import {modelCatalog,configured} from '@/lib/ai/catalog';
import {catalog,publicModel} from '@/lib/ai/models';
import {authorized} from '@/lib/ai/security';
export const dynamic='force-dynamic';
// `models`: the earlier provider slots (OpenAI, Anthropic, Google…). `kie`: the studio's Kie catalog, without endpoints or keys.
export async function GET(req:Request){const key=Boolean(process.env.KIE_API_KEY);return Response.json({authenticated:await authorized(req),accessConfigured:Boolean(process.env.BETTER_AUTH_SECRET),models:modelCatalog.map(m=>({id:m.id,name:m.name,enabled:configured(m),costPerToken:null,supportsTools:false,supportsVision:false})),kie:catalog.map(m=>publicModel(m,key)),multimedia:false},{headers:{'Cache-Control':'no-store'}});}
