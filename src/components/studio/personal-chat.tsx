'use client';
import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import dynamic from 'next/dynamic';
import {useQuery} from '@tanstack/react-query';
import TextareaAutosize from 'react-textarea-autosize';
import {ArrowUp, ArrowDown, ArrowUpRight, Copy, Check, RotateCcw, Square, FolderPlus, Pencil, MoreHorizontal, X} from 'lucide-react';
import {useAssistants, type Assistant} from '@/store/assistants';
import {AssistantMenu, AssistantPreview, AssistantChip, preferredModel} from './assistant-chooser';
import {usePersonal, type PersonalMessage, type StudioProject} from '@/store/personal-chat';
import {useChatDialogs} from './chat-dialogs';
import {ConvertChat} from './convert-chat';
import {ChatModelPicker, modelLabel, type ChatModel} from './chat-model-picker';
import {NavTrigger} from './sidebar';
import {ConfirmDialog} from '@/components/ui/dialog';
import {Menu, MenuTrigger, MenuContent, MenuItem, MenuLink, MenuSeparator, MenuLabel} from '@/components/ui/menu';
import {Tip} from '@/components/ui/tooltip';
import {Switch} from '@/components/ui/switch';
import {sseData} from '@/lib/ai/sse';

const MessageMarkdown = dynamic(() => import('./message-markdown').then(m => m.MessageMarkdown), {
  loading: () => <span className="rc-thinking" aria-hidden="true"><span /><span /><span /></span>,
});

// Technical detail shown under «Detalles» when a response fails. The headline is always the same.
const errorDetails: Record<string, string> = {
  AUTH_REQUIRED: 'La sesión terminó. Volvé a iniciar sesión.',
  MODEL_NOT_CONFIGURED: 'No hay un modelo de Kie configurado para esta selección.',
  RATE_LIMIT: 'Kie o el estudio limitó las solicitudes. Esperá unos segundos.',
  RATE_LIMIT_UNAVAILABLE: 'No se pudo comprobar el límite de uso. Probá más tarde.',
  ALREADY_SENT: 'Esta solicitud ya se había enviado. Revisá los registros de Kie antes de reintentar.',
  INVALID_REQUEST: 'La conversación es demasiado larga. Abrí otro chat o borrá mensajes.',
  PROVIDER_AUTH_ERROR: 'Kie rechazó la clave del servidor (KIE_API_KEY en Vercel).',
  INSUFFICIENT_BALANCE: 'Kie informó saldo insuficiente.',
  STREAM_INTERRUPTED: 'La conexión se cortó a mitad de la respuesta. Puede haber consumo: revisá los registros de Kie.',
  PROVIDER_UNAVAILABLE: 'El modelo no respondió. Probá más tarde o elegí otro.',
};

const suggestions = [
  {title: 'Explorar una idea', prompt: 'Quiero explorar una idea. Haceme preguntas para ayudarme a desarrollarla.'},
  {title: 'Entender un tema paso a paso', prompt: 'Ayudame a entender un tema paso a paso: '},
  {title: 'Revisar la claridad de un texto', prompt: 'Quiero revisar la claridad y el tono de este texto: '},
  {title: 'Preparar el prompt de una imagen', prompt: 'Ayudame a escribir un prompt para una imagen. Preguntame sujeto, estilo, encuadre y uso final. Solo prepará el texto.'},
];

const ASK_KEY = 'rc-ask-first';
const timeFormat = new Intl.DateTimeFormat('es-AR', {hour: '2-digit', minute: '2-digit'});

function formatTime(stamp?: string) {
  if (!stamp || !Number.isFinite(Date.parse(stamp))) return null;
  return <time dateTime={stamp}>{timeFormat.format(new Date(stamp))}</time>;
}

function credits(n: number) {
  return n.toLocaleString('es-AR') + (n === 1 ? ' crédito' : ' créditos');
}

