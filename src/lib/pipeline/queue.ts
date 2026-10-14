import {inngest,inngestConfigured} from '@/lib/inngest/client';
import {Queue} from 'bullmq';
import IORedis from 'ioredis';
let queue:Queue|undefined;let producer:IORedis|undefined;
export function bookQueue(){if(!process.env.REDIS_URL)throw Error('QUEUE_NOT_CONFIGURED');if(!queue){producer=new IORedis(process.env.REDIS_URL,{maxRetriesPerRequest:1,connectTimeout:5000,retryStrategy:()=>null});producer.on('error',()=>{});queue=new Queue('ruskicode-books',{connection:producer});}return queue;}
export async function enqueueBook(id:string,revision:number){if(process.env.BOOK_EXECUTOR==='inngest'){if(!inngestConfigured())throw Error('INNGEST_NOT_CONFIGURED');return inngest.send({id:`book-${id}-${revision}`,name:'ruskicode/book.requested',data:{bookId:id,revision}});}return bookQueue().add('advance',{bookId:id,revision},{jobId:`${id}-${revision}`,attempts:1,removeOnComplete:{count:100},removeOnFail:{count:100}});}

export function pipelineConfigured(){return Boolean(process.env.DATABASE_URL&&(process.env.BOOK_EXECUTOR==='inngest'?inngestConfigured():process.env.REDIS_URL));}
export async function workerOnline(){if(process.env.BOOK_EXECUTOR==='inngest')return inngestConfigured();try{return Boolean(await (bookQueue(),producer!).get('ruskicode:worker-online'));}catch{return false;}}
