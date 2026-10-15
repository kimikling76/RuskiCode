'use client';
import {useEffect,useRef,useState} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {create} from 'zustand';
import {usePersonal} from '@/store/personal-chat';
import {X} from 'lucide-react';
import {ConfirmDialog} from '@/components/ui/studio-controls';
type DialogState={renameId:string|null;deleteId:string|null;settings:boolean;openRename:(id:string)=>void;openDelete:(id:string)=>void;openSettings:()=>void;close:()=>void};
export const useChatDialogs=create<DialogState>(set=>({renameId:null,deleteId:null,settings:false,openRename:id=>set({renameId:id}),openDelete:id=>set({deleteId:id}),openSettings:()=>set({settings:true}),close:()=>set({renameId:null,deleteId:null,settings:false})}));
export function PersonalModal({open,onClose,title,description,children}: {open:boolean;onClose:()=>void;title:string;description:string;children:React.ReactNode}) {
 const returnFocus=useRef<HTMLElement|null>(null);
 const content=useRef<HTMLDivElement>(null);
 return <Dialog.Root open={open} onOpenChange={value=>{if(!value)onClose();}}>
  <Dialog.Portal>
   <Dialog.Overlay className="studio-modal-overlay"/>
   <Dialog.Content ref={content} className="studio-modal personal-modal"
    onOpenAutoFocus={event=>{
     returnFocus.current=document.activeElement as HTMLElement;
     const input=content.current?.querySelector<HTMLInputElement>('[data-dialog-autofocus]');
     if(input){event.preventDefault();input.focus();input.select();}
    }}
    onCloseAutoFocus={event=>{
     event.preventDefault();
     if(returnFocus.current?.isConnected)returnFocus.current.focus();
     else document.querySelector<HTMLButtonElement>('.chat-header-actions button, .studio-new-chat')?.focus();
    }}>
    <Dialog.Title>{title}</Dialog.Title>
    <Dialog.Description>{description}</Dialog.Description>
    <Dialog.Close asChild><button className="studio-icon-button studio-modal-close" aria-label="Cerrar"><X size={18}/></button></Dialog.Close>
    {children}
   </Dialog.Content>
  </Dialog.Portal>
 </Dialog.Root>;
}
export function ChatDialogs({onChat}:{onChat:()=>void}){
 const d=useChatDialogs();const data=usePersonal(s=>s.data);const error=usePersonal(s=>s.error);const rename=usePersonal(s=>s.rename);const remove=usePersonal(s=>s.remove);const undo=usePersonal(s=>s.undo);const clear=usePersonal(s=>s.clear);const [title,setTitle]=useState('');const [step,setStep]=useState(0);const [confirmation,setConfirmation]=useState('');const [now,setNow]=useState(Date.now());
 useEffect(()=>{setTitle(data.chats.find(c=>c.id===d.renameId)?.title||'');},[d.renameId]);useEffect(()=>{if(!d.settings){setStep(0);setConfirmation('');}},[d.settings]);useEffect(()=>{if(!data.pending.length)return;setNow(Date.now());const t=setInterval(()=>setNow(Date.now()),250);return()=>clearInterval(t);},[data.pending.length]);
 return <><PersonalModal open={Boolean(d.renameId)} onClose={d.close} title="Renombrar chat" description="El título no cambia el contenido ni crea un proyecto."><form onSubmit={e=>{e.preventDefault();if(d.renameId&&rename(d.renameId,title))d.close();}}><label>Nombre del chat<input data-dialog-autofocus maxLength={100} required value={title} onChange={e=>setTitle(e.target.value)}/></label><button className="studio-primary" disabled={!title.trim()}>Guardar nombre</button></form></PersonalModal>
 <ConfirmDialog open={Boolean(d.deleteId)} onClose={d.close} title="¿Borramos este chat?" description="Lo quitamos de este navegador y tenés 8 segundos para deshacer. Los proyectos que creaste a partir de él se conservan." confirmLabel="Borrar chat" onConfirm={()=>{if(!d.deleteId)return false;return remove(d.deleteId);}}/>
 <PersonalModal open={d.settings} onClose={d.close} title="Ajustes del Chat" description="Los chats personales se guardan solo en este navegador. No se sincronizan entre tu compañero y vos.">{step===0?<><p className="studio-footnote">La solución simple para sincronizarlos es guardarlos en el Postgres existente, asociados a la cuenta compartida. Esa migración no está activada en esta entrega.</p><button className="personal-danger" disabled={!data.chats.length&&!data.pending.length} onClick={()=>setStep(1)}>Borrar todos los chats</button></>:step===1?<><p>Primera confirmación: se borrarán todos los chats personales y sus mensajes. Los proyectos convertidos y el consumo se conservan.</p><div className="personal-dialog-actions"><button className="studio-text-button" onClick={()=>setStep(0)}>Cancelar</button><button className="personal-danger" onClick={()=>setStep(2)}>Continuar al borrado definitivo</button></div></>:<><p>Segunda confirmación: esta acción no tiene Deshacer. Escribí BORRAR.</p><input autoFocus aria-label="Escribir BORRAR para confirmar" value={confirmation} onChange={e=>setConfirmation(e.target.value)}/><div className="personal-dialog-actions"><button className="studio-text-button" onClick={()=>setStep(0)}>Cancelar</button><button className="personal-danger" disabled={confirmation!=='BORRAR'} onClick={()=>{if(clear())d.close();}}>Eliminar todos definitivamente</button></div></>}{error?<p role="alert" className="pure-error">{error}</p>:null}</PersonalModal>
 <div className="personal-toasts" aria-live="polite">{data.pending.filter(p=>p.deadline>now).map(p=><div key={p.id} role="status"><span>Chat borrado · <small>{Math.max(1,Math.ceil((p.deadline-now)/1000))} s</small></span><button onClick={()=>{undo(p.id);onChat();}}>Deshacer</button></div>)}</div></>;
}
