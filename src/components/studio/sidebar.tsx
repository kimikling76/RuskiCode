'use client';
import Link from 'next/link';
import * as Dialog from '@radix-ui/react-dialog';
import {ChevronDown,Plus,FolderOpen,Zap,Plug,MoreHorizontal,MessageSquare,ImageIcon,Film,SlidersHorizontal,Clapperboard,LayoutGrid,ArrowUpRight,X,Menu,Check,BookOpen} from 'lucide-react';
import {useState} from 'react';
import {StudioMark} from './brand';
import {SignOut} from '@/components/sign-out';
import type {Project} from '@/store/projects';
export type StudioView='home'|'image'|'video'|'edit'|'director'|'projects'|'gallery'|'skills'|'connectors';
export const studioViews:{id:StudioView;label:string;icon:typeof ImageIcon;stage?:string}[]=[
 {id:'home',label:'Inicio / Chat',icon:MessageSquare},
 {id:'image',label:'Imagen',icon:ImageIcon,stage:'c'},
 {id:'video',label:'Video',icon:Film,stage:'d'},
 {id:'edit',label:'Editar',icon:SlidersHorizontal,stage:'e'},
 {id:'director',label:'Dirigir',icon:Clapperboard,stage:'e'},
 {id:'gallery',label:'Galería / Assets',icon:LayoutGrid,stage:'c'},
];
type Props={view:StudioView;onNavigate:(view:StudioView)=>void;projects:Project[];activeId:string|null;onProject:(id:string)=>void;onNew:()=>void;hydrated:boolean};
function EmptyChats(){return <div className="studio-empty-chats"><div className="studio-empty-art" aria-hidden="true"><span/><span/><MessageSquare size={26}/><i><Plus size={12}/></i></div><strong>Aún no hay chats</strong><p>Tu próxima idea empieza acá.</p></div>;}
export function StudioSidebar(props:Props){
 const [mobile,setMobile]=useState(false);const [more,setMore]=useState(true);const [space,setSpace]=useState(false);
 function navigate(view:StudioView){props.onNavigate(view);setMobile(false);}
 const content=<>
  <div className="studio-sidebar-brand"><button className="studio-space-button" aria-expanded={space} onClick={()=>setSpace(!space)}><StudioMark/><span>estudio<span>Espacio del equipo</span></span><ChevronDown size={14}/></button><button className="studio-mobile-close studio-icon-button" aria-label="Cerrar menú" onClick={()=>setMobile(false)}><X size={19}/></button></div>
  {space?<div className="studio-space-menu"><Check size={14}/><div>Equipo RuskiCode<small>Un espacio compartido</small></div></div>:null}
  <button className="studio-new-chat" onClick={()=>{props.onNew();setMobile(false);}}><Plus size={18}/><span>Nuevo chat</span><span className="studio-key-hint">＋</span></button>
  <nav aria-label="Navegación del estudio" className="studio-nav">
   {([{id:'projects',label:'Proyectos',icon:FolderOpen},{id:'skills',label:'Skills',icon:Zap},{id:'connectors',label:'Conectores',icon:Plug}] as const).map(({id,label,icon:Icon})=><button key={id} onClick={()=>navigate(id)} aria-current={props.view===id?'page':undefined}><Icon size={17}/><span>{label}</span>{id==='projects'&&props.projects.length?<small>{props.projects.length}</small>:null}</button>)}
   <button onClick={()=>setMore(!more)} aria-expanded={more}><MoreHorizontal size={17}/><span>{more?'Ver menos':'Ver más'}</span><ChevronDown size={13} className={more?'studio-rotate':''}/></button>
   {more?<div className="studio-tools-nav">{studioViews.map(({id,label,icon:Icon})=><button key={id} aria-current={props.view===id&&!props.activeId?'page':undefined} onClick={()=>navigate(id)}><Icon size={16}/><span>{label}</span>{id==='image'||id==='video'?<span className="studio-nav-dot"/>:null}</button>)}</div>:null}
  </nav>
  <div className="studio-history"><div className="studio-history-heading"><span>Chats recientes</span><span>{props.projects.length||'—'}</span></div>{!props.hydrated?<div className="studio-history-loading" role="status" aria-label="Cargando historial"><div className="studio-shimmer"/><div className="studio-shimmer"/><div className="studio-shimmer"/></div>:props.projects.length?props.projects.slice(0,12).map(p=><button className={`studio-history-item ${props.activeId===p.id?'is-active':''}`} key={p.id} onClick={()=>{props.onProject(p.id);setMobile(false);}} title={p.brief}><MessageSquare size={14}/><span>{p.brief}</span></button>):<EmptyChats/>}</div>
  <div className="studio-sidebar-bottom"><Link href="/workspace/editor" className="studio-book-link"><BookOpen size={16}/><span>Editor de Русский код</span><ArrowUpRight size={14}/></Link><div className="studio-member"><span className="studio-avatar">E<span/></span><div><strong>Equipo RuskiCode</strong><small>Espacio privado</small></div><span className="studio-private-dot"/></div><SignOut/></div>
 </>;
 return <><aside className="studio-sidebar">{content}</aside><Dialog.Root open={mobile} onOpenChange={setMobile}><Dialog.Trigger asChild><button className="studio-menu-trigger studio-icon-button" aria-label="Abrir navegación"><Menu size={20}/></button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="studio-drawer-overlay"/><Dialog.Content className="studio-sidebar studio-drawer"><Dialog.Title className="sr-only">Navegación de Estudio</Dialog.Title><Dialog.Description className="sr-only">Herramientas creativas y chats recientes del equipo.</Dialog.Description>{content}</Dialog.Content></Dialog.Portal></Dialog.Root></>;
}
