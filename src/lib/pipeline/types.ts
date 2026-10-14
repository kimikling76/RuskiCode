import {z} from 'zod';
import {bookSpecSchema} from '@/lib/books/spec';
import {outputSchemas} from '@/lib/skills/schemas';
export type Block=z.infer<typeof outputSchemas.chapter>['blocks'][number];
export type Chapter=z.infer<typeof outputSchemas.chapter>;
export type Layout=z.infer<typeof outputSchemas.layout>;
export const stageNames=['outline','design','content','assets','render','qa','complete'] as const;
export type Stage=typeof stageNames[number];
export const pipelineInputSchema=z.object({projectId:z.string().min(1).max(100),spec:bookSpecSchema,brief:z.string().min(1).max(20000),model:z.string().max(60),locale:z.enum(['es','ru','en']),autoApproveOutline:z.boolean().default(false),generateImages:z.boolean().default(false),visualQA:z.boolean().default(true)}).strict().refine(v=>v.spec.estimatedChapters<=12&&v.spec.estimatedPages<=120,{message:'Initial pipeline supports up to 12 chapters and 120 estimated pages'});
export type PipelineInput=z.infer<typeof pipelineInputSchema>;
export type QAReport={layoutIssues:{page:number;code:string}[];visualIssues:{page:number;severity:'info'|'warning'|'error';problem:string;suggestion:string}[];visualPerformed:boolean;visualReviewedPages:number;fingerprint:string;pageCount:number;iteration:number};
export type PipelineState={input:PipelineInput;stage:Stage;outline?:z.infer<typeof outputSchemas.outline>;outlineApproved:boolean;chapters:Chapter[];assets:Record<string,string>;imageTasks:Record<string,string>;imagePolls:Record<string,number>;layout?:Layout;qa?:QAReport;iteration:number;warnings:string[];usage:{inputTokens:number;outputTokens:number;credits:number|null}};
export function initialState(input:PipelineInput):PipelineState{return {input:pipelineInputSchema.parse(input),stage:'outline',outlineApproved:false,chapters:[],assets:{},imageTasks:{},imagePolls:{},iteration:0,warnings:['Reported token/credit totals cover text-generation calls only; image and visual-review charges are not aggregated.'],usage:{inputTokens:0,outputTokens:0,credits:null}};}
