import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initialState,type PipelineState} from '../src/lib/pipeline/types';
import {defaultBookSpec} from '../src/lib/books/spec';
import {advancePipeline,type EngineServices} from '../src/lib/pipeline/engine';
import {rasterizePDF} from '../src/lib/pipeline/raster';
function setup(){
 const s=initialState({projectId:'test',spec:{...defaultBookSpec(),estimatedChapters:1},brief:'Book',model:'auto',locale:'es',autoApproveOutline:true,generateImages:false,visualQA:true});
 let calls=0;let renders=0;let reviews=0;
 const result={pdf:Buffer.from('pdf'),html:'',layout:{designTokens:s.input.spec.designTokens,pages:[]},issues:[],pageCount:2,previews:[{name:'p1',data:Buffer.from('1')},{name:'p2',data:Buffer.from('2')}]};
 const services:EngineServices={incremental:true,provider:{id:'test',name:'Test',supportsTools:false,supportsVision:false,capabilities:['text'],costPerToken:null,async *stream(){},async generate(input){calls++;const id=input.system.includes('# book-planner')?'book-planner':input.system.includes('# layout-designer')?'layout-designer':'chapter-writer';return {text:await readFile(`skills/${id}/templates/output.example.json`,'utf8'),usage:{}};}},checkpoint:async()=>{},createImage:async()=>{throw Error()},imageStatus:async()=>null,downloadImage:async()=>'',render:async()=>{renders++;return result;},cachedRender:async()=>result,publish:async()=>['one','two'],review:async()=>{reviews++;return [];}};
 return {s,services,counts:()=>({calls,renders,reviews})};
}
test('serverless execution yields at chapter and QA boundaries and resumes without regenerating',async()=>{
 const {s,services,counts}=setup();let saved:PipelineState=s;let rounds=0;
 while(rounds++<30){const outcome=await advancePipeline(saved,services);saved=structuredClone(saved);if(outcome==='complete')break;assert.equal(outcome,'continue');}
 assert.equal(saved.stage,'complete');assert.equal(saved.qa?.visualReviewedPages,2);assert.deepEqual(counts(),{calls:3,renders:1,reviews:2});assert.ok(rounds>6);
});
test('PDF.js rasterizes each physical page of the real PDF without Poppler',async()=>{
 const previews=await rasterizePDF(await readFile('public/demo/ruskicode-sample.pdf'));
 assert.equal(previews.length,3);for(const page of previews){assert.equal(page.data[0],0xff);assert.equal(page.data[1],0xd8);assert.ok(page.data.length>1000);}
});
test('serverless visual correction rounds remain bounded across fresh invocations',async()=>{
 const {s,services,counts}=setup();s.stage='render';s.chapters=[{title:'Test',summary:'Test',blocks:[{id:'p',type:'paragraph',text:'Test'}]}];
 services.review=async()=>[{page:1,severity:'error',problem:'Overlap',suggestion:'Adjust spacing'}];
 let state=structuredClone(s);let outcome='continue';let units=0;
 while(outcome==='continue'&&units++<30){outcome=await advancePipeline(state,services);state=structuredClone(state);}
 assert.equal(outcome,'paused');assert.equal(state.iteration,2);assert.equal(state.qa?.iteration,3);assert.equal(counts().renders,3);assert.notEqual(state.stage,'complete');
});
