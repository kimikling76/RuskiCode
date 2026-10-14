import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {defaultBookSpec} from '../src/lib/books/spec';
import {renderBook} from '../src/lib/pipeline/render';
async function main(){const spec={...defaultBookSpec(),pageFormat:'A5' as const,bleedMm:3,subtitle:'Проверка переноса текста'};const result=await renderBook(spec,[{title:'Длинный текст',summary:'Render verification only',blocks:[{type:'heading',id:'heading',text:'Читаем',level:1},{type:'paragraph',id:'long',text:Array.from({length:700},()=> 'Это школа. Это Миша. Миша — ученик.').join(' ')}]}],{}, {rasterize:false});assert.equal(result.issues.filter(i=>i.code==='OVERFLOW').length,0);assert.ok(result.pageCount>3);const pdf=await PDFDocument.load(result.pdf);const page=pdf.getPage(0);const trim=page.getTrimBox();assert.ok(Math.abs(trim.width-148*72/25.4)<1);assert.ok(page.getWidth()>trim.width);assert.equal(result.layout.pages.flatMap(p=>p.blocks).filter(b=>b.type==='paragraph').length,result.pageCount-2);console.log(JSON.stringify({longTextPages:result.pageCount,issues:result.issues,bleedVerified:true}));}
main().catch(e=>{console.error(e);process.exitCode=1;});
