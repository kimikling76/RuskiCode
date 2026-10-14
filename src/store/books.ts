"use client";
import {create} from 'zustand';
import {bookSpecSchema,type BookSpec} from '@/lib/books/spec';
type State={specs:Record<string,BookSpec>;hydrated:boolean;hydrate:()=>void;save:(id:string,spec:BookSpec)=>boolean};
const key='ruskicode-book-specs-v1';
export const useBooks=create<State>((set,get)=>({specs:{},hydrated:false,hydrate:()=>{try{const raw=JSON.parse(localStorage.getItem(key)||'{}');const specs:Record<string,BookSpec>={};if(raw&&typeof raw==='object'&&!Array.isArray(raw))for(const [id,value]of Object.entries(raw).slice(0,30)){const p=bookSpecSchema.safeParse(value);if(p.success)specs[id]=p.data;}set({specs,hydrated:true});}catch{set({hydrated:true});}},save:(id,spec)=>{const valid=bookSpecSchema.safeParse(spec);if(!valid.success)return false;const specs={...get().specs,[id]:valid.data};try{localStorage.setItem(key,JSON.stringify(specs));set({specs});return true;}catch{return false;}}}));
