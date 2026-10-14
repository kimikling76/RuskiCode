import {Queue} from 'bullmq';
import IORedis from 'ioredis';
let queue:Queue|undefined;let producer:IORedis|undefined;
export function bookQueue(){if(!process.env.REDIS_URL)throw Error('QUEUE_NOT_CONFIGURED');if(!queue){producer=new IORedis(process.env.REDIS_URL,{maxRetriesPerRequest:1,connectTimeout:5000,retryStrategy:()=>null});producer.on('error',()=>{});queue=new Queue('ruskicode-books',{connection:producer});}return queue;}
export async function enqueueBook(id:string,revision:number){return bookQueue().add('advance',{bookId:id},{jobId:`${id}-${revision}`,attempts:1,removeOnComplete:{count:100},removeOnFail:{count:100}});}

export async function workerOnline(){try{return Boolean(await (bookQueue(),producer!).get('ruskicode:worker-online'));}catch{return false;}}
