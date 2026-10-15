import {Prisma} from '@prisma/client';
import {database} from './database';
import {signedArtifactUrl} from './artifacts';
import type {PipelineState} from './types';
import type {RenderResult} from './render';
export async function publishBook(bookId:string,state:PipelineState,result:RenderResult){
 const db=database();
 const items=[{name:'book.pdf',mime:'application/pdf',data:result.pdf},{name:'project.json',mime:'application/json',data:Buffer.from(JSON.stringify({spec:state.input.spec,chapters:state.chapters,assets:state.assets,layout:result.layout}))},{name:'render-meta.json',mime:'application/json',data:Buffer.from(JSON.stringify({layout:result.layout,issues:result.issues,pageCount:result.pageCount}))},...result.previews.map((p,i)=>({name:`page-${i+1}.jpg`,mime:'image/jpeg',data:p.data}))];
 await db.$transaction(async tx=>{
  for(const item of items)await tx.bookArtifact.upsert({where:{bookId_name:{bookId,name:item.name}},create:{bookId,...item,data:new Uint8Array(item.data)},update:{data:new Uint8Array(item.data),mime:item.mime}});
  await tx.bookArtifact.deleteMany({where:{bookId,name:{startsWith:'page-',notIn:result.previews.map((_,i)=>`page-${i+1}.jpg`)}}});
 },{timeout:60000});
 return previewURLs(bookId);
}
export async function previewURLs(bookId:string){const rows=await database().bookArtifact.findMany({where:{bookId,mime:'image/jpeg'},select:{id:true,name:true}});rows.sort((a,b)=>Number(a.name.match(/\d+/)?.[0])-Number(b.name.match(/\d+/)?.[0]));return rows.map(r=>signedArtifactUrl(bookId,r.id));}
export async function readPublishedRender(bookId:string):Promise<RenderResult>{
 const rows=await database().bookArtifact.findMany({where:{bookId}});
 const meta=rows.find(r=>r.name==='render-meta.json');const pdf=rows.find(r=>r.name==='book.pdf');
 if(!meta||!pdf)throw Error('RENDER_CHECKPOINT_MISSING');
 const parsed=JSON.parse(Buffer.from(meta.data).toString('utf8')) as Pick<RenderResult,'layout'|'issues'|'pageCount'>;
 const previews=rows.filter(r=>r.mime==='image/jpeg').sort((a,b)=>Number(a.name.match(/\d+/)?.[0])-Number(b.name.match(/\d+/)?.[0])).map(r=>({name:r.name,data:Buffer.from(r.data)}));
 return {...parsed,pdf:Buffer.from(pdf.data),html:'',previews};
}
export async function saveState(id:string,revision:number,state:PipelineState,status:string){const updated=await database().bookJob.updateMany({where:{id,revision},data:{state:JSON.parse(JSON.stringify(state)) as Prisma.InputJsonValue,status,error:null}});if(!updated.count)throw Error('STALE_REVISION');}
