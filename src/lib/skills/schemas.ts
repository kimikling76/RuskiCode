import {z} from 'zod';
import {designTokensSchema} from '@/lib/books/spec';
const text=z.string().min(1).max(8000);
const blockSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('heading'),id:z.string().min(1).max(100),text,level:z.number().int().min(1).max(3)}).strict(),
 z.object({type:z.literal('paragraph'),id:z.string().min(1).max(100),text}).strict(),
 z.object({type:z.literal('exercise'),id:z.string().min(1).max(100),instruction:text,items:z.array(text).min(1).max(30),audioId:z.string().max(30).optional()}).strict(),
 z.object({type:z.literal('image'),id:z.string().min(1).max(100),prompt:text,alt:text,assetId:z.string().max(200).optional()}).strict(),
 z.object({type:z.literal('callout'),id:z.string().min(1).max(100),text}).strict(),
 z.object({type:z.literal('table'),id:z.string().min(1).max(100),headers:z.array(text).min(1).max(6),rows:z.array(z.array(text).min(1).max(6)).min(1).max(30)}).strict()
]);
export const outputSchemas={
 outline:z.object({title:text,chapters:z.array(z.object({id:z.string().min(1).max(100),title:text,objective:text,sections:z.array(text).min(1).max(30),estimatedPages:z.number().int().min(1).max(100)}).strict()).min(1).max(100),questions:z.array(text).max(10)}).strict(),
 chapter:z.object({title:text,summary:text,blocks:z.array(blockSchema).min(1).max(100)}).strict(),
 layout:z.object({designTokens:designTokensSchema,pages:z.array(z.object({number:z.number().int().min(1).max(500),title:text,blocks:z.array(blockSchema).min(1).max(30)}).strict()).min(1).max(100)}).strict(),
 imagePlan:z.object({prompts:z.array(z.object({id:z.string().min(1).max(100),prompt:text,alt:text,requiredReferences:z.array(text).max(20)}).strict()).min(1).max(30),warnings:z.array(text).max(20)}).strict(),
 coverPlan:z.object({title:text,subtitle:z.string().max(300),author:z.string().max(200),imagePrompt:text,requiredReferences:z.array(text).max(20),notes:z.array(text).max(20)}).strict(),
 renderPlan:z.object({format:z.enum(['A4','A5','6x9in']),checks:z.array(text).min(1).max(40),warnings:z.array(text).max(20),readyForRender:z.boolean()}).strict(),
 review:z.object({issues:z.array(z.object({severity:z.enum(['info','warning','error']),location:text,problem:text,suggestion:text}).strict()).max(60),summary:text}).strict()
};
export type OutputId=keyof typeof outputSchemas;
export const skillIds=['book-planner','chapter-writer','layout-designer','image-illustrator','cover-designer','typesetter-pdf','qa-reviewer'] as const;
export type SkillId=typeof skillIds[number];
export const manifestSchema=z.object({name:z.enum(skillIds),version:z.string().regex(/^\d+\.\d+\.\d+$/),description:text,output:z.enum(['outline','chapter','layout','imagePlan','coverPlan','renderPlan','review']),mode:z.literal('structured-json'),requiredTools:z.array(z.string().max(100)).max(20),inputSchema:z.literal('BookSpecAndBrief'),outputSchema:z.string().min(1).max(100)}).strict();
