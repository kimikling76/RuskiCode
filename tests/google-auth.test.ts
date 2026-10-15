import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedGoogleIdentity,googleConfig} from '../src/lib/auth/google';
test('private Google identity requires exact allowed email and verified claim',()=>{
 assert.equal(allowedGoogleIdentity({email:'TEAM@gmail.com',emailVerified:true},'team@gmail.com'),true);
 assert.equal(allowedGoogleIdentity({email:'other@gmail.com',emailVerified:true},'team@gmail.com'),false);
 assert.equal(allowedGoogleIdentity({email:'team+other@gmail.com',emailVerified:true},'team@gmail.com'),false);
 assert.equal(allowedGoogleIdentity({email:'team@gmail.com',emailVerified:false},'team@gmail.com'),false);
});
test('Google login stays disabled with incomplete configuration',()=>{
 const names=['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','STUDIO_GOOGLE_EMAIL'] as const;
 const saved=names.map(name=>process.env[name]);
 try{for(const name of names)delete process.env[name];assert.equal(googleConfig(),null);
 process.env.GOOGLE_CLIENT_ID='test';process.env.GOOGLE_CLIENT_SECRET='test';assert.equal(googleConfig(),null);
 process.env.STUDIO_GOOGLE_EMAIL=' TEAM@gmail.com ';assert.equal(googleConfig()?.email,'team@gmail.com');
 }finally{names.forEach((name,i)=>{if(saved[i]===undefined)delete process.env[name];else process.env[name]=saved[i];});}
});
