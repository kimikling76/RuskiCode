// Local QA only. Requires the temporary development-only /redesign-qa fixture described in docs/redesign-report.md.
import {chromium} from 'playwright-core';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import path from 'node:path';
const qaRoot=await fs.mkdtemp('/tmp/ruskicode-chat-');
for(const name of ['src','public','package.json','tsconfig.json','next.config.ts','postcss.config.js','postcss.config.mjs','tailwind.config.ts']){try{await fs.cp(name,path.join(qaRoot,name),{recursive:true});}catch(e){if(e.code!=='ENOENT')throw e;}}
await fs.symlink(path.join(process.cwd(),'node_modules'),path.join(qaRoot,'node_modules'));
const configPath=path.join(qaRoot,'next.config.ts');await fs.writeFile(configPath,(await fs.readFile(configPath,'utf8')).replace('{ poweredByHeader: false,','{ devIndicators: false, poweredByHeader: false,'));
await fs.mkdir(path.join(qaRoot,'src/app/redesign-qa'),{recursive:true});
await fs.writeFile(path.join(qaRoot,'src/app/redesign-qa/page.tsx'),`import {notFound} from 'next/navigation';import Fixture from './fixture';export default function Page(){if(process.env.NODE_ENV!=='development')notFound();return <Fixture/>;}`);
await fs.writeFile(path.join(qaRoot,'src/app/redesign-qa/fixture.tsx'),`'use client';import {useEffect} from 'react';import {Workspace} from '@/components/workspace';import {usePersonal} from '@/store/personal-chat';export default function Fixture(){useEffect(()=>{usePersonal.getState().hydrate();if(usePersonal.getState().data.chats.length)usePersonal.getState().select('fixture');},[]);return <Workspace/>;}`);
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','3333'],{cwd:qaRoot,stdio:['ignore','pipe','pipe']});
const serverLog=createWriteStream('/tmp/redesign-qa-server.log');server.stdout.pipe(serverLog);server.stderr.pipe(serverLog);
await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('QA server did not start')),30000);server.stdout.on('data',d=>{if(d.toString().includes('Ready')){clearTimeout(t);resolve();}});server.on('exit',code=>{clearTimeout(t);reject(Error('QA server exited '+code));});});
const base='http://127.0.0.1:3333';
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
const axeSource=await fs.readFile('/tmp/ruskicode-qa/node_modules/axe-core/axe.min.js','utf8');
const streamServer=http.createServer((req,res)=>{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type');if(req.method==='OPTIONS'){res.end();return;}res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store'});const send=e=>res.write('data: '+JSON.stringify(e)+'\n\n');send({type:'model',name:'Gemini 3.8 Flash · KIE'});let i=0;const timer=setInterval(()=>{send({type:'delta',text:markdown.slice(i,i+200)});i+=200;if(i>=markdown.length){clearInterval(timer);send({type:'done'});res.end();}},150);res.on('close',()=>clearInterval(timer));});
await new Promise(r=>streamServer.listen(0,'127.0.0.1',r));const streamURL='http://127.0.0.1:'+streamServer.address().port+'/stream';
const browser=await chromium.launch({executablePath:process.argv[2]||'/tmp/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results={screens:[],checks:[],axe:[],consoleErrors:[]};
function data(state){const messages=state==='empty'||state==='streaming'?[]:[{id:'u1',role:'user',content:'¿Podés armar un plan y mostrar ejemplos de código? Объясни, пожалуйста.',createdAt:'2026-10-15T17:00:00Z'},{id:'a1',role:'assistant',content:state==='error'?'':state==='links'?'## Referencias\n\n![Icono aprobado](/icon.png)\n\n[Archivo del proyecto](/prototype.html)\n\nEl Chat actual entrega texto y enlaces. No hay adjuntos ni generación de imágenes en esta prueba.':markdown,model:'Gemini 3.8 Flash · KIE',status:state==='error'?'error':'done',createdAt:'2026-10-15T17:00:02Z',credits:2}];return {version:2,chats:messages.length?[{id:'fixture',title:'Разговор sobre ideas, código y diseño — título extenso para verificar el espacio',model:'auto',createdAt:'2026-10-15T17:00:00Z',messages,conversions:[]}]:[],projects:[],pending:[],usage:[]};}
async function setup(width,state){const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1,reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']});await context.addInitScript(d=>localStorage.setItem('estudio-personal-v2',JSON.stringify(d)),data(state));const page=await context.newPage();page.on('pageerror',e=>results.consoleErrors.push(String(e)));
 await page.route('**/api/personal-chat',async route=>{if(route.request().method()==='GET')return route.fulfill({json:{models:[{id:'kie-flash',name:'Gemini 3.8 Flash · KIE'},{id:'kie-pro',name:'Gemini 3.1 Pro · KIE'}]}});if(state==='streaming'){return route.continue({url:streamURL});}else await route.fulfill({contentType:'text/event-stream',body:'data: '+JSON.stringify({type:'delta',text:'Respuesta de QA: **recibida**.'})+'\n\ndata: '+JSON.stringify({type:'usage',usage:{credits:1}})+'\n\ndata: '+JSON.stringify({type:'done'})+'\n\n'});});
 await page.goto(base+'/redesign-qa',{waitUntil:'networkidle'});await page.waitForSelector('.chat-composer');await page.evaluate(()=>document.fonts.ready);return {context,page};}
try{
 for(const width of [390,768,1280,1920])for(const state of ['empty','long','error','links']){const {context,page}=await setup(width,state);if(state!=='empty')await page.locator('.chat-log').evaluate(el=>el.scrollTop=el.scrollHeight);await page.screenshot({path:`docs/redesign-screenshots/chat-${state}-${width}.png`});const metrics=await page.evaluate(()=>{const log=document.querySelector('.chat-log'),composer=document.querySelector('.chat-composer-zone');const a=log.getBoundingClientRect(),b=composer.getBoundingClientRect();return {pageOverflow:document.documentElement.scrollWidth>innerWidth+1,logBottom:a.bottom,composerTop:b.top,composerBottom:b.bottom,viewport:innerHeight,outerScroll:document.querySelector('.studio-main').scrollHeight>document.querySelector('.studio-main').clientHeight+1};});assert(!metrics.pageOverflow,`overflow ${width} ${state}`);assert(metrics.logBottom<=metrics.composerTop+1,`overlap ${width} ${state}`);assert(metrics.composerBottom<=metrics.viewport+1);assert(!metrics.outerScroll);results.screens.push({width,state,metrics});
  if(state==='long'){const el=page.locator('.chat-log');await el.evaluate(e=>e.scrollTop=0);await page.getByRole('button',{name:'Ir al último mensaje'}).waitFor();await page.getByRole('button',{name:'Ir al último mensaje'}).click();assert(await el.evaluate(e=>e.scrollHeight-e.clientHeight-e.scrollTop<100));if([390,1280].includes(width)){await page.addScriptTag({content:axeSource});const a=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));results.axe.push({width,state,violations:a.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});}}
  if(state==='empty'&&width===390){await page.getByRole('button',{name:'Revisar un texto',exact:true}).click();assert((await page.locator('#personal-message').inputValue()).includes('revisar'));await page.getByRole('switch').click();await page.getByRole('button',{name:'Enviar mensaje',exact:true}).click();await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(await page.locator('.chat-message').count(),0);results.checks.push('Ask-first cancel preserves unsent draft');}
  await context.close();}
 for(const width of [390,768,1280,1920]){const {context,page}=await setup(width,'streaming');await page.locator('#personal-message').fill('QA de streaming');await page.getByRole('button',{name:'Enviar mensaje',exact:true}).click();await page.getByRole('button',{name:'Detener respuesta',exact:true}).waitFor();await page.waitForFunction(()=>{const e=document.querySelector('.chat-log');return e&&e.scrollHeight>e.clientHeight+300;});await page.locator('.chat-log').evaluate(e=>e.scrollTop=0);await page.waitForTimeout(180);assert(await page.locator('.chat-log').evaluate(e=>e.scrollTop<40),'Streaming must not pull a reader back down');assert(await page.getByRole('button',{name:'Detener respuesta',exact:true}).isVisible(),'Capture must show an active stream');await page.screenshot({path:`docs/redesign-screenshots/chat-streaming-${width}.png`});assert(await page.getByRole('button',{name:'Detener respuesta',exact:true}).isVisible(),'Stream must remain active throughout screenshot');results.screens.push({width,state:'streaming',manualScrollPreserved:true});await page.getByRole('button',{name:'Enviar mensaje',exact:true}).waitFor({timeout:20000});await page.getByRole('button',{name:'Ir al último mensaje'}).click();assert(await page.locator('.chat-log').evaluate(e=>e.scrollHeight-e.clientHeight-e.scrollTop<100));await context.close();}results.checks.push('Real incremental SSE fixture at four widths; manual scroll preserved during tokens');

 const {context,page}=await setup(390,'empty');await page.locator('#personal-message').fill('Hola, esto es QA');await page.getByRole('button',{name:'Enviar mensaje',exact:true}).click();await page.waitForSelector('.chat-message-assistant strong');assert((await page.locator('.chat-message-assistant').innerText()).includes('recibida'));await page.getByRole('button',{name:'Editar título',exact:true}).click();await page.getByLabel('Título de la conversación').fill('Título editado — Разговор');await page.getByRole('button',{name:'Guardar título',exact:true}).click();assert((await page.locator('.chat-title-area').innerText()).includes('Разговор'));results.checks.push('Send, SSE rendering, usage recording and inline rename');await page.getByRole('button',{name:'Copiar mensaje',exact:true}).first().click();await page.getByRole('button',{name:'Borrar mensaje',exact:true}).first().click();await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'Cancelar',exact:true}).click();await page.getByRole('button',{name:'Convertir en proyecto'}).click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.setViewportSize({width:390,height:480});await page.locator('#personal-message').focus();assert(await page.locator('.chat-composer-zone').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight+1));results.checks.push('Copy, delete-cancel, conversion-cancel, mobile keyboard-sized viewport');await page.screenshot({path:'docs/redesign-screenshots/chat-keyboard-390.png'});await context.close();
 await fs.writeFile('docs/redesign-screenshots/qa-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify({screens:results.screens.length,checks:results.checks,axe:results.axe.map(x=>x.violations),consoleErrors:results.consoleErrors},null,2));
}finally{await fs.writeFile('docs/redesign-screenshots/qa-results.json',JSON.stringify(results,null,2));await browser.close();streamServer.close();server.kill('SIGTERM');serverLog.end();}
