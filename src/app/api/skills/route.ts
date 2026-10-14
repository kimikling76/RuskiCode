import {skillList} from '@/lib/skills/loader';
export const runtime='nodejs';
export async function GET(){return Response.json({skills:await skillList(),mode:'structured-json',externalToolsAvailable:false},{headers:{'Cache-Control':'no-store'}});}
