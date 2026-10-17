/** An image sent with a message: its bytes (base64) and, when the API only takes links, a temporary https URL. */
export type ImageInput={mime:string;data:string;url?:string};
export type Message={role:'user'|'assistant';content:string;images?:ImageInput[]};
export type Usage={inputTokens?:number;outputTokens?:number;credits?:number};
export type StreamEvent={type:'delta';text:string}|{type:'usage';usage:Usage};
export type GenerateInput={messages:Message[];system:string;signal:AbortSignal};
export interface ModelProvider{id:string;name:string;capabilities:string[];supportsTools:boolean;supportsVision:boolean;costPerToken:number|null;generate(input:GenerateInput):Promise<{text:string;usage:Usage}>;stream(input:GenerateInput):AsyncGenerator<StreamEvent>;}
