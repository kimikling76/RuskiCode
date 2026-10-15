import {Inngest} from 'inngest';
export const inngest=new Inngest({id:'ruskicode-studio'});
export function inngestConfigured(){return Boolean(process.env.INNGEST_EVENT_KEY&&process.env.INNGEST_SIGNING_KEY);}
