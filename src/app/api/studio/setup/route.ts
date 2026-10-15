import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {database} from '@/lib/pipeline/database';
import {auth,bootstrapAuth} from '@/lib/auth/server';
import {sameOrigin,limit,matches} from '@/lib/ai/security';
export const runtime='nodejs';
const inputSchema=z.object({email:z.string().trim().toLowerCase().email().max(254),password:z.string().min(12).max(128),code:z.string().min(1).max(256)}).strict();
export async function POST(request:Request){
 if(!sameOrigin(request)||!request.headers.get('origin'))return Response.json({error:'FORBIDDEN'},{status:403});
 try{
  if(!await limit('studio-setup',5,3600))return Response.json({error:'RATE_LIMIT'},{status:429});
  const text=await request.text();if(text.length>4096)return Response.json({error:'INVALID_REQUEST'},{status:400});
  const parsed=inputSchema.safeParse(JSON.parse(text));if(!parsed.success)return Response.json({error:'INVALID_REQUEST'},{status:400});
  const {email,password,code}=parsed.data;const secret=process.env.STUDIO_ACCESS_CODE;
  if(!secret||!matches(code,secret))return Response.json({error:'SETUP_DENIED'},{status:403});
  const db=database();if(await db.user.count())return Response.json({error:'SETUP_CLOSED'},{status:409});
  const token=randomUUID();
  try{await db.studioSetup.create({data:{id:1,token}});}catch{return Response.json({error:'SETUP_CLOSED'},{status:409});}
  try{await bootstrapAuth().api.signUpEmail({body:{email,password,name:'RuskiCode · Equipo'}});}catch{
   // Keep the reservation if an account may have been created before a partial failure.
   if(await db.user.count()===0)await db.studioSetup.deleteMany({where:{id:1,token}});
   return Response.json({error:'SETUP_FAILED'},{status:503});
  }
  return await auth().api.signInEmail({body:{email,password,rememberMe:true},headers:request.headers,asResponse:true});
 }catch{return Response.json({error:'SETUP_UNAVAILABLE'},{status:503});}
}
