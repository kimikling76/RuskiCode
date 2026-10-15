import {authorized} from '@/lib/ai/security';
import {skillList} from '@/lib/skills/loader';
export const runtime='nodejs';
export async function GET(req:Request){if(!await authorized(req))return Response.json({error:"AUTH_REQUIRED"},{status:401});return Response.json({skills:await skillList(),mode:'structured-json',externalToolsAvailable:false},{headers:{'Cache-Control':'no-store'}});}
