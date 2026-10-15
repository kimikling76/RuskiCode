import path from 'node:path';
import {createRequire} from 'node:module';
import type {RenderResult} from './render';
// Render the actual PDF bytes, rather than screenshots of the source HTML.
export async function rasterizePDF(pdf:Buffer):Promise<RenderResult['previews']>{
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const require=createRequire(import.meta.url);
 const packageRoot=path.dirname(require.resolve('pdfjs-dist/package.json'));
 const task=getDocument({data:new Uint8Array(pdf),useSystemFonts:false,standardFontDataUrl:path.join(packageRoot,'standard_fonts')+path.sep,wasmUrl:path.join(packageRoot,'wasm')+path.sep});
 try{
  const document=await task.promise;const previews:RenderResult['previews']=[];
  for(let i=1;i<=document.numPages;i++){
   const page=await document.getPage(i);const viewport=page.getViewport({scale:95/72});
   const factory=document.canvasFactory as {create:(width:number,height:number)=>{canvas:HTMLCanvasElement & {toBuffer:(mime:string)=>Buffer};context:CanvasRenderingContext2D};destroy:(target:{canvas:HTMLCanvasElement;context:CanvasRenderingContext2D})=>void};
   const target=factory.create(Math.ceil(viewport.width),Math.ceil(viewport.height));
   await page.render({canvasContext:target.context,viewport,canvas:target.canvas}).promise;
   previews.push({name:`page-${i}.jpg`,data:target.canvas.toBuffer('image/jpeg')});
   factory.destroy(target);page.cleanup();
  }
  return previews;
 }finally{await task.destroy();}
}
