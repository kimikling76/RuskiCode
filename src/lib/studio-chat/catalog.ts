import {unstable_cache} from 'next/cache';
import {creditConfig} from './config';
export type ChatModel={id:string;name:string;provider:string;context:number;maxOutput:number|null;inputPrice:number|null;outputPrice:number|null;requestPrice:number|null;chat:boolean};
function price(value:unknown,otherwise:number|null=null){if(typeof value!=='string'&&typeof value!=='number')return otherwise;const n=Number(value);return Number.isFinite(n)&&n>=0?n:null;}
export function parseModels(raw:unknown):ChatModel[]{
 if(!raw||typeof raw!=='object'||!Array.isArray((raw as {data:unknown}).data))throw Error('CATALOG_UNAVAILABLE');
 return (raw as {data:Record<string,any>[]}).data.filter(m=>typeof m.id==='string'&&typeof m.name==='string').map(m=>({id:m.id,name:m.name,provider:m.id.split('/')[0],context:Number(m.context_length)||0,maxOutput:Number(m.top_provider?.max_completion_tokens)||null,inputPrice:price(m.pricing?.prompt),outputPrice:price(m.pricing?.completion),requestPrice:price(m.pricing?.request,0),chat:Array.isArray(m.architecture?.input_modalities)&&m.architecture.input_modalities.includes('text')&&Array.isArray(m.architecture?.output_modalities)&&m.architecture.output_modalities.length===1&&m.architecture.output_modalities[0]==='text'}));
}
export const getChatModels=unstable_cache(async()=>{
 const r=await fetch('https://openrouter.ai/api/v1/models',{signal:AbortSignal.timeout(15000),cache:'no-store'});if(!r.ok)throw Error('CATALOG_UNAVAILABLE');const models=parseModels(await r.json());if(!models.length)throw Error('CATALOG_UNAVAILABLE');return models;
},['studio-openrouter-models-v1'],{revalidate:creditConfig.catalogCacheSeconds});
