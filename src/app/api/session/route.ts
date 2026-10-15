import {auth} from '@/lib/auth/server';
import {sameOrigin} from '@/lib/ai/security';
export const runtime='nodejs';
// Retire the old shared-code login: old HMAC cookies grant no application access.
export async function POST(){return Response.json({error:'USE_LOGIN',login:'/login'},{status:410});}
export async function DELETE(request:Request){if(!sameOrigin(request))return new Response(null,{status:403});try{return await auth().api.signOut({headers:request.headers,asResponse:true});}catch{return Response.json({error:'AUTH_UNAVAILABLE'},{status:503});}}
