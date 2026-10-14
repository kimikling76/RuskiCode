export type Message={role:'user'|'assistant';content:string};
export type Usage={inputTokens?:number;outputTokens?:number;credits?:number};
export type StreamEvent={type:'delta';text:string}|{type:'usage';usage:Usage};
export type GenerateInput={messages:Message[];system:string;signal:AbortSignal};
export interface ModelProvider{id:string;name:string;capabilities:string[];supportsTools:boolean;supportsVision:boolean;costPerToken:number|null;generate(input:GenerateInput):Promise<{text:string;usage:Usage}>;stream(input:GenerateInput):AsyncGenerator<StreamEvent>;}
