import {z} from 'zod';
import {NonRetriableError} from 'inngest';
import {inngest} from './client';
import {database} from '@/lib/pipeline/database';
import {advancePipeline} from '@/lib/pipeline/engine';
import {renderBook} from '@/lib/pipeline/render';
import {publishBook,readPublishedRender,previewURLs,saveState} from '@/lib/pipeline/publication';
import {createImageTask,imageTaskStatus,downloadImage} from '@/lib/pipeline/kie-images';
import {reviewRaster} from '@/lib/pipeline/vision';
import {candidates} from '@/lib/ai/catalog';
import {createProvider} from '@/lib/ai/provider';
import type {PipelineState} from '@/lib/pipeline/types';
const eventData=z.object({bookId:z.string().uuid(),revision:z.number().int().nonnegative()});
export const produceBook=inngest.createFunction(
 {id:'produce-book',retries:0,concurrency:{limit:1},onFailure:async({event})=>{
  const data=eventData.safeParse(event.data.event.data);if(!data.success)return;
  await database().bookJob.updateMany({where:{id:data.data.bookId,revision:data.data.revision,status:{in:['queued','running','awaiting-images']}},data:{status:'failed',error:'BACKGROUND_EXECUTION_FAILED'}});
 }},
 {event:'ruskicode/book.requested'},
 async({event,step})=>{
  const input=eventData.parse(event.data);
  // Only compact control results leave a step; manuscripts and binary files stay in Postgres.
  for(let unit=0;unit<500;unit++){
   const result=await step.run(`advance-${unit}`,async()=>{
    const row=await database().bookJob.findUniqueOrThrow({where:{id:input.bookId}});
    if(row.revision!==input.revision||row.status==='complete')return 'complete';
    const state=row.state as unknown as PipelineState;
    const config=candidates(state.input.model,'book')[0];
    if(!config)throw new NonRetriableError('MODEL_NOT_CONFIGURED');
    try{
     return await advancePipeline(state,{
      incremental:true,provider:createProvider(config),
      checkpoint:(s,status)=>saveState(row.id,input.revision,s,status),
      createImage:createImageTask,imageStatus:imageTaskStatus,downloadImage,
      render:(spec,chapters,assets)=>renderBook(spec,chapters,assets,{maxPages:30}),
      cachedRender:()=>readPublishedRender(row.id),
      publish:async result=>state.stage==='qa'?previewURLs(row.id):publishBook(row.id,state,result),
      review:async(spec,url,page)=>(await reviewRaster(spec,url,page)).map(issue=>({...issue,page})),
     });
    }catch(error){
     const code=error instanceof Error?error.message:'PIPELINE_FAILED';
     await database().bookJob.updateMany({where:{id:row.id,revision:input.revision},data:{status:'failed',error:code.slice(0,200)}});
     // No automatic replay of potentially billable AI requests after an uncertain failure.
     throw new NonRetriableError(code);
    }
   });
   if(result==='paused'||result==='complete')return {status:result};
   if(result==='retry-later')await step.sleep(`image-wait-${unit}`,'15s');
  }
  throw new NonRetriableError('PIPELINE_STEP_LIMIT');
 }
);
