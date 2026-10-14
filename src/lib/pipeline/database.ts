import {PrismaClient} from '@prisma/client';
let client:PrismaClient|undefined;
export function database(){if(!process.env.DATABASE_URL)throw Error('DATABASE_NOT_CONFIGURED');return client??=new PrismaClient();}
