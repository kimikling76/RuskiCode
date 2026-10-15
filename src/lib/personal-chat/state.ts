export const STORAGE_KEY='estudio-personal-v2';
export const LEGACY_KEY='estudio-pure-chat-v1';
export const UNDO_MS=8000;
export const PERSONAL_SYSTEM='Eres un asistente útil; responde en el idioma del usuario.';
export type PersonalMessage={id:string;role:'user'|'assistant';content:string;createdAt?:string;model?:string;credits?:number;status?:'streaming'|'done'|'error';errorCode?:string};
export type ConversionLink={projectId:string;name:string;destination:'pdf'|'cinema'};
export type PersonalChat={id:string;title:string;model:string;createdAt:string;titleEdited?:boolean;messages:PersonalMessage[];conversions:ConversionLink[]};
export type ConversionDraft={name:string;destination:'pdf'|'cinema';projectType:string;mode:'all'|'summary'|'selected';selectedIds:string[];brief:string;summary:string};
export type StudioProject={id:string;name:string;destination:'pdf'|'cinema';projectType:string;brief:string;sourceChatId:string;sourceMode:string;source:{summary?:string;messages?:PersonalMessage[]};createdAt:string};
export type PersonalData={version:2;chats:PersonalChat[];projects:StudioProject[];pending:{id:string;chat:PersonalChat;index:number;deadline:number}[];usage:{id:string;credits?:number}[]};
export function emptyData():PersonalData{return {version:2,chats:[],projects:[],pending:[],usage:[]};}
export function purgeExpired(data:PersonalData,now:number):PersonalData{return {...data,pending:data.pending.filter(p=>p.deadline>now)};}
export function scheduleDelete(data:PersonalData,id:string,now:number):PersonalData{const chat=data.chats.find(c=>c.id===id);if(!chat)return data;return {...data,chats:data.chats.filter(c=>c.id!==id),pending:[...data.pending,{id,chat:{...chat,messages:chat.messages.map(m=>({...m,status:m.status==='streaming'?'error':m.status}))},index:data.chats.findIndex(c=>c.id===id),deadline:now+UNDO_MS}]};}
export function undoDelete(data:PersonalData,id:string,now:number):PersonalData{const pending=data.pending.find(p=>p.id===id&&p.deadline>now);if(!pending)return purgeExpired(data,now);const chats=[...data.chats];chats.splice(Math.min(pending.index,chats.length),0,pending.chat);return {...data,chats,pending:data.pending.filter(p=>p.id!==id)};}
export function deleteAllChats(data:PersonalData):PersonalData{return {...data,chats:[],pending:[]};}
export function deleteMessage(data:PersonalData,chatId:string,messageId:string):PersonalData{return {...data,chats:data.chats.map(c=>{if(c.id!==chatId)return c;const messages=c.messages.filter(m=>m.id!==messageId);const wasTitleSource=!c.titleEdited&&c.messages.find(m=>m.role==='user')?.id===messageId;const title=wasTitleSource?(messages.find(m=>m.role==='user')?.content.trim().replace(/\s+/g,' ').slice(0,65)||'Conversación sin título'):c.title;return {...c,messages,title};})};}
export function sourceMessages(messages:PersonalMessage[],mode:string,ids:string[]){const selected=mode==='selected'?messages.filter(m=>ids.includes(m.id)):messages;if(!selected.length)throw Error('Seleccioná al menos un mensaje.');return selected.map(({id,role,content})=>({id,role,content}));}
export function confirmConversion(data:PersonalData,chatId:string,draft:ConversionDraft,projectId:string,createdAt:string):PersonalData{
 const chat=data.chats.find(c=>c.id===chatId);if(!chat)throw Error('El chat ya no existe.');if(!draft.name.trim()||!draft.brief.trim())throw Error('Completá el nombre y el brief.');
 const types=draft.destination==='pdf'?['libro','documento','presentacion']:draft.destination==='cinema'?['imagen','video']:[];if(!types.includes(draft.projectType))throw Error('Tipo de proyecto inválido.');
 const source=sourceMessages(chat.messages,draft.mode,draft.selectedIds);if(draft.mode==='summary'&&!draft.summary.trim())throw Error('Falta el resumen revisado.');
 const project:StudioProject={id:projectId,name:draft.name.trim(),destination:draft.destination,projectType:draft.projectType,brief:draft.brief.trim(),sourceChatId:chatId,sourceMode:draft.mode,source:draft.mode==='summary'?{summary:draft.summary.trim()}:{messages:source},createdAt};
 const link:ConversionLink={projectId,name:project.name,destination:project.destination};return {...data,projects:[project,...data.projects],chats:data.chats.map(c=>c.id===chatId?{...c,conversions:[...c.conversions,link]}:c)};
}
