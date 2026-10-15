import test from 'node:test';
import assert from 'node:assert/strict';
import {betterAuth} from 'better-auth';
import {memoryAdapter} from 'better-auth/adapters/memory';
import {studioAuthPolicy} from '../src/lib/auth/policy';
import {POST as oldLogin} from '../src/app/api/session/route';
const baseURL='http://localhost:3099';
const secret='test-only-auth-secret-longer-than-thirty-two-characters';
function fixture(){const db:Record<string,unknown[]>={user:[],session:[],account:[],verification:[]};function make(bootstrap=false){return betterAuth({...studioAuthPolicy(bootstrap),baseURL,secret,database:memoryAdapter(db),rateLimit:{enabled:false}});}return {db,normal:make(),bootstrap:make(true)};}
function cookies(response:Response){return response.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');}
test('public email signup is disabled and legacy code login is retired',async()=>{
 const {normal,db}=fixture();
 const result=await normal.handler(new Request(baseURL+'/api/auth/sign-up/email',{method:'POST',headers:{'Content-Type':'application/json',origin:baseURL},body:JSON.stringify({email:'test@example.com',name:'Test',password:'a-long-test-password'})}));
 assert.ok(result.status>=400);assert.equal(db.user.length,0);assert.equal((await oldLogin()).status,410);
});
test('shared account supports separate sessions, rejects wrong passwords and revokes signed-out session',async()=>{
 const {normal,bootstrap}=fixture();const body={email:'team@example.com',name:'Team',password:'test-password-with-24-characters'};
 await bootstrap.api.signUpEmail({body});
 const first=await normal.api.signInEmail({body,asResponse:true});const second=await normal.api.signInEmail({body,asResponse:true});assert.equal(first.status,200);assert.equal(second.status,200);
 const a=new Headers({cookie:cookies(first)});const b=new Headers({cookie:cookies(second)});
 const session=await normal.api.getSession({headers:a});assert.equal(session?.user.email,body.email);assert.equal(session?.user.role,'admin');
 await assert.rejects(normal.api.signInEmail({body:{email:body.email,password:'the-wrong-password'}}));
 await normal.api.signOut({headers:a});assert.equal(await normal.api.getSession({headers:a}),null);assert.ok(await normal.api.getSession({headers:b}));
});
