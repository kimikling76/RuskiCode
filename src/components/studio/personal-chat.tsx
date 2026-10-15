'use client';

import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import {ArrowUp, ArrowDown, Copy, Check, RotateCcw, Square, Trash2, FolderPlus, Pencil, Settings, Hand, X} from 'lucide-react';
import {usePersonal, type PersonalMessage, type StudioProject} from '@/store/personal-chat';
import {useChatDialogs, PersonalModal} from './chat-dialogs';
import {ConvertChat} from './convert-chat';
import {ModelPicker, type ChatModel} from './model-picker';
import {ConfirmDialog, IconButton} from '@/components/ui/studio-controls';
import {formatCredits, hasCredits} from '@/lib/personal-chat/presentation';
import {sseData} from '@/lib/ai/sse';

const MessageMarkdown = dynamic(() => import('./message-markdown').then(module => module.MessageMarkdown), {loading: () => <span className="chat-thinking">Preparando el texto…</span>});
const errorDetails: Record<string, string> = {
  AUTH_REQUIRED: 'Tu sesión venció. Volvé a iniciar sesión para seguir.',
  MODEL_NOT_CONFIGURED: 'Este modelo no está disponible en la configuración actual. Podés elegir otro.',
  RATE_LIMIT: 'Llegamos al límite de solicitudes. Esperá un momento antes de reintentar.',
  RATE_LIMIT_UNAVAILABLE: 'No pude comprobar el límite de uso. Probá de nuevo más tarde.',
  ALREADY_SENT: 'Esta solicitud ya se envió. Revisá el consumo en Kie antes de volver a intentarlo.',
  INVALID_REQUEST: 'El chat es demasiado largo para enviarlo. Podés empezar uno nuevo o quitar mensajes.',
  PROVIDER_AUTH_ERROR: 'La conexión con Kie necesita revisarse en la configuración del servidor.',
  INSUFFICIENT_BALANCE: 'Kie informó que no hay saldo suficiente. Revisá tu cuenta antes de seguir.',
  STREAM_INTERRUPTED: 'La respuesta se interrumpió. Revisá el consumo en Kie antes de reintentar.',
};
const starters = [
  {title: 'Explorar una idea', prompt: 'Quiero explorar una idea. Haceme preguntas para ayudarme a desarrollarla.'},
  {title: 'Resolver una duda', prompt: 'Ayudame a entender un tema paso a paso: '},
  {title: 'Revisar un texto', prompt: 'Quiero revisar la claridad y el tono de este texto: '},
];

