// Frontend production-build benchmark in an isolated copy. No env files, auth bypass or fixture route is deployed.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {chromium} from 'playwright-core';
const root=await fs.mkdtemp('/tmp/ruskicode-perf-');
for(const name of ['src','public','package.json','tsconfig.json','next.config.ts','postcss.config.js','postcss.config.mjs','tailwind.config.ts']){try{await fs.cp(name,path.join(root,name),{recursive:true});}catch(e){if(e.code!=='ENOENT')throw e;}}
await fs.symlink(path.join(process.cwd(),'node_modules'),path.join(root,'node_modules'));
await fs.writeFile(path.join(root,'src/app/workspace/layout.tsx'),`export default function FixtureLayout({children}:{children:React.ReactNode}){return children;}`);
await fs.writeFile(path.join(root,'src/app/workspace/page.tsx'),`import {Workspace} from '@/components/workspace';export default function Page(){return <Workspace/>;}`);
await fs.writeFile(path.join(root,'src/app/api/personal-chat/route.ts'),`export function GET(){return Response.json({models:[{id:'kie-flash',name:'Gemini 3.8 Flash · KIE'},{id:'kie-pro',name:'Gemini 3.1 Pro · KIE'}]});}`);
const build=spawn(process.execPath,['node_modules/next/dist/bin/next','build','--webpack'],{cwd:root,stdio:['ignore','pipe','pipe']});const buildLog=createWriteStream('/tmp/redesign-performance-build.log');build.stdout.pipe(buildLog);build.stderr.pipe(buildLog);await new Promise((resolve,reject)=>build.on('exit',c=>c===0?resolve():reject(Error('Benchmark build failed '+c))));
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3335'],{cwd:root,stdio:['ignore','pipe','pipe']});const log=createWriteStream('/tmp/redesign-performance-server.log');server.stdout.pipe(log);server.stderr.pipe(log);await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Benchmark server timeout')),30000);server.stdout.on('data',d=>{if(d.toString().includes('Ready')){clearTimeout(t);resolve();}});server.on('exit',c=>{clearTimeout(t);reject(Error('Benchmark server stopped '+c));});});
const browser=await chromium.launch({executablePath:process.argv[2]||'/tmp/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--remote-debugging-port=9222']});
try{const {default:lighthouse}=await import('/tmp/ruskicode-qa/node_modules/lighthouse/core/index.js');const scores=[];
 for(const [name,url] of [['landing','http://127.0.0.1:3335/'],['workspace','http://127.0.0.1:3335/workspace']]){const report=await lighthouse(url,{port:9222,output:['json','html'],logLevel:'error',onlyCategories:['performance','accessibility'],formFactor:'mobile',screenEmulation:{mobile:true,width:390,height:844,deviceScaleFactor:1,disabled:false}});await fs.writeFile(`docs/redesign-screenshots/lighthouse-${name}.json`,report.report[0]);await fs.writeFile(`docs/redesign-screenshots/lighthouse-${name}.html`,report.report[1]);const a=report.lhr.audits;const summary={name,performance:report.lhr.categories.performance.score*100,accessibility:report.lhr.categories.accessibility.score*100,lcp:a['largest-contentful-paint'].numericValue,cls:a['cumulative-layout-shift'].numericValue,failed:Object.values(a).filter(v=>v.score===0).map(v=>({id:v.id,title:v.title,details:v.details}))};scores.push(summary);console.log(JSON.stringify({name,performance:summary.performance,accessibility:summary.accessibility,lcp:summary.lcp,cls:summary.cls}));}
 await fs.writeFile('docs/redesign-screenshots/lighthouse-summary.json',JSON.stringify(scores,null,2));
}finally{await browser.close();server.kill('SIGTERM');log.end();}
