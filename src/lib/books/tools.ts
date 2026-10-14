import {z} from 'zod';
import {bookSpecSchema,designTokensSchema,type BookSpec} from './spec';
import {outputSchemas} from '@/lib/skills/schemas';
export function bookTools(context:{spec:BookSpec;outline?:z.infer<typeof outputSchemas.outline>}){return {
read_book_spec:{description:'Read the current validated Book Spec',inputSchema:z.object({}).strict(),execute:()=>bookSpecSchema.parse(context.spec)},
update_book_spec:{description:'Replace the Book Spec after author approval',inputSchema:z.object({spec:bookSpecSchema,authorApproved:z.literal(true)}).strict(),execute:(value:unknown)=>{const input=z.object({spec:bookSpecSchema,authorApproved:z.literal(true)}).parse(value);context.spec=input.spec;return context.spec;}},
create_outline:{description:'Set a validated outline',inputSchema:outputSchemas.outline,execute:(value:unknown)=>{context.outline=outputSchemas.outline.parse(value);return context.outline;}},
set_design_tokens:{description:'Set validated book design tokens',inputSchema:designTokensSchema,execute:(value:unknown)=>{context.spec=bookSpecSchema.parse({...context.spec,designTokens:designTokensSchema.parse(value)});return context.spec.designTokens;}}
};}
