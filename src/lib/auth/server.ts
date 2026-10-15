import {betterAuth} from 'better-auth';
import {prismaAdapter} from 'better-auth/adapters/prisma';
import {nextCookies} from 'better-auth/next-js';
import {studioAuthPolicy} from './policy';
import {database} from '@/lib/pipeline/database';
let normal:ReturnType<typeof createAuth>|undefined;
function createAuth(bootstrap=false){
 if(!process.env.BETTER_AUTH_SECRET)throw Error('AUTH_NOT_CONFIGURED');
 return betterAuth({
  appName:'RuskiCode Studio',
  baseURL:process.env.BETTER_AUTH_URL||process.env.PUBLIC_APP_URL,
  secret:process.env.BETTER_AUTH_SECRET,
  database:prismaAdapter(database(),{provider:'postgresql'}),
  ...studioAuthPolicy(bootstrap),
  plugins:[nextCookies()],
 });
}
export function auth(){return normal??=createAuth();}
// This instance is server-only and is never mounted as a public sign-up route.
export function bootstrapAuth(){return createAuth(true);}
export async function studioSession(headers:Headers){
 try{const session=await auth().api.getSession({headers});return session?.user.role==='admin'?session:null;}catch{return null;}
}
