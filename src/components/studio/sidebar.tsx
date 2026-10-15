'use client';

import {useEffect, useRef, useState} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {Plus, MessageSquare, BookOpen, Clapperboard, MoreHorizontal, Menu, X, Settings, Search, PanelLeftClose, PanelLeftOpen, FolderPlus, ChevronDown, ArrowUpRight, Pencil, Trash2} from 'lucide-react';
import {StudioMark} from './brand';
import {SignOut} from '@/components/sign-out';
import {usePersonal} from '@/store/personal-chat';
import {useChatDialogs, PersonalModal} from './chat-dialogs';
import {ActionMenu, IconButton} from '@/components/ui/studio-controls';
import {formatCredits, hasCredits} from '@/lib/personal-chat/presentation';

export type StudioView = 'chat' | 'pdf' | 'cinema';
const studios = [
  {id: 'chat', name: 'Chat', icon: MessageSquare},
  {id: 'pdf', name: 'PDF Studio', icon: BookOpen},
  {id: 'cinema', name: 'Cinema Studio', icon: Clapperboard},
] as const;

export function StudioSidebar({view, onNavigate, onNew}: {view: StudioView; onNavigate: (v: StudioView) => void; onNew: () => void}) {
  const [mobile, setMobile] = useState(false);
  const [mode, setMode] = useState<'auto' | 'open' | 'closed'>('auto');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [help, setHelp] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const search = useRef<HTMLInputElement>(null);
  const data = usePersonal(s => s.data);
  const hydrated = usePersonal(s => s.hydrated);
  const select = usePersonal(s => s.select);
  const activeId = usePersonal(s => s.activeId);
  const dialogs = useChatDialogs();
  const reported = data.usage.filter(entry => hasCredits(entry.credits));
  const known = reported.reduce((total, entry) => total + (entry.credits || 0), 0);
  const chats = data.chats.filter(chat => chat.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  useEffect(() => {if (searchOpen) search.current?.focus();}, [searchOpen, mobile]);
  function go(next: StudioView) {onNavigate(next); setMobile(false);}
  function collapse() {
    setMode(current => current === 'auto' ? (window.matchMedia('(min-width:768px) and (max-width:1199px)').matches ? 'open' : 'closed') : current === 'closed' ? 'open' : 'closed');
  }
  const content = <>
    <div className="studio-sidebar-brand">
      <button className="studio-space-button" onClick={() => go('chat')} aria-label="Russian Code · Ir al Chat"><StudioMark/><span className="workspace-rail-hide">Russian Code<span>Estudio creativo</span></span></button>
      <div className="workspace-sidebar-controls">
        <IconButton className="studio-icon-button" label="Buscar chats" onClick={() => {setMode('open'); setHistoryOpen(true); setSearchOpen(value => !value);}}><Search size={16}/></IconButton>
        <IconButton className="studio-icon-button workspace-collapse" label={mode === 'closed' ? 'Expandir navegación' : 'Expandir o plegar navegación'} onClick={collapse}>{mode === 'closed' ? <PanelLeftOpen size={16}/> : <PanelLeftClose size={16}/>}</IconButton>
        <IconButton className="studio-mobile-close studio-icon-button" label="Cerrar navegación" onClick={() => setMobile(false)}><X size={18}/></IconButton>
      </div>
    </div>
    <button className="studio-new-chat" aria-label="Nuevo chat" onClick={() => {onNew(); setMobile(false);}}><Plus size={17}/><span className="workspace-rail-hide">Nuevo chat</span></button>
    <nav className="studio-nav three-studios-nav" aria-label="Estudios">
      {studios.map(({id, name, icon: Icon}) => <button key={id} title={name} aria-label={name} aria-current={view === id ? 'page' : undefined} onClick={() => go(id)}><span className="workspace-nav-icon"><Icon size={17}/></span><span className="workspace-rail-hide"><strong>{name}</strong></span></button>)}
    </nav>
    <ActionMenu label="Más opciones del estudio" className="workspace-more-trigger workspace-rail-hide" items={[
      {label: 'Ajustes del Chat', icon: <Settings size={15}/>, onSelect: dialogs.openSettings},
      {label: 'Guía del estudio', icon: <BookOpen size={15}/>, onSelect: () => setHelp(true)},
      {label: 'Volver a la portada', icon: <ArrowUpRight size={15}/>, onSelect: () => {window.location.assign('/');}},
    ]}><MoreHorizontal size={16}/><span>Ver más</span><ChevronDown size={12}/></ActionMenu>
    <div className="studio-history workspace-rail-hide">
      <div className="studio-history-heading">
        <button className="workspace-history-toggle" aria-expanded={historyOpen} onClick={() => setHistoryOpen(value => !value)}>Conversaciones<ChevronDown size={12}/></button>
        <IconButton className="studio-icon-button" label="Ajustes del Chat" onClick={dialogs.openSettings}><Settings size={14}/></IconButton>
      </div>
      {searchOpen ? <label className="workspace-chat-search"><Search size={14}/><input ref={search} aria-label="Buscar en los títulos de chats" placeholder="Buscar conversación…" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => {if (event.key === 'Escape') {setQuery(''); setSearchOpen(false);}}}/></label> : null}
      {!historyOpen ? null : !hydrated ? <div className="studio-shimmer pure-model-skeleton" role="status" aria-label="Cargando chats"/> : !data.chats.length ? <div className="studio-empty-chats"><FolderPlus size={24}/><strong>Aún no hay chats</strong><p>Empezá con una idea.</p></div> : !chats.length ? <p className="workspace-no-results" role="status">No hay chats con ese título.</p> : chats.map(chat => <div key={chat.id} className={'personal-history-row ' + (activeId === chat.id && view === 'chat' ? 'is-active' : '')}>
        <button className="studio-history-item" aria-current={activeId === chat.id && view === 'chat' ? 'true' : undefined} onClick={() => {select(chat.id); go('chat');}} title={chat.title}><span>{chat.title}</span></button>
        <ActionMenu label={'Menú de ' + chat.title} className="studio-history-menu" items={[
          {label: 'Renombrar', icon: <Pencil size={14}/>, onSelect: () => dialogs.openRename(chat.id)},
          {label: 'Borrar', icon: <Trash2 size={14}/>, onSelect: () => dialogs.openDelete(chat.id)},
        ]}/>
      </div>)}
    </div>
    <div className="studio-sidebar-bottom workspace-rail-hide">
      <div className="studio-session-meter">
        {reported.length ? <><span>Créditos registrados</span><strong>{formatCredits(known)}</strong></> : null}
        <a href="https://kie.ai/logs" target="_blank" rel="noreferrer">Consumo en Kie<ArrowUpRight size={12}/></a>
      </div>
      <div className="studio-member"><span className="studio-avatar">RC</span><div><strong>Equipo Russian Code</strong><small>Historial en este navegador</small></div></div>
      <SignOut/>
    </div>
  </>;
  return <>
    <aside className={'studio-sidebar workspace-sidebar workspace-mode-' + mode} aria-label="Navegación principal">{content}</aside>
    <Dialog.Root open={mobile} onOpenChange={setMobile}>
      <Dialog.Trigger asChild><IconButton className="studio-menu-trigger studio-icon-button" label="Abrir navegación"><Menu size={20}/></IconButton></Dialog.Trigger>
      <Dialog.Portal><Dialog.Overlay className="studio-drawer-overlay"/><Dialog.Content className="studio-sidebar studio-drawer workspace-sidebar">
        <Dialog.Title className="sr-only">Navegación del estudio</Dialog.Title><Dialog.Description className="sr-only">Chat personal y estudios con proyectos independientes.</Dialog.Description>{content}
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
    <PersonalModal open={help} onClose={() => setHelp(false)} title="Tu espacio de trabajo" description="Tres espacios para desarrollar tus ideas, con el acceso del equipo.">
      <div className="workspace-help"><p><strong>Chat:</strong> conversación personal, sin contexto de proyectos.</p><p><strong>PDF Studio:</strong> proyectos y acceso al editor de páginas actual.</p><p><strong>Cinema Studio:</strong> briefs de imagen y video. La generación se conectará por etapas.</p><p>Para llevar una conversación a un estudio, usá «Convertir en proyecto» y confirmá el brief.</p><p>El historial se guarda en este navegador y no se sincroniza entre dispositivos.</p></div>
      <button className="studio-primary" onClick={() => setHelp(false)}>Entendido</button>
    </PersonalModal>
  </>;
}
