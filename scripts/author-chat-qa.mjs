// Isolated UI checks: no production auth bypass, no .env copy, no paid provider calls.
import {chromium} from 'playwright-core';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import path from 'node:path';
const axeSource=await fs.readFile('/tmp/ruskicode-qa/node_modules/axe-core/axe.min.js','utf8');
const executablePath=process.argv[2];
if(!executablePath||!(await fs.stat(executablePath)).size)throw Error('Pasá como primer argumento la ruta de Chromium.');
const qaRoot=await fs.mkdtemp('/tmp/author-chat-');
for(const name of ['src','public','package.json','tsconfig.json','next.config.ts','postcss.config.js','postcss.config.mjs','tailwind.config.ts']){try{await fs.cp(name,path.join(qaRoot,name),{recursive:true});}catch(e){if(e.code!=='ENOENT')throw e;}}
await fs.symlink(path.join(process.cwd(),'node_modules'),path.join(qaRoot,'node_modules'));
const configPath=path.join(qaRoot,'next.config.ts');await fs.writeFile(configPath,(await fs.readFile(configPath,'utf8')).replace('{ poweredByHeader: false,','{ devIndicators: false, poweredByHeader: false,'));
await fs.mkdir(path.join(qaRoot,'src/app/redesign-qa'),{recursive:true});
await fs.writeFile(path.join(qaRoot,'src/app/redesign-qa/page.tsx'),`import {notFound} from 'next/navigation';import Fixture from './fixture';export default function Page(){if(process.env.NODE_ENV!=='development')notFound();return <Fixture/>;}`);
await fs.writeFile(path.join(qaRoot,'src/app/redesign-qa/fixture.tsx'),`'use client';import {useEffect} from 'react';import {Workspace} from '@/components/workspace';import {usePersonal} from '@/store/personal-chat';export default function Fixture(){useEffect(()=>{usePersonal.getState().hydrate();if(usePersonal.getState().data.chats.length)usePersonal.getState().select('fixture');},[]);return <Workspace/>;}`);
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','3344'],{cwd:qaRoot,stdio:['ignore','pipe','pipe']});
const serverLog=createWriteStream('/tmp/author-qa-server.log');server.stdout.pipe(serverLog);server.stderr.pipe(serverLog);
await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('QA server did not start')),30000);server.stdout.on('data',d=>{if(d.toString().includes('Ready')){clearTimeout(t);resolve();}});server.on('exit',code=>{clearTimeout(t);reject(Error('QA server exited '+code));});});
const base='http://127.0.0.1:3344';
const markdown=`## Un plan claro, paso a paso

Este texto es una **respuesta de prueba local**, con peso regular y énfasis puntual. Привет! Давай знакомиться. Mañana revisamos cómo explicar «ё», «ñ» y «¿por qué?» sin problemas.

### Tres ideas para empezar

1. Definí el objetivo y el público.
2. Prepará un primer borrador.
3. Revisá el resultado antes de seguir.

- Una lista breve.
- Otra perspectiva, sin apuro.

> La claridad aparece cuando cada parte tiene su lugar.

---

| Palabra | Significado | Ejemplo largo en ruso |
| --- | --- | --- |
| школа | escuela | Это школа. Здесь учитель и ученики. |
| университет | universidad | Я изучаю русский язык в университете. |

Usá \`const привет = "Hola"\` para comprobar código en línea.

\`\`\`typescript
const сообщение = "Привет, мир! ¿Cómo estás?";
console.log(сообщение);
const longLine = "${'длинноеслово'.repeat(22)}";
\`\`\`

${Array.from({length:14},(_,i)=>`### Nota ${i+1}\n\n${'Una respuesta puede ser extensa y debe seguir siendo fácil de leer. '.repeat(3)} ${'Оченьдлинноерусскоесловобезпробелов'.repeat(4)}`).join('\n\n')}

