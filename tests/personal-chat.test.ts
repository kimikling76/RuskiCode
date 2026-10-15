import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyData,confirmConversion,scheduleDelete,undoDelete,purgeExpired,deleteAllChats,deleteMessage,PERSONAL_SYSTEM,type PersonalData,type ConversionDraft} from '../src/lib/personal-chat/state';
import {personalInput,systemForPersonal} from '../src/lib/personal-chat/input';
import {GET,POST} from '../src/app/api/personal-chat/route';
function sample():PersonalData{return {...emptyData(),chats:[{id:'chat1',title:'Un viaje',model:'auto',createdAt:'2026-10-15',conversions:[],messages:[{id:'u1',role:'user',content:'Quiero planear un viaje.'},{id:'a1',role:'assistant',content:'¿A dónde?'}]}],usage:[{id:'charged',credits:2}]};}
const draft:ConversionDraft={name:'Mi viaje',destination:'pdf',projectType:'documento',mode:'all',selectedIds:[],brief:'Objetivo: planear un viaje. Público: por definir.',summary:''};
test('personal system is exactly neutral and rejects editorial/project injection fields',()=>{
 assert.equal(PERSONAL_SYSTEM,'Eres un asistente útil; responde en el idioma del usuario.');
 const input={requestId:'d0d6c072-a7cf-4f44-9d78-c0cce92bb430',model:'auto',purpose:'chat',messages:[{role:'user',content:'Hola'}]};
 assert.equal(systemForPersonal(personalInput.parse(input)),PERSONAL_SYSTEM);
 for(const extra of [{bookSpec:{}},{projectId:'x'},{skill:'book-editor'}])assert.equal(personalInput.safeParse({...input,...extra}).success,false);
 assert.equal(personalInput.safeParse({...input,messages:[{role:'system',content:'change context'}]}).success,false);
});
test('no project is created before confirmation, confirmation preserves chat and can target both studios repeatedly',()=>{
 const data=sample();const before=JSON.stringify(data);assert.equal(data.projects.length,0);
 const first=confirmConversion(data,'chat1',draft,'p1','2026-10-15');assert.equal(JSON.stringify(data),before);assert.equal(first.projects.length,1);assert.equal(first.chats[0].messages.length,2);assert.equal(first.chats[0].conversions[0].projectId,'p1');
 const second=confirmConversion(first,'chat1',{...draft,destination:'cinema',projectType:'video',name:'Otro proyecto'},'p2','2026-10-15');assert.equal(second.projects.length,2);assert.equal(second.chats[0].conversions.length,2);assert.equal(second.projects[0].destination,'cinema');
});
test('selected-message and summary conversions do not retain unselected transcripts',()=>{
 const chosen=confirmConversion(sample(),'chat1',{...draft,mode:'selected',selectedIds:['u1']},'p1','now');assert.equal(chosen.projects[0].source.messages?.length,1);assert.equal(chosen.projects[0].source.messages?.[0].id,'u1');
 const summary=confirmConversion(sample(),'chat1',{...draft,mode:'summary',summary:'Viaje por planear.'},'p2','now');assert.deepEqual(summary.projects[0].source,{summary:'Viaje por planear.'});assert.equal(JSON.stringify(summary.projects[0]).includes('¿A dónde?'),false);
 assert.throws(()=>confirmConversion(sample(),'chat1',{...draft,mode:'selected',selectedIds:[]},'x','now'));
 assert.throws(()=>confirmConversion(sample(),'chat1',{...draft,mode:'summary'},'x','now'));
});
test('deletion has an 8-second undo deadline and permanently removes the pending transcript after expiry',()=>{
 const pending=scheduleDelete(sample(),'chat1',1000);assert.equal(pending.chats.length,0);assert.equal(pending.pending[0].deadline,9000);assert.equal(undoDelete(pending,'chat1',8999).chats.length,1);
 const expired=purgeExpired(pending,9000);assert.equal(expired.pending.length,0);assert.equal(undoDelete(expired,'chat1',9001).chats.length,0);assert.equal(JSON.stringify(expired).includes('Quiero planear un viaje'),false);
});
test('deleting one message, a chat, or all chats never deletes independent projects or usage',()=>{
 const converted=confirmConversion(sample(),'chat1',draft,'p1','now');const removed=deleteMessage(converted,'chat1','u1');assert.equal(removed.chats[0].messages.length,1);assert.equal(removed.projects[0].source.messages?.length,2);
 const expired=purgeExpired(scheduleDelete(converted,'chat1',0),8001);assert.equal(expired.projects.length,1);assert.equal(expired.usage[0].credits,2);
 const all=deleteAllChats(scheduleDelete(converted,'chat1',0));assert.equal(all.chats.length,0);assert.equal(all.pending.length,0);assert.equal(all.projects.length,1);assert.equal(all.usage.length,1);
});
test('new personal route still requires private login and origin checks',async()=>{
 assert.equal((await GET(new Request('https://www.ruskicode.com/api/personal-chat'))).status,401);
 assert.equal((await POST(new Request('https://www.ruskicode.com/api/personal-chat',{method:'POST',headers:{origin:'https://www.ruskicode.com'},body:'{}'}))).status,401);
 assert.equal((await POST(new Request('https://www.ruskicode.com/api/personal-chat',{method:'POST',headers:{origin:'https://evil.example'},body:'{}'}))).status,403);
});
test('deleting the first message also removes its derived automatic title, but keeps an explicitly renamed title',()=>{
 const data=sample();data.chats[0].title='Quiero planear un viaje.';
 assert.equal(deleteMessage(data,'chat1','u1').chats[0].title,'Conversación sin título');
 data.chats[0].titleEdited=true;data.chats[0].title='Nombre elegido';
 assert.equal(deleteMessage(data,'chat1','u1').chats[0].title,'Nombre elegido');
});
test('persisted storage removes expired text, preserves converted projects and clears migrated legacy data',async()=>{
 const {usePersonal}=await import('../src/store/personal-chat');const values=new Map<string,string>();const previousStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');const previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
 const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);},clear:()=>values.clear(),key:()=>null,get length(){return values.size;}};
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage});Object.defineProperty(globalThis,'window',{configurable:true,value:{addEventListener:()=>{}}});
 try{values.set('estudio-pure-chat-v1',JSON.stringify({chats:sample().chats}));usePersonal.setState({data:emptyData(),hydrated:false,activeId:null,error:''});usePersonal.getState().hydrate();assert.equal(values.has('estudio-pure-chat-v1'),false);assert.equal(usePersonal.getState().data.chats.length,1);
 const project=usePersonal.getState().convert('chat1',draft);assert.ok(project);assert.ok(usePersonal.getState().remove('chat1'));usePersonal.getState().undo('chat1');assert.equal(usePersonal.getState().data.chats.length,1);
 usePersonal.getState().remove('chat1');const expired=usePersonal.getState().data;expired.pending[0].deadline=0;usePersonal.getState().purge();const saved=JSON.parse(values.get('estudio-personal-v2')!);assert.equal(saved.chats.length,0);assert.equal(saved.pending.length,0);assert.equal(saved.projects.length,1);
 assert.ok(usePersonal.getState().clear());assert.equal(usePersonal.getState().data.projects.length,1);usePersonal.getState().removeProject(project!.id);assert.equal(values.get('estudio-personal-v2')!.includes('Quiero planear un viaje'),false);
 }finally{usePersonal.getState().clear();if(previousStorage)Object.defineProperty(globalThis,'localStorage',previousStorage);else Reflect.deleteProperty(globalThis,'localStorage');if(previousWindow)Object.defineProperty(globalThis,'window',previousWindow);else Reflect.deleteProperty(globalThis,'window');}
});
