import {betterAuth} from 'better-auth';
import {APIError} from 'better-auth/api';
import {googleConfig,allowedGoogleIdentity} from './google';
import {prismaAdapter} from 'better-auth/adapters/prisma';
import {nextCookies} from 'better-auth/next-js';
import {studioAuthPolicy} from './policy';
import {database} from '@/lib/pipeline/database';
let normal:ReturnType<typeof createAuth>|undefined;
function createAuth(bootstrap=false){
 if(!process.env.BETTER_AUTH_SECRET)throw Error('AUTH_NOT_CONFIGURED');
 const google=googleConfig();
 return betterAuth({
  appName:'RuskiCode Studio',
  baseURL:process.env.BETTER_AUTH_URL||process.env.PUBLIC_APP_URL,
  secret:process.env.BETTER_AUTH_SECRET,
  database:prismaAdapter(database(),{provider:'postgresql'}),
  ...studioAuthPolicy(bootstrap),
  socialProviders:!bootstrap&&google?{google:{clientId:google.clientId,clientSecret:google.clientSecret,prompt:'select_account' as const}}:{},
  account:{accountLinking:{enabled:true,trustedProviders:['google']}},
  databaseHooks:{user:{create:{before:async user=>{
   if(google){
    if(!allowedGoogleIdentity(user,google.email,!bootstrap)||await database().user.count()>0)throw new APIError('FORBIDDEN',{message:'Acceso exclusivo para el equipo.'});
   }else if(!bootstrap)throw new APIError('FORBIDDEN',{message:'Registro cerrado.'});
   return {data:user};
  }}},session:{create:{before:async session=>{
   if(google){const user=await database().user.findUnique({where:{id:session.userId}});if(!user||!allowedGoogleIdentity(user,google.email,false))throw new APIError('FORBIDDEN',{message:'Acceso exclusivo para el equipo.'});}
   return {data:session};
  }}}},
  plugins:[nextCookies()],
 });
}
export function auth(){return normal??=createAuth();}
// This instance is server-only and is never mounted as a public sign-up route.
export function bootstrapAuth(){return createAuth(true);}
export async function studioSession(headers:Headers){
 try{const session=await auth().api.getSession({headers});return session?.user.role==='admin'?session:null;}catch{return null;}
}