export function PersonalChatPanel({onCreated}: {onCreated: (p: StudioProject) => void}) {
  const hydrated = usePersonal(s => s.hydrated);
  const data = usePersonal(s => s.data);
  const activeId = usePersonal(s => s.activeId);
  const create = usePersonal(s => s.create);
  const patch = usePersonal(s => s.patch);
  const charge = usePersonal(s => s.charge);
  const rename = usePersonal(s => s.rename);
  const removeMessage = usePersonal(s => s.removeMessage);
  const storageError = usePersonal(s => s.error);
  const dialogs = useChatDialogs();
  const chat = data.chats.find(c => c.id === activeId);
  const assistants = useAssistants(s => s.assistants);
  const hydrateAssistants = useAssistants(s => s.hydrate);

  const [text, setText] = useState('');
  const [model, setModel] = useState('auto');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const [conversion, setConversion] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [askFirst, setAskFirst] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [showJump, setShowJump] = useState(false);
  // Chosen before the first message; afterwards it lives in the chat itself.
  const [pendingAssistant, setPendingAssistant] = useState<Assistant | null>(null);
  const [preview, setPreview] = useState<{assistant: Assistant; choose: boolean} | null>(null);

  const abort = useRef<AbortController | null>(null);
  const stoppedByUser = useRef(false);
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

  const {data: modelData, isError, isPending, refetch, isFetching} = useQuery<{models: ChatModel[]}>({
    queryKey: ['personal-kie-models'],
    queryFn: async () => { const r = await fetch('/api/personal-chat'); if (!r.ok) throw Error(); return r.json(); },
    staleTime: 60000,
  });
  const allModels = modelData?.models || [];
  // Only models that can really answer; unverified ones stay visible (disabled) in the picker.
  const models = allModels.filter(m => m.available !== false && m.status !== 'unverified');
  const selectedModel = chat?.model || model;
  const hasMessages = Boolean(chat?.messages.length);
  const last = chat?.messages.at(-1);
  const canSend = hydrated && !busy && Boolean(text.trim()) && models.length > 0;

  const jump = useCallback(() => {
    if (!log.current) return;
    log.current.scrollTop = log.current.scrollHeight;
    lastScrollTop.current = log.current.scrollTop;
    nearBottom.current = true;
    setShowJump(false);
  }, []);

  // Only when the conversation really changes (not on mount, nor React's development re-run of effects),
  // so a preview opened from «Usar en el Chat» is not closed right away.
  const shownChat = useRef(activeId);
  useEffect(() => {
    if (shownChat.current === activeId) return;
    shownChat.current = activeId;
    if (abort.current && requestChat.current !== activeId) abort.current.abort();
    setText(''); setConversion(false); setConfirmSend(false); setConfirmRegenerate(null); setEditing(false); setPendingAssistant(null); setPreview(null);
    nearBottom.current = true; setShowJump(false);
  }, [activeId]);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => { hydrateAssistants(); }, [hydrateAssistants]);
  // «Usar en el Chat» from the Assistants page: open a new chat with that assistant's preview.
  useEffect(() => {
    if (!assistants.length) return;
    const url = new URL(window.location.href);
    const id = url.searchParams.get('asistente');
    if (!id) return;
    url.searchParams.delete('asistente');
    window.history.replaceState(null, '', url);
    const a = assistants.find(x => x.id === id);
    if (a) { usePersonal.getState().select(null); setPreview({assistant: a, choose: true}); }
  }, [assistants]);
  useEffect(() => {
    try { setAskFirst(localStorage.getItem(ASK_KEY) === '1'); } catch {}
    try {
      const draft = sessionStorage.getItem('estudio-landing-draft');
      if (draft) { setText(draft.slice(0, 20000)); sessionStorage.removeItem('estudio-landing-draft'); }
    } catch {}
  }, []);

  // Follow new tokens while the reader is at the bottom; stop following once they scroll up.
  const follow = useCallback(() => {
    const el = log.current;
    if (!el || !nearBottom.current) return;
    if (el.scrollTop + 2 < lastScrollTop.current && el.scrollHeight - el.clientHeight - el.scrollTop > 100) {
      nearBottom.current = false; setShowJump(true);
    } else jump();
  }, [jump]);
  useLayoutEffect(() => {
    if (viewedChat.current !== activeId) { viewedChat.current = activeId; nearBottom.current = true; lastScrollTop.current = 0; }
    follow();
  }, [last?.content, last?.status, chat?.messages.length, activeId, follow]);
  useEffect(() => {
    const resize = new ResizeObserver(follow);
    if (log.current) {
      resize.observe(log.current);
      const column = log.current.querySelector('.rc-chat-column');
      if (column) resize.observe(column);
    }
    if (composer.current) resize.observe(composer.current);
    return () => resize.disconnect();
  }, [hasMessages, follow]);
  useEffect(() => { if (editing) renameInput.current?.select(); }, [editing]);

  // iOS Safari does not resize the layout for the keyboard: lift the composer by the covered height.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    function update() {
      const el = shell.current;
      if (!el || !viewport) return;
      const bottom = el.parentElement?.getBoundingClientRect().bottom || window.innerHeight;
      el.style.setProperty('--chat-keyboard-inset', Math.max(0, bottom - viewport.height - viewport.offsetTop) + 'px');
    }
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => { viewport.removeEventListener('resize', update); viewport.removeEventListener('scroll', update); };
  }, []);

  function changeAskFirst(value: boolean) {
    setAskFirst(value);
    try { localStorage.setItem(ASK_KEY, value ? '1' : '0'); } catch {}
  }

  function chooseModel(id: string) {
    if (chat) patch(chat.id, {model: id}); else setModel(id);
  }

  function requestSend() {
    if (!canSend) return;
    if (askFirst) setConfirmSend(true); else void send();
  }

  function requestRegenerate(withModel?: string) {
    if (busy || !chat) return;
    if (withModel && withModel !== chat.model) patch(chat.id, {model: withModel});
    if (askFirst) setConfirmRegenerate(withModel || chat.model || 'auto'); else void send(true);
  }

  function saveTitle() {
    if (chat && title.trim() && rename(chat.id, title)) setEditing(false);
  }

  async function send(isRegeneration = false) {
    if (!hydrated || sending.current) return;
    const prompt = text.trim();
    if (!prompt && !isRegeneration) return;
    const existing = chat?.id;
    const id = existing || create(prompt);
    if (!id) return;
    let base = usePersonal.getState().data.chats.find(c => c.id === id)?.messages || [];
    if (isRegeneration) {
      let i = base.length - 1;
      while (i >= 0 && base[i].role !== 'user') i--;
      base = base.slice(0, i + 1);
      if (!base.length) return;
    } else {
      base = [...base, {id: crypto.randomUUID(), role: 'user', content: prompt, createdAt: new Date().toISOString()}];
    }
    const outbound = base.filter(m => m.content.trim()).map(({role, content}) => ({role, content}));
    const messageId = crypto.randomUUID();
    const requestId = crypto.randomUUID();
    // A new chat uses the model chosen before it existed; an existing chat keeps its own.
    const selected = existing ? usePersonal.getState().data.chats.find(c => c.id === id)?.model || 'auto' : model;
    const assistant: PersonalMessage = {id: messageId, role: 'assistant', content: '', status: 'streaming', createdAt: new Date().toISOString()};
    // The assistant applies only if it was chosen for this chat. Its current instructions are sent and kept.
    const chosen = existing ? usePersonal.getState().data.chats.find(c => c.id === id)?.assistant : pendingAssistant ? {id: pendingAssistant.id, name: pendingAssistant.name, instructions: pendingAssistant.instructions, mediaCatalog: pendingAssistant.mediaCatalog} : undefined;
    const live = chosen ? useAssistants.getState().assistants.find(a => a.id === chosen.id) : undefined;
    const active = chosen ? (live ? {id: live.id, name: live.name, instructions: live.instructions, mediaCatalog: live.mediaCatalog} : chosen) : undefined;
    nearBottom.current = true;
    lastScrollTop.current = log.current?.scrollTop || 0;
    if (!patch(id, {messages: [...base, assistant], model: selected, ...(active ? {assistant: active} : {})})) return;
    if (!existing) setPendingAssistant(null);

    const chatId = id;
    sending.current = true; setBusy(true);
    if (!isRegeneration) setText('');
    const controller = new AbortController();
    stoppedByUser.current = false;
    requestChat.current = chatId;
    abort.current = controller;
    let done = false, accepted = false, realCredits: number | undefined, content = '', modelName = '';

    function update(value: Partial<PersonalMessage>) {
      const current = usePersonal.getState().data.chats.find(c => c.id === chatId);
      if (current) patch(chatId, {messages: current.messages.map(m => m.id === messageId ? {...m, ...value} : m)});
    }

    try {
      const r = await fetch('/api/personal-chat', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({requestId, purpose: 'chat', model: selected, messages: outbound, ...(active ? {assistant: {name: active.name, instructions: active.instructions, mediaCatalog: active.mediaCatalog}} : {})}),
        signal: controller.signal,
      });
      if (!r.ok) { const e = await r.json(); throw Error(e.error); }
      accepted = true;
      if (!r.body) throw Error('PROVIDER_UNAVAILABLE');
      for await (const frame of sseData(r.body)) {
        const e = JSON.parse(frame);
        if (e.type === 'delta') { content += e.text; update({content}); }
        if (e.type === 'model') { modelName = e.name; update({model: e.name}); }
        if (e.type === 'usage' && typeof e.usage?.credits === 'number') { realCredits = e.usage.credits; update({credits: realCredits}); }
        if (e.type === 'error') throw Error(e.error);
        if (e.type === 'done') { done = true; update({status: 'done'}); }
      }
      if (!done) throw Error('STREAM_INTERRUPTED');
    } catch (e) {
      if (stoppedByUser.current) {
        // The person chose to stop: keep what arrived, no error.
        update({status: 'done', stopped: true});
      } else {
        const code = controller.signal.aborted ? 'STREAM_INTERRUPTED' : e instanceof Error ? e.message : '';
        update({status: 'error', error: code});
      }
    } finally {
      if (accepted) charge(requestId, realCredits, {studio: 'chat', label: modelName || 'Respuesta'});
      sending.current = false; setBusy(false);
      abort.current = null; requestChat.current = null;
    }
  }

  function stop() {
    stoppedByUser.current = true;
    abort.current?.abort();
  }

  async function copy(m: PersonalMessage) {
    try {
      await navigator.clipboard.writeText(m.content);
      setCopied(m.id);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      setCopied('failed:' + m.id);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    const modifier = e.ctrlKey || e.metaKey;
    // Desktop: Enter sends, Shift+Enter adds a line. Touch keyboards: Enter adds a line.
    const desktop = window.matchMedia('(pointer: fine)').matches;
    if (modifier || (desktop && !e.shiftKey)) { e.preventDefault(); requestSend(); }
  }

  function chooseAssistant(a: Assistant) {
    setPendingAssistant(a);
    setPreview(null);
    const pref = preferredModel(a, allModels);
    if (pref.state === 'ok') setModel(a.model);
    textarea.current?.focus();
  }

  function neutralChat() {
    usePersonal.getState().select(null);
    setPendingAssistant(null);
  }

    const openAssistant = (id: string) => {
    const a = assistants.find(x => x.id === id);
    if (a) setPreview({assistant: a, choose: false});
    else if (chat?.assistant) setPreview({assistant: {...chat.assistant, description: 'Este asistente ya no existe; esta conversación conserva las últimas instrucciones que usó.', model: 'auto', scope: 'chat', createdAt: '', updatedAt: ''}, choose: false});
  };

  const modelName = (id: string) => id === 'auto' ? 'Automático' : modelLabel(models.find(m => m.id === id)?.name || id);
  const otherModels = models.filter(m => m.id !== chat?.model);

  return (
    <div ref={shell} className={'rc-chat' + (hasMessages ? '' : ' is-empty')}>
      <header className="rc-topbar rc-chat-header">
        <NavTrigger />
        <div className="rc-chat-title">
          {editing ? (
            <form className="rc-chat-rename" onSubmit={e => { e.preventDefault(); saveTitle(); }}>
              <label className="sr-only" htmlFor="chat-title-input">Título de la conversación</label>
              <input
                id="chat-title-input"
                ref={renameInput}
                className="rc-input"
                maxLength={100}
                value={title}
                onChange={e => setTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') setEditing(false); }}
              />
              <button type="submit" className="rc-icon-btn" aria-label="Guardar título"><Check /></button>
              <button type="button" className="rc-icon-btn" aria-label="Cancelar" onClick={() => setEditing(false)}><X /></button>
            </form>
          ) : (
            <>
              <h1 title={chat?.title}>{chat?.title || 'Nuevo chat'}</h1>
              {chat ? (
                <Tip label="Renombrar">
                  <button type="button" className="rc-icon-btn rc-icon-btn--sm rc-chat-title-edit" aria-label="Renombrar chat" onClick={() => { setTitle(chat.title); setEditing(true); }}>
                    <Pencil />
                  </button>
                </Tip>
              ) : null}
            </>
          )}
        </div>
        {chat?.assistant ? (
          <AssistantChip name={chat.assistant.name} onView={() => openAssistant(chat.assistant!.id)} onClear={neutralChat} clearLabel="Nuevo chat neutro" />
        ) : null}
        <div className="rc-topbar-actions">
          {hasMessages ? (
            <Tip label="Llevar este chat a PDF Studio o Cinema Studio">
              <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" disabled={busy} onClick={() => setConversion(true)} aria-label="Convertir en proyecto">
                <FolderPlus />
                <span className="rc-hide-sm">Convertir en proyecto</span>
              </button>
            </Tip>
          ) : null}
          <Menu>
            <MenuTrigger asChild>
              <button type="button" className="rc-icon-btn" aria-label="Más opciones del chat"><MoreHorizontal /></button>
            </MenuTrigger>
            <MenuContent>
              {chat ? <MenuItem onSelect={() => { setTitle(chat.title); setEditing(true); }}>Renombrar</MenuItem> : null}
              <MenuLink href="/workspace/ajustes?seccion=preferencias">Ajustes del Chat</MenuLink>
              {chat ? <><MenuSeparator /><MenuItem danger disabled={busy} onSelect={() => dialogs.openDelete(chat.id)}>Borrar chat</MenuItem></> : null}
            </MenuContent>
          </Menu>
        </div>
      </header>

      <div className="rc-chat-scroll-zone">
        <div
          ref={log}
          className="rc-chat-scroll"
          role="log"
          aria-label="Mensajes de la conversación"
          aria-live="polite"
          aria-busy={busy}
          onScroll={() => {
            const el = log.current;
            if (!el) return;
            nearBottom.current = el.scrollHeight - el.clientHeight - el.scrollTop < 100;
            lastScrollTop.current = el.scrollTop;
            setShowJump(!nearBottom.current);
          }}
        >
          {!hasMessages ? (
            <div className="rc-chat-empty">
              <span className="rc-chat-glyph" aria-hidden="true">Ж</span>
              <h2>¿En qué estás pensando?</h2>
              <div className="rc-chat-mode">
                {pendingAssistant ? (
                  <>
                    <span className="rc-hint">Con asistente:</span>
                    <AssistantChip name={pendingAssistant.name} onView={() => setPreview({assistant: pendingAssistant, choose: false})} onClear={() => setPendingAssistant(null)} />
                  </>
                ) : (
                  <>
                    <span className="rc-hint">Chat neutro, sin instrucciones guardadas.</span>
                    <AssistantMenu onPick={a => setPreview({assistant: a, choose: true})} />
                  </>
                )}
              </div>
              <ul className="rc-suggestions" aria-label="Sugerencias para empezar">
                {suggestions.map(s => (
                  <li key={s.title}>
                    <button type="button" onClick={() => { setText(s.prompt); textarea.current?.focus(); }}>
                      <span>{s.title}</span>
                      <ArrowUpRight aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rc-chat-column">
              {chat?.conversions.length ? (
                <p className="rc-chat-links">
                  <span>Proyectos creados desde este chat:</span>
                  {chat.conversions.map(c => (
                    <a key={c.projectId} href={'/workspace?studio=' + c.destination + '&project=' + encodeURIComponent(c.projectId)}>
                      {c.name}<ArrowUpRight aria-hidden="true" />
                    </a>
                  ))}
                </p>
              ) : null}
              {chat?.messages.map((m, i) => {
                const isLast = i === chat.messages.length - 1;
                const streaming = m.status === 'streaming';
                const failed = m.status === 'error' || (m.role === 'assistant' && m.status === 'done' && !m.content && !m.stopped);
                return (
                  <article
                    key={m.id}
                    className={'rc-msg rc-msg--' + m.role}
                    data-last={isLast ? 'true' : undefined}
                    aria-label={m.role === 'user' ? 'Tu mensaje' : 'Respuesta'}
                  >
                    {m.role === 'user' ? (
                      <div className="rc-bubble"><p>{m.content}</p></div>
                    ) : m.content ? (
                      <MessageMarkdown content={m.content} />
                    ) : streaming ? (
                      <span className="rc-thinking" role="status"><span /><span /><span /><span className="sr-only">Preparando la respuesta</span></span>
                    ) : m.stopped ? (
                      <p className="rc-msg-quiet">Respuesta detenida.</p>
                    ) : null}

                    {failed ? (
                      <div className="rc-msg-error" role={isLast ? 'alert' : undefined}>
                        <span className="rc-dot rc-dot--danger" aria-hidden="true" />
                        <span className="rc-msg-error-text">No pude terminar esta respuesta.</span>
                        {isLast ? (
                          <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" disabled={busy} onClick={() => requestRegenerate()}>
                            Reintentar
                          </button>
                        ) : null}
                        {m.error ? (
                          <details className="rc-msg-error-details">
                            <summary>Detalles</summary>
                            <p>{errorDetails[m.error] || 'El modelo no completó la respuesta. Revisá el modelo elegido o probá más tarde.'}</p>
                          </details>
                        ) : null}
                      </div>
                    ) : null}

                    {!streaming ? (
                      <footer className="rc-msg-foot">
                        <div className="rc-msg-actions">
                          {m.content ? (
                            <Tip label={copied === m.id ? 'Copiado' : 'Copiar'}>
                              <button type="button" className="rc-icon-btn rc-icon-btn--sm" onClick={() => copy(m)} aria-label={copied === m.id ? 'Mensaje copiado' : 'Copiar mensaje'}>
                                {copied === m.id ? <Check /> : <Copy />}
                              </button>
                            </Tip>
                          ) : null}
                          {m.role === 'assistant' && isLast && !failed ? (
                            <Tip label="Regenerar">
                              <button type="button" className="rc-icon-btn rc-icon-btn--sm" disabled={busy} onClick={() => requestRegenerate()} aria-label="Regenerar respuesta">
                                <RotateCcw />
                              </button>
                            </Tip>
                          ) : null}
                          <Menu>
                            <MenuTrigger asChild>
                              <button type="button" className="rc-icon-btn rc-icon-btn--sm" disabled={busy} aria-label="Más acciones del mensaje"><MoreHorizontal /></button>
                            </MenuTrigger>
                            <MenuContent align="start">
                              {m.role === 'assistant' && isLast && otherModels.length ? (
                                <>
                                  <MenuLabel>Regenerar con</MenuLabel>
                                  {otherModels.map(o => (
                                    <MenuItem key={o.id} onSelect={() => requestRegenerate(o.id)}>{modelLabel(o.name)}</MenuItem>
                                  ))}
                                  <MenuSeparator />
                                </>
                              ) : null}
                              <MenuItem danger onSelect={() => setDeleteId(m.id)}>Borrar mensaje</MenuItem>
                            </MenuContent>
                          </Menu>
                        </div>
                        <span className="rc-msg-meta">
                          {m.role === 'assistant' && m.model ? <span>{modelLabel(m.model)}</span> : null}
                          {formatTime(m.createdAt)}
                          {m.role === 'assistant' && m.credits !== undefined ? (
                            <Tip label="Costo informado por Kie"><span tabIndex={0}>{credits(m.credits)}</span></Tip>
                          ) : null}
                          {m.stopped && m.content ? <span>Detenida</span> : null}
                        </span>
                        {copied === 'failed:' + m.id ? <span className="rc-msg-note" role="status">No se pudo copiar. Seleccioná el texto a mano.</span> : null}
                      </footer>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </div>
        {showJump && hasMessages ? (
          <button type="button" className="rc-jump" onClick={jump} aria-label="Ir al último mensaje"><ArrowDown /></button>
        ) : null}
      </div>

      <div ref={composer} className="rc-composer-zone">
        <div className="rc-composer-column">
          {isError ? (
            <div className="rc-notice" role="alert">
              <span className="rc-dot rc-dot--danger" aria-hidden="true" />
              <span>No pude cargar los modelos.</span>
              <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" disabled={isFetching} onClick={() => refetch()}>Reintentar</button>
            </div>
          ) : !isPending && !models.length ? (
            <div className="rc-notice" role="status">
              <span className="rc-dot" aria-hidden="true" />
              <span>No hay modelos de Kie configurados en el servidor.</span>
            </div>
          ) : storageError ? (
            <div className="rc-notice" role="alert">
              <span className="rc-dot rc-dot--danger" aria-hidden="true" />
              <span>{storageError}</span>
            </div>
          ) : null}

          <form className="rc-composer" onSubmit={e => { e.preventDefault(); requestSend(); }}>
            <label className="sr-only" htmlFor="personal-message">Tu mensaje</label>
            <TextareaAutosize
              ref={textarea}
              id="personal-message"
              className="rc-composer-input"
              minRows={1}
              maxRows={8}
              value={text}
              disabled={!hydrated}
              maxLength={20000}
              placeholder="Escribí tu mensaje"
              onChange={e => setText(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <div className="rc-composer-bar">
              <ChatModelPicker models={allModels} value={selectedModel} onChange={chooseModel} disabled={busy || !models.length} />
              <div className="rc-composer-spacer" />
              <label className="rc-ask" htmlFor="ask-first">
                <span className="rc-ask-label">Preguntar antes</span>
                <Switch id="ask-first" checked={askFirst} onCheckedChange={changeAskFirst} />
              </label>
              {busy ? (
                <Tip label="Detener">
                  <button type="button" className="rc-send rc-send--stop" aria-label="Detener respuesta" onClick={stop}><Square /></button>
                </Tip>
              ) : (
                <Tip label="Enviar" shortcut="Enter">
                  <button type="submit" className="rc-send" aria-label="Enviar mensaje" disabled={!canSend}><ArrowUp /></button>
                </Tip>
              )}
            </div>
          </form>
        </div>
      </div>

      <ConfirmDialog
        open={confirmSend}
        onClose={() => setConfirmSend(false)}
        onConfirm={() => { setConfirmSend(false); void send(); }}
        title="¿Enviar este mensaje?"
        description="Se envía tu mensaje y el historial de este chat a Kie. Puede consumir créditos."
        confirmLabel="Enviar"
        busy={busy}
      >
        <dl className="rc-facts">
          <dt>Modelo</dt><dd>{modelName(selectedModel)}</dd>
          <dt>Asistente</dt><dd>{chat?.assistant?.name || pendingAssistant?.name || 'Ninguno (chat neutro)'}</dd>
        </dl>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(confirmRegenerate)}
        onClose={() => setConfirmRegenerate(null)}
        onConfirm={() => { setConfirmRegenerate(null); void send(true); }}
        title="¿Generar la respuesta de nuevo?"
        description="Es una solicitud nueva a Kie y puede consumir créditos. Reemplaza la última respuesta."
        confirmLabel="Generar de nuevo"
        busy={busy}
      >
        <dl className="rc-facts"><dt>Modelo</dt><dd>{modelName(confirmRegenerate || selectedModel)}</dd></dl>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(deleteId)}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { if (chat && deleteId && removeMessage(chat.id, deleteId)) setDeleteId(null); }}
        title="¿Borrar este mensaje?"
        description="Se elimina de este chat. Los proyectos ya creados conservan su copia."
        confirmLabel="Borrar mensaje"
        tone="danger"
      />

      <AssistantPreview
        assistant={preview?.assistant || null}
        models={allModels}
        onClose={() => setPreview(null)}
        onUse={preview?.choose ? () => chooseAssistant(preview.assistant) : undefined}
      />

      {chat ? <ConvertChat key={chat.id} chat={chat} open={conversion} onClose={() => setConversion(false)} onCreated={onCreated} /> : null}
    </div>
  );
}
