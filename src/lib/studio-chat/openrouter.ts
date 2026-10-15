import {sseData} from '@/lib/ai/sse';
export async function* routerEvents(body:ReadableStream<Uint8Array>){
 for await(const frame of sseData(body)){
  if(frame==='[DONE]'){yield {type:'done' as const};return;}
  const data=JSON.parse(frame);
  if(typeof data.id==='string')yield {type:'generation' as const,id:data.id,model:typeof data.model==='string'?data.model:undefined};
  // Preserve billing information even if the same frame reports a generation error.
  if(data.usage)yield {type:'usage' as const,usage:data.usage as {cost?:number;prompt_tokens?:number;completion_tokens?:number}};
  if(data.error||data.choices?.some((c:{error?:unknown})=>c.error))throw Error('PROVIDER_UNAVAILABLE');
  const text=data.choices?.[0]?.delta?.content;if(typeof text==='string'&&text)yield {type:'delta' as const,text};
 }
}