**Última línea: siempre visible al ir al final.**`;

const streamServer=http.createServer((req,res)=>{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type');if(req.method==='OPTIONS'){res.end();return;}res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store'});const send=e=>res.write('data: '+JSON.stringify(e)+'\n\n');send({type:'model',name:'Gemini 3.8 Flash · KIE'});let i=0;const timer=setInterval(()=>{send({type:'delta',text:markdown.slice(i,i+200)});i+=200;if(i>=markdown.length){clearInterval(timer);send({type:'usage',usage:{credits:1}});send({type:'done'});res.end();}},150);res.on('close',()=>clearInterval(timer));});
await new Promise(r=>streamServer.listen(0,'127.0.0.1',r));const streamURL='http://127.0.0.1:'+streamServer.address().port+'/stream';
const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const evidence='docs/codigo-de-autor';
const behaviorOnly=process.argv.includes('--behavior-only');
await fs.mkdir(evidence,{recursive:true});
const results={screens:[],checks:[],axe:[],consoleErrors:[],unexpectedRequests:[]};
const normal='## De una idea a algo concreto\n\nPodemos empezar por lo que querés contar y darle forma juntos. **Primero, lo esencial:** ¿qué te gustaría que entienda quien lo lea?\n\n- Una idea clara.\n- Un ejemplo que la acerque.\n- Un cierre que invite a seguir.\n\nПривет! Давай начнём с одной хорошей идеи.\n\nNo hace falta tenerlo todo resuelto para empezar.';
const responseEvents=[{type:'model',name:'Gemini 3.8 Flash · KIE'},{type:'delta',text:'Respuesta de QA: **recibida**.'},{type:'usage',usage:{credits:1}},{type:'done'}];
function data(state){
 const messages=['empty','streaming'].includes(state)?[]:[{id:'u1',role:'user',content:'Quiero darle forma a una idea. ¿Por dónde empezamos?',createdAt:'2026-10-15T17:00:00Z'},{id:'a1',role:'assistant',content:state==='error'?'':state==='normal'?normal:markdown,model:'Gemini 3.8 Flash · KIE',status:state==='error'?'error':'done',createdAt:'2026-10-15T17:00:02Z',...(state==='long'?{credits:2}:{})}];
 return {version:2,chats:messages.length?[{id:'fixture',title:'Una idea que vale la pena explorar',model:'auto',createdAt:'2026-10-15T17:00:00Z',messages,conversions:[]}]:[],projects:[],pending:[],usage:[]};
}
async function setup(width,state,{motion='reduce',touch=false,fixture=data(state),fail=false}={}){
 const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1,reducedMotion:motion,hasTouch:touch,permissions:['clipboard-read','clipboard-write']});
 await context.addInitScript(d=>localStorage.setItem('estudio-personal-v2',JSON.stringify(d)),fixture);
 const page=await context.newPage();const posts=[];
 page.on('pageerror',error=>results.consoleErrors.push(String(error)));page.on('console',message=>{if(message.type()==='error')results.consoleErrors.push(message.text());});
 await page.route('**/api/personal-chat',async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{models:[{id:'kie-flash',name:'Gemini 3.8 Flash · KIE',provider:'Google'},{id:'kie-pro',name:'Gemini 3.1 Pro · KIE',provider:'Google'}]}});
  posts.push(route.request().postDataJSON());
  if(state==='streaming')return route.continue({url:streamURL});
  const events=fail?[{type:'model',name:'Gemini 3.8 Flash · KIE'},{type:'error',error:'PROVIDER_UNAVAILABLE'}]:responseEvents;
  return route.fulfill({contentType:'text/event-stream',body:events.map(event=>'data: '+JSON.stringify(event)+'\n\n').join('')});
 });
 await page.route('**/api/auth/**',route=>{results.unexpectedRequests.push(route.request().url());return route.abort();});
 await page.goto(base+'/redesign-qa',{waitUntil:'networkidle'});
 await page.waitForSelector('.chat-composer');await page.evaluate(()=>document.fonts.ready);
 if(['normal','long'].includes(state))await page.waitForSelector('.chat-markdown');
 return {context,page,posts};
}
async function capture(page,name,width){
 const metrics=await page.evaluate(()=>{
  const log=document.querySelector('.chat-log').getBoundingClientRect(),composer=document.querySelector('.chat-composer-zone').getBoundingClientRect(),footer=document.querySelector('.chat-storage-note').getBoundingClientRect();
  return {overflow:document.documentElement.scrollWidth>innerWidth+1,logBottom:log.bottom,composerTop:composer.top,composerBottom:composer.bottom,footerBottom:footer.bottom,height:innerHeight,outerScroll:document.querySelector('.studio-main').scrollHeight>document.querySelector('.studio-main').clientHeight+1};
 });
 assert(!metrics.overflow,'horizontal page overflow '+name);assert(metrics.logBottom<=metrics.composerTop+1,'composer overlap '+name);assert(metrics.composerBottom<=metrics.height+1,'composer clipped '+name);assert(metrics.footerBottom<=metrics.height+1,'footer clipped '+name);assert(!metrics.outerScroll,'outer page scrolling '+name);
 await page.screenshot({path:`${evidence}/${name}-${width}.png`,animations:'disabled'});results.screens.push({name,width,metrics});
}
async function scan(page,label){
 await page.addScriptTag({content:axeSource});
 const report=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
 const violations=report.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));results.axe.push({label,violations});assert.equal(violations.length,0,'axe '+label+' '+JSON.stringify(violations));
}
async function focused(locator){const handle=await locator.elementHandle();await locator.page().waitForFunction(element=>element===document.activeElement,handle,{timeout:3000});await handle.dispose();}
async function stored(page){return page.evaluate(()=>JSON.parse(localStorage.getItem('estudio-personal-v2')));}
try{
 for(const width of (behaviorOnly?[]:[390,768,1280,1920]))for(const state of ['empty','normal','long','error']){
  const {context,page}=await setup(width,state,{touch:width===390});
  if(state==='long')await page.locator('.chat-log').evaluate(el=>el.scrollTop=el.scrollHeight);
  await capture(page,state,width);
  assert.equal(await page.getByText(/Créditos no informados|Costo estimado: no disponible|No se recibió texto|La respuesta no se completó/).count(),0);
  if(state==='error'){assert.equal(await page.locator('.chat-inline-error').count(),1);assert.equal(await page.getByRole('button',{name:'Reintentar',exact:true}).count(),1);assert.equal(await page.locator('.chat-notice').count(),0);}
  if(state==='long'&&width===1280){await page.locator('.chat-log').evaluate(e=>e.scrollTop=0);await capture(page,'long-content',width);await scan(page,'long-desktop');}
  if(state==='long'&&width===390){await page.locator('.chat-code').evaluate(e=>e.scrollIntoView({block:'start'}));await capture(page,'code',width);}
  if(state==='empty'&&width===390)await scan(page,'empty-mobile');
  if(state==='normal'&&width===1280){
   await page.mouse.move(0,0);assert.equal(await page.locator('.chat-message-assistant time').evaluate(e=>getComputedStyle(e).opacity),'0');
   await page.locator('.chat-message-assistant').hover();assert.equal(await page.locator('.chat-message-assistant time').evaluate(e=>getComputedStyle(e).opacity),'1');
   await page.locator('.chat-message-assistant').getByRole('button',{name:'Copiar mensaje',exact:true}).focus();assert.equal(await page.locator('.chat-message-assistant time').evaluate(e=>getComputedStyle(e).opacity),'1');
   await scan(page,'normal-desktop');
  }
  await context.close();
 }
 if(!behaviorOnly)results.checks.push('Four widths: no overlap, clipping or page overflow; missing costs hidden; one error and one retry; desktop timestamps reveal on hover/focus');
 for(const width of (behaviorOnly?[]:[390,768,1280,1920])){
  const {context,page}=await setup(width,'streaming');await page.locator('#personal-message').fill('Prueba de streaming');await page.getByRole('button',{name:'Enviar mensaje',exact:true}).click();await page.getByRole('button',{name:'Detener respuesta',exact:true}).waitFor();
  await page.waitForFunction(()=>{const e=document.querySelector('.chat-log');return e.scrollHeight>e.clientHeight+300;});await page.locator('.chat-log').evaluate(e=>e.scrollTop=0);await page.waitForTimeout(180);assert(await page.locator('.chat-log').evaluate(e=>e.scrollTop<40));
  await capture(page,'streaming',width);assert(await page.getByRole('button',{name:'Detener respuesta',exact:true}).isVisible());
  await page.getByRole('button',{name:'Detener respuesta',exact:true}).click();await page.getByRole('button',{name:'Enviar mensaje',exact:true}).waitFor();assert.equal(await page.locator('.chat-inline-error').count(),1);assert.equal(await page.locator('.chat-notice').count(),0);
  await page.getByRole('button',{name:'Ir al último mensaje'}).click();assert(await page.locator('.chat-log').evaluate(e=>e.scrollHeight-e.clientHeight-e.scrollTop<100));await context.close();
 }
 if(!behaviorOnly)results.checks.push('Incremental HTTP SSE at all widths; manual scroll preserved; stop aborts and leaves a single inline error; jump-to-latest works');
 {
  const {context,page,posts}=await setup(1280,'empty',{motion:'no-preference'});
  const trigger=page.getByRole('button',{name:'Modelo de chat: Auto',exact:true});await trigger.focus();await page.keyboard.press('ArrowDown');
  const search=page.getByRole('combobox',{name:'Buscar modelo'});await search.waitFor();assert(await search.evaluate(e=>e===document.activeElement));
  await search.fill('inexistente');assert.equal(await page.getByRole('option').count(),0);await search.fill('Google');assert.equal(await page.getByRole('option').count(),2);
  await search.fill('Pro');await page.keyboard.press('Enter');await focused(page.getByRole('button',{name:'Modelo de chat: Gemini 3.1 Pro · KIE',exact:true}));
  await page.getByRole('button',{name:/Modelo de chat:/}).click();await page.getByRole('combobox',{name:'Buscar modelo'}).fill('Flash');await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.studio-modal,.chat-model-popover,.studio-drawer'));assert.equal(await page.getByRole('combobox',{name:'Buscar modelo'}).count(),0);
  await page.getByRole('button',{name:/Modelo de chat:/}).click();await page.getByRole('combobox',{name:'Buscar modelo'}).press('Tab');await focused(page.getByRole('switch'));await page.getByRole('button',{name:/Modelo de chat:/}).click();await page.getByRole('combobox',{name:'Buscar modelo'}).press('Shift+Tab');await focused(page.locator('#personal-message'));await page.getByRole('button',{name:/Modelo de chat:/}).click();await capture(page,'model-picker',1280);await scan(page,'model-picker');await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.studio-modal,.chat-model-popover,.studio-drawer'));
  await page.locator('#personal-message').fill('Una idea para explorar');await capture(page,'ready-to-send',1280);await page.getByRole('switch').click();await page.getByRole('button',{name:'Enviar mensaje',exact:true}).click();await page.getByRole('dialog').waitFor();
  for(let i=0;i<6;i++){await page.keyboard.press('Tab');assert(await page.getByRole('dialog').evaluate(e=>e.contains(document.activeElement)));}
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.studio-modal,.chat-model-popover,.studio-drawer'));assert.equal(await page.locator('#personal-message').inputValue(),'Una idea para explorar');assert.equal(posts.length,0);
  await page.getByRole('button',{name:'Enviar mensaje',exact:true}).click();await page.getByRole('button',{name:'Confirmar y enviar',exact:true}).click();await page.getByRole('button',{name:'Detener respuesta',exact:true}).waitFor({state:'hidden'});
  assert.equal(posts[0].model,'kie-pro');assert.equal((await stored(page)).usage.at(-1).credits,1);assert((await page.locator('.chat-message-assistant').innerText()).includes('1 créditos'));
  await page.getByRole('button',{name:'Editar título',exact:true}).click();await page.getByLabel('Título de la conversación').fill('Conversación personal — Разговор');await page.getByRole('button',{name:'Guardar título',exact:true}).click();await focused(page.getByRole('button',{name:'Editar título',exact:true}));await page.getByRole('button',{name:'Buscar chats',exact:true}).click();await page.getByRole('textbox',{name:'Buscar en los títulos de chats'}).fill('no existe');await page.getByText('No hay chats con ese título.',{exact:true}).waitFor();await page.getByRole('textbox',{name:'Buscar en los títulos de chats'}).press('Escape');
  await page.locator('.chat-message-assistant').getByRole('button',{name:'Copiar mensaje',exact:true}).click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'Respuesta de QA: **recibida**.');
  await page.getByRole('button',{name:/Modelo de chat:/}).click();await page.getByRole('combobox',{name:'Buscar modelo'}).fill('Flash');await page.keyboard.press('Enter');
  await page.getByRole('switch').click();await page.locator('#personal-message').fill('Sigamos con otro modelo');await page.locator('#personal-message').press('Control+Enter');await page.waitForFunction(()=>document.querySelectorAll('.chat-message').length===4);await page.getByRole('button',{name:'Detener respuesta',exact:true}).waitFor({state:'hidden'});assert.equal(posts[1].model,'kie-flash');assert.equal(posts[1].messages.length,3);
  await page.getByRole('button',{name:'Regenerar respuesta',exact:true}).click();await page.getByRole('button',{name:'Confirmar y reintentar',exact:true}).click();await page.getByRole('button',{name:'Detener respuesta',exact:true}).waitFor({state:'hidden'});assert.equal((await stored(page)).chats[0].messages.length,4);
  await page.getByRole('button',{name:'Convertir en proyecto',exact:true}).click();await page.getByLabel('2. Nombre del proyecto').fill('Proyecto confirmado de QA');await page.getByLabel('Brief editable: objetivo, público, nivel, estilo y restricciones').fill('Objetivo: explorar una idea. Público: equipo. Estilo: claro.');await page.getByRole('button',{name:'Confirmar y abrir proyecto',exact:true}).click();
  let record=await stored(page);assert.equal(record.projects.length,1);assert.equal(record.chats.length,1);assert.equal(record.chats[0].conversions.length,1);assert((await page.locator('#studio-main').innerText()).includes('Brief confirmado'));
  await page.getByRole('button',{name:'Chat',exact:true}).click();assert.equal(await page.locator('.chat-message').count(),4);
  const first=page.locator('.chat-message-user').first();await first.getByRole('button',{name:'Borrar mensaje',exact:true}).click();await page.getByRole('alertdialog').waitFor();await focused(page.getByRole('button',{name:'Cancelar',exact:true}));await scan(page,'delete-message-confirmation');await page.getByRole('alertdialog').getByRole('button',{name:'Borrar mensaje',exact:true}).click();record=await stored(page);assert.equal(record.chats[0].messages.length,3);assert.equal(record.projects[0].source.messages.length,4);
  const menu=page.getByRole('button',{name:'Menú de Conversación personal — Разговор',exact:true});await menu.focus();await page.keyboard.press('Enter');await page.getByRole('menuitem',{name:'Renombrar',exact:true}).waitFor();await page.keyboard.press('Enter');await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.studio-modal,.chat-model-popover,.studio-drawer'));await focused(menu);
  await menu.click();await page.getByRole('menuitem',{name:'Borrar',exact:true}).click();await page.getByRole('alertdialog').waitFor();await focused(page.getByRole('button',{name:'Cancelar',exact:true}));await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.studio-modal,.chat-model-popover,.studio-drawer'));await focused(menu);
  await menu.click();await page.getByRole('menuitem',{name:'Borrar',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Borrar chat',exact:true}).click();record=await stored(page);assert.equal(record.pending.length,1);assert.equal(record.chats.length,0);assert.equal(record.projects.length,1);await page.getByRole('button',{name:'Deshacer',exact:true}).click();assert.equal((await stored(page)).chats.length,1);
  await menu.click();await page.getByRole('menuitem',{name:'Borrar',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Borrar chat',exact:true}).click();await page.waitForTimeout(8300);record=await stored(page);assert.equal(record.chats.length,0);assert.equal(record.pending.length,0);assert.equal(record.projects.length,1);
  await context.close();results.checks.push('Search, provider filtering by text, keyboard selection/Escape/focus; no fabricated model metadata; confirmation focus trap; send, real fixture usage, model change mid-chat, copy, rename, regenerate, manual conversion; message delete preserves project copy; menu keyboard/focus; chat delete/undo/8s purge preserves project');
 }
 {
  const fixture=data('error');fixture.chats[0].messages.push({id:'u2',role:'user',content:'Mensaje posterior que se conserva.'},{id:'a2',role:'assistant',content:'Respuesta posterior que se conserva.',status:'done'});
  const {context,page,posts}=await setup(1280,'error',{fixture});await page.getByRole('button',{name:'Reintentar',exact:true}).click();await page.getByRole('button',{name:'Confirmar y reintentar',exact:true}).click();await page.getByRole('button',{name:'Detener respuesta',exact:true}).waitFor({state:'hidden'});const record=await stored(page);assert.equal(record.chats[0].messages.length,4);assert.equal(record.chats[0].messages[3].id,'a2');assert.equal(posts[0].messages.length,1);await context.close();results.checks.push('Retry of older failed response replaces only that response and preserves later messages');
 }
 {
  const {context,page}=await setup(390,'normal',{touch:true});await page.getByRole('button',{name:'Abrir navegación',exact:true}).click();await page.getByRole('dialog',{name:'Navegación del estudio'}).waitFor();await capture(page,'mobile-navigation',390);await scan(page,'mobile-navigation');await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.studio-modal,.chat-model-popover,.studio-drawer'));await focused(page.getByRole('button',{name:'Abrir navegación',exact:true}));
  assert.equal(await page.locator('.chat-message-assistant time').evaluate(e=>getComputedStyle(e).opacity),'1');
  assert.equal(await page.locator('.chat-message-assistant').evaluate(e=>getComputedStyle(e).animationName),'none');
  await page.setViewportSize({width:390,height:480});await page.locator('#personal-message').fill('Una línea\nOtra línea\nТретья строка\nUna cuarta línea');await page.locator('#personal-message').focus();await capture(page,'keyboard-sized-viewport',390);
  await page.setViewportSize({width:390,height:900});await page.getByRole('button',{name:/Modelo de chat:/}).click();await capture(page,'model-picker',390);await scan(page,'model-picker-mobile');assert.equal(await page.locator('.chat-model-popover').evaluate(e=>getComputedStyle(e).animationName),'none');await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.studio-modal,.chat-model-popover,.studio-drawer'));await context.close();results.checks.push('Mobile drawer focus/Escape; touch metadata; reduced-motion messages and portals; multi-line composer at keyboard-sized viewport');
 }
 {
  const {context,page}=await setup(1280,'empty',{fail:true});await page.locator('#personal-message').fill('Provocar un error controlado');await page.getByRole('button',{name:'Enviar mensaje',exact:true}).click();await page.getByRole('button',{name:'Reintentar',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Reintentar',exact:true}).count(),1);assert.equal(await page.locator('.chat-notice').count(),0);assert.equal(await page.getByText('No pude terminar esta respuesta.',{exact:true}).count(),1);await context.close();results.checks.push('An actual SSE error produces one inline error with one retry and no duplicate banner');
 }
 assert.equal(results.consoleErrors.length,0);assert.equal(results.unexpectedRequests.length,0);
 console.log(JSON.stringify({screens:results.screens.length,checks:results.checks,axe:results.axe.map(x=>({label:x.label,violations:x.violations})),consoleErrors:results.consoleErrors},null,2));
}finally{
 await fs.writeFile(`${evidence}/${behaviorOnly?'qa-behaviors':'qa-results'}.json`,JSON.stringify(results,null,2));await browser.close();streamServer.close();server.kill('SIGTERM');serverLog.end();
}