export function PersonalChatPanel({onCreated}: {onCreated: (project: StudioProject) => void}) {
  const hydrated = usePersonal(s => s.hydrated);
  const data = usePersonal(s => s.data);
  const activeId = usePersonal(s => s.activeId);
  const create = usePersonal(s => s.create);
  const patch = usePersonal(s => s.patch);
  const charge = usePersonal(s => s.charge);
  const rename = usePersonal(s => s.rename);
  const removeMessage = usePersonal(s => s.removeMessage);
  const storageError = usePersonal(s => s.error);
  const chat = data.chats.find(item => item.id === activeId);
  const dialogs = useChatDialogs();
  const [text, setText] = useState('');
  const [model, setModel] = useState('auto');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const [conversion, setConversion] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [regenerateId, setRegenerateId] = useState<string | null>(null);
  const [askFirst, setAskFirst] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [showJump, setShowJump] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const requestChat = useRef<string | null>(null);
  const sending = useRef(false);
  const log = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const composer = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const lastScrollTop = useRef(0);
  const viewedChat = useRef(activeId);
  const renameInput = useRef<HTMLInputElement>(null);
  const titleTrigger = useRef<HTMLButtonElement>(null);
  const {data: models, isError, refetch, isFetching} = useQuery<{models: ChatModel[]}>({
    queryKey: ['personal-kie-models'],
    queryFn: async () => {
      const response = await fetch('/api/personal-chat');
      if (!response.ok) throw Error('MODELS_UNAVAILABLE');
      return response.json();
    },
    staleTime: 60000,
  });
  const hasMessages = Boolean(chat?.messages.length);
  const last = chat?.messages.at(-1);
  const jump = useCallback(() => {
    if (!log.current) return;
    log.current.scrollTop = log.current.scrollHeight;
    lastScrollTop.current = log.current.scrollTop;
    nearBottom.current = true;
    setShowJump(false);
  }, []);
  useEffect(() => {
    if (abort.current && requestChat.current !== activeId) abort.current.abort();
    setText(''); setConversion(false); setConfirmSend(false); setEditing(false); setRegenerateId(null);
    nearBottom.current = true; setShowJump(false);
  }, [activeId]);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    try {
      const draft = sessionStorage.getItem('estudio-landing-draft');
      if (draft) {setText(draft.slice(0,20000)); sessionStorage.removeItem('estudio-landing-draft');}
    } catch {}
  }, []);
  useLayoutEffect(() => {
    const element = textarea.current;
    if (element) {element.style.height = 'auto'; element.style.height = Math.min(element.scrollHeight,208) + 'px';}
  }, [text]);
  const follow = useCallback(() => {
    const element = log.current;
    if (!element || !nearBottom.current) return;
    if (element.scrollTop + 2 < lastScrollTop.current && element.scrollHeight - element.clientHeight - element.scrollTop > 100) {
      nearBottom.current = false; setShowJump(true);
    } else jump();
  }, [jump]);
  useLayoutEffect(() => {
    if (viewedChat.current !== activeId) {viewedChat.current = activeId; nearBottom.current = true; lastScrollTop.current = 0;}
    follow();
  }, [last?.content, last?.status, chat?.messages.length, activeId, follow]);
  useEffect(() => {
    const resize = new ResizeObserver(follow);
    if (log.current) {resize.observe(log.current); const column = log.current.querySelector('.chat-message-column'); if (column) resize.observe(column);}
    if (composer.current) resize.observe(composer.current);
    return () => resize.disconnect();
  }, [hasMessages, follow]);
  useEffect(() => {if (editing) renameInput.current?.select();}, [editing]);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    function update() {
      const element = shell.current;
      if (element && viewport) element.style.setProperty('--chat-keyboard-inset', Math.max(0,(element.parentElement?.getBoundingClientRect().bottom || window.innerHeight) - viewport.height - viewport.offsetTop) + 'px');
    }
    update(); viewport.addEventListener('resize',update); viewport.addEventListener('scroll',update);
    return () => {viewport.removeEventListener('resize',update); viewport.removeEventListener('scroll',update);};
  }, []);
  function requestSend() {
    if (!hydrated || !text.trim() || busy || !models?.models.length) return;
    if (askFirst) setConfirmSend(true); else void send();
  }
  function closeTitleEdit() {setEditing(false); requestAnimationFrame(() => titleTrigger.current?.focus());}
  function saveTitle() {if (chat && title.trim() && rename(chat.id,title)) closeTitleEdit();}
  async function send(replacingId?: string) {
    if (!hydrated || sending.current) return;
    const prompt = text.trim();
    if (!prompt && !replacingId) return;
    let id = chat?.id;
    if (!id) {id = create(prompt) || undefined; if (!id) return;}
    const original = chat?.messages || [];
    let context = original;
    let replacingIndex = -1;
    if (replacingId) {
      replacingIndex = original.findIndex(message => message.id === replacingId && message.role === 'assistant');
      if (replacingIndex < 0) return;
      let userIndex = replacingIndex - 1;
      while (userIndex >= 0 && original[userIndex].role !== 'user') userIndex--;
      if (userIndex < 0) return;
      context = original.slice(0,userIndex + 1);
    } else context = [...original, {id: crypto.randomUUID(), role: 'user', content: prompt, createdAt: new Date().toISOString()}];
    const outbound = context.filter(message => message.content.trim()).map(({role,content}) => ({role,content}));
    const messageId = crypto.randomUUID();
    const requestId = crypto.randomUUID();
    const selected = chat?.model || model;
    const assistant: PersonalMessage = {id: messageId, role: 'assistant', content: '', status: 'streaming', createdAt: new Date().toISOString()};
    const messages = replacingId ? original.map((message,index) => index === replacingIndex ? assistant : message) : [...context,assistant];
    nearBottom.current = !replacingId || replacingIndex === original.length - 1;
    lastScrollTop.current = log.current?.scrollTop || 0;
    if (!patch(id,{messages,model:selected})) return;
    const chatId = id;
    sending.current = true; setBusy(true); if (!replacingId) setText(''); setRegenerateId(null);
    const controller = new AbortController(); requestChat.current = chatId; abort.current = controller;
    let done = false, accepted = false, content = '';
    let realCredits: number | undefined;
    function update(value: Partial<PersonalMessage>) {
      const current = usePersonal.getState().data.chats.find(item => item.id === chatId);
      if (current) patch(chatId,{messages: current.messages.map(message => message.id === messageId ? {...message,...value} : message)});
    }
    try {
      const response = await fetch('/api/personal-chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId,purpose:'chat',model:selected,messages:outbound}),signal:controller.signal});
      if (!response.ok) {const failure = await response.json(); throw Error(failure.error);}
      accepted = true;
      if (!response.body) throw Error('PROVIDER_UNAVAILABLE');
      for await (const frame of sseData(response.body)) {
        const event = JSON.parse(frame);
        if (event.type === 'delta') {content += event.text; update({content});}
        if (event.type === 'model') update({model:event.name});
        if (event.type === 'usage' && hasCredits(event.usage?.credits)) {realCredits = event.usage.credits; update({credits:realCredits});}
        if (event.type === 'error') throw Error(event.error);
        if (event.type === 'done') done = true;
      }
      if (!done) throw Error('STREAM_INTERRUPTED');
      if (!content.trim()) throw Error('PROVIDER_UNAVAILABLE');
      update({status:'done'});
    } catch (error) {
      update({status:'error',errorCode:controller.signal.aborted ? 'STREAM_INTERRUPTED' : error instanceof Error && Object.hasOwn(errorDetails,error.message) ? error.message : 'PROVIDER_UNAVAILABLE'});
    } finally {
      if (accepted) charge(requestId,realCredits);
      sending.current = false; setBusy(false); abort.current = null; requestChat.current = null;
    }
  }
  async function copy(message: PersonalMessage) {
    try {await navigator.clipboard.writeText(message.content); setCopied(message.id); setTimeout(() => setCopied(''),1500);}
    catch {setCopied('failed:' + message.id);}
  }
  return <div ref={shell} className={'chat-shell ' + (hasMessages ? 'has-conversation' : 'is-new-conversation')}>
    <header className="chat-header">
      <div className="chat-title-area">{editing ? <form className="chat-rename" onSubmit={event => {event.preventDefault(); saveTitle();}}>
        <label className="sr-only" htmlFor="chat-title-input">Título de la conversación</label>
        <input id="chat-title-input" ref={renameInput} maxLength={100} value={title} onChange={event => setTitle(event.target.value)} onKeyDown={event => {if (event.key === 'Escape') closeTitleEdit();}}/>
        <IconButton type="submit" label="Guardar título"><Check size={16}/></IconButton><IconButton label="Cancelar cambio de título" onClick={closeTitleEdit}><X size={16}/></IconButton>
      </form> : <><h1 title={chat?.title}>{chat?.title || 'Nuevo chat'}</h1>{chat ? <IconButton ref={titleTrigger} label="Editar título" onClick={() => {setTitle(chat.title); setEditing(true);}}><Pencil size={14}/></IconButton> : null}</>}</div>
      <div className="chat-header-actions">
        {chat?.messages.length ? <button className="chat-ghost" aria-label="Convertir en proyecto" disabled={busy} onClick={() => setConversion(true)}><FolderPlus size={15}/><span>Convertir en proyecto</span></button> : null}
        <IconButton onClick={dialogs.openSettings} label="Ajustes del Chat"><Settings size={16}/></IconButton>
      </div>
    </header>
    <div className="chat-scroll-zone">
      <div ref={log} className="chat-log" role="log" aria-label="Mensajes de la conversación" aria-live="polite" aria-busy={busy} onScroll={() => {
        const element = log.current;
        if (element) {nearBottom.current = element.scrollHeight - element.clientHeight - element.scrollTop < 100; lastScrollTop.current = element.scrollTop; setShowJump(!nearBottom.current);}
      }}>
        {!hasMessages ? <div className="chat-empty"><span className="chat-empty-letter" aria-hidden="true">Ж</span><span className="chat-empty-kicker">Russian Code</span><h2>¿Qué tenés en mente?</h2><p>Una idea, una pregunta, otra perspectiva.</p></div> : <div className="chat-message-column">
          {chat?.conversions.length ? <div className="chat-conversions">{chat.conversions.map(link => <a key={link.projectId} href={'/workspace?studio=' + link.destination + '&project=' + encodeURIComponent(link.projectId)}>Proyecto: {link.name} ↗</a>)}</div> : null}
          {chat?.messages.map((message,index) => <article className={'chat-message chat-message-' + message.role} key={message.id} aria-label={message.role === 'user' ? 'Tu mensaje' : 'Respuesta del asistente'}>
            {message.role === 'assistant' ? <div className="chat-model-caption">{message.model || 'Asistente'}</div> : null}
            {message.content || message.status === 'streaming' ? <div className="chat-message-body">{message.role === 'assistant' ? message.content ? <MessageMarkdown content={message.content}/> : <span className="chat-thinking" role="status">Pensando<span aria-hidden="true">…</span></span> : <p className="chat-user-text">{message.content}</p>}</div> : null}
            {message.status === 'error' ? <div className="chat-inline-error" role="status"><div><p>No pude terminar esta respuesta.</p>{message.errorCode && Object.hasOwn(errorDetails,message.errorCode) ? <small>{errorDetails[message.errorCode]}</small> : null}</div><button className="chat-ghost" disabled={busy} onClick={() => setRegenerateId(message.id)}>Reintentar</button></div> : null}
            <footer className="chat-message-footer">
              <div className="chat-message-meta">{message.createdAt && Number.isFinite(Date.parse(message.createdAt)) ? <time dateTime={message.createdAt}>{new Intl.DateTimeFormat('es-AR',{hour:'2-digit',minute:'2-digit'}).format(new Date(message.createdAt))}</time> : null}{message.role === 'assistant' && hasCredits(message.credits) ? <span>{formatCredits(message.credits)} créditos · Kie</span> : null}</div>
              <div className="chat-message-actions">
                {message.content ? <IconButton onClick={() => void copy(message)} label={copied === message.id ? 'Mensaje copiado' : 'Copiar mensaje'}>{copied === message.id ? <Check size={15}/> : <Copy size={15}/>}</IconButton> : null}
                {message.role === 'assistant' && message.status !== 'error' && index === chat.messages.length - 1 ? <IconButton disabled={busy} onClick={() => setRegenerateId(message.id)} label="Regenerar respuesta"><RotateCcw size={15}/></IconButton> : null}
                <IconButton disabled={busy} onClick={() => setDeleteId(message.id)} label="Borrar mensaje"><Trash2 size={15}/></IconButton>
              </div>
            </footer>
            {copied === 'failed:' + message.id ? <p className="chat-copy-error" role="status">No pude copiarlo. Podés seleccionar el texto o volver a usar Copiar.</p> : null}
          </article>)}
        </div>}
      </div>
      {showJump && hasMessages ? <button className="chat-jump" onClick={jump}><ArrowDown size={15}/>Ir al último mensaje</button> : null}
    </div>
    <div ref={composer} className="chat-composer-zone"><div className="chat-composer-column">
      {isError ? <div className="chat-notice" role="alert"><span>No pude cargar los modelos. Probemos de nuevo.</span><button className="chat-ghost" disabled={isFetching} onClick={() => void refetch()}>Reintentar</button></div> : null}
      {storageError ? <div className="chat-notice" role="alert"><span>{storageError}</span></div> : null}
      <form className="chat-composer" onSubmit={event => {event.preventDefault(); requestSend();}}>
        <label className="sr-only" htmlFor="personal-message">Tu mensaje</label>
        <textarea ref={textarea} id="personal-message" rows={1} value={text} disabled={busy || !hydrated} maxLength={20000} onChange={event => setText(event.target.value)} placeholder="Escribí lo que tenés en mente…" onKeyDown={event => {if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.nativeEvent.isComposing) {event.preventDefault(); requestSend();}}}/>
        <div className="chat-composer-controls">
          <ModelPicker models={models?.models || []} disabled={busy || !models?.models.length} value={chat?.model || model} onChange={value => {if (chat) patch(chat.id,{model:value}); else setModel(value);}}/>
          <button type="button" className="chat-ask" role="switch" aria-checked={askFirst} onClick={() => setAskFirst(value => !value)}><Hand size={14}/><span>Preguntar antes</span><i aria-hidden="true"/></button>
          {busy ? <IconButton className="chat-send chat-stop" label="Detener respuesta" onClick={() => abort.current?.abort()}><Square size={15}/></IconButton> : <IconButton type="submit" className="chat-send" label="Enviar mensaje" disabled={!hydrated || !text.trim() || !models?.models.length}><ArrowUp size={19}/></IconButton>}
        </div>
      </form>
      <div className="chat-composer-caption"><span className="chat-keyboard-hint">Ctrl / ⌘ + Enter para enviar</span></div>
      {!hasMessages ? <div className="chat-suggestions">{starters.map(starter => <button key={starter.title} onClick={() => {setText(starter.prompt); textarea.current?.focus();}}>{starter.title}</button>)}</div> : null}
      <p className="chat-storage-note">Historial en este navegador <span aria-hidden="true">·</span> <a href="https://kie.ai/logs" target="_blank" rel="noreferrer">Consumo en Kie ↗</a></p>
    </div></div>
    <PersonalModal open={confirmSend} onClose={() => setConfirmSend(false)} title="¿Enviamos tu mensaje?" description="Se enviará tu mensaje y el historial de este chat a Kie. Puede consumir créditos.">
      <dl className="workspace-confirm"><dt>Modelo</dt><dd>{(chat?.model || model) === 'auto' ? 'Auto · Kie.ai' : models?.models.find(item => item.id === (chat?.model || model))?.name || chat?.model || model}</dd></dl>
      <div className="personal-dialog-actions"><button className="studio-text-button" onClick={() => setConfirmSend(false)}>Cancelar</button><button className="studio-primary" disabled={busy} onClick={() => {setConfirmSend(false); void send();}}>Confirmar y enviar</button></div>
    </PersonalModal>
    {chat ? <ConvertChat key={chat.id} chat={chat} open={conversion} onClose={() => setConversion(false)} onCreated={onCreated}/> : null}
    <ConfirmDialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)} title="¿Borramos este mensaje?" description="Se elimina de este navegador. Los proyectos que creaste a partir del chat conservan sus copias." confirmLabel="Borrar mensaje" onConfirm={() => chat && deleteId ? removeMessage(chat.id,deleteId) : false}/>
    <PersonalModal open={Boolean(regenerateId)} onClose={() => setRegenerateId(null)} title="¿Volvemos a intentarlo?" description="Es una nueva solicitud a Kie y puede consumir créditos. Reemplaza solo esta respuesta; los demás mensajes y el consumo anterior se conservan. Si hubo una interrupción, revisá el consumo en Kie antes de confirmar.">
      <div className="personal-dialog-actions"><button className="studio-text-button" onClick={() => setRegenerateId(null)}>Cancelar</button><button className="studio-primary" disabled={busy} onClick={() => {if (regenerateId) void send(regenerateId);}}>Confirmar y reintentar</button></div>
    </PersonalModal>
  </div>;
}
