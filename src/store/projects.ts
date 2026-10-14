"use client";
import { create } from 'zustand';
export type Attachment = {name:string;size:number;type:string};
export type Project = {id:string;brief:string;model:string;category:number;ask:boolean;url:string;attachments:Attachment[];createdAt:string;status:'review'|'ready'};
type Store={projects:Project[];activeId:string|null;hydrated:boolean;hydrate:()=>void;save:(project:Project)=>boolean;select:(id:string|null)=>void};
const key='ruskicode-projects-v1';
function valid(value:unknown):value is Project {if(!value||typeof value!=='object')return false;const p=value as Project;return typeof p.id==='string'&&typeof p.brief==='string'&&typeof p.model==='string'&&Number.isInteger(p.category)&&p.category>=0&&p.category<4&&typeof p.ask==='boolean'&&typeof p.url==='string'&&typeof p.createdAt==='string'&&(p.status==='review'||p.status==='ready')&&Array.isArray(p.attachments)&&p.attachments.every(a=>typeof a.name==='string'&&typeof a.size==='number'&&typeof a.type==='string');}
export const useProjects=create<Store>((set,get)=>({projects:[],activeId:null,hydrated:false,hydrate:()=>{try{const value:unknown=JSON.parse(localStorage.getItem(key)||'[]');set({projects:Array.isArray(value)?value.filter(valid).slice(0,30):[],hydrated:true});}catch{set({hydrated:true});}},save:p=>{const projects=[p,...get().projects.filter(x=>x.id!==p.id)].slice(0,30);try{localStorage.setItem(key,JSON.stringify(projects));set({projects,activeId:p.id});return true;}catch{return false;}},select:activeId=>set({activeId})}));
