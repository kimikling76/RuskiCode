'use client';
import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import dynamic from 'next/dynamic';
import {useQuery} from '@tanstack/react-query';
import TextareaAutosize from 'react-textarea-autosize';
import {ArrowUp, ArrowDown, ArrowUpRight, Copy, Check, RotateCcw, Square, FolderPlus, Pencil, MoreHorizontal, Paperclip, X, SquareSlash, Globe} from 'lucide-react';
import {useAssistants, type Assistant} from '@/store/assistants';
import {AssistantMenu, AssistantPreview, AssistantChip, preferredModel} from './assistant-chooser';
import {usePersonal, type PersonalMessage, type StudioProject} from '@/store/personal-chat';
import {useChatDialogs} from './chat-dialogs';
import {ConvertChat} from './convert-chat';
import {ChatModelPicker, modelLabel, usable, type ChatModel} from './chat-model-picker';
import {NavTrigger} from './sidebar';
import {ConfirmDialog} from '@/components/ui/dialog';
import {Menu, MenuTrigger, MenuContent, MenuItem, MenuLink, MenuSeparator, MenuLabel} from '@/components/ui/menu';
import {Tip} from '@/components/ui/tooltip';
import {Switch} from '@/components/ui/switch';
import {sseData} from '@/lib/ai/sse';
import {acceptAttachments} from '@/lib/personal-chat/attach-browser';
import {AttachmentTray, MessageFiles, filesOf, useAttachments} from './chat-attachments';
import {SkillCard} from './skill-cards';
import {chatSkills, matchSkills, skillById, skillSummary, splitCommand, type MediaRef, type SkillId, type SkillRun} from '@/lib/skills/chat';
import {reviewText, writePdf} from '@/lib/skills/run';
import type {Source} from '@/lib/ai/types';
import {MessageSources, mergeSources} from './chat-sources';
import {bookForAssistant, bookForProject, usedOf} from '@/lib/kb/context';
import {BookUsedNote} from '@/components/kb/book-used';
import {BookChip, BookToggle} from '@/components/kb/book-toggle';
import type {ChatBook} from '@/lib/personal-chat/state';

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
  IMAGES_NOT_SUPPORTED: 'Este modelo no lee imágenes en Kie. Elegí uno que diga «lee imágenes» o quitá las imágenes.',
  ATTACHMENT_MISSING: 'Un archivo adjunto ya no está guardado en el estudio. Adjuntalo de nuevo.',
  UPLOAD_FAILED: 'No se pudo pasar la imagen a Kie. Probá de nuevo en un momento.',
  ATTACHMENTS_UNAVAILABLE: 'No se pudieron leer los archivos adjuntos en el servidor. Probá más tarde.',
  SEARCH_NOT_SUPPORTED: 'Este modelo no busca en la web en Kie. Elegí uno que diga «busca en la web» o apagá la búsqueda.',
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
  // Web search before the first message; afterwards it lives in the chat itself.
  const [search, setSearch] = useState(false);
  // «Contexto del libro» before the first message; afterwards it lives in the chat. Off unless the person turns it on.
  const [bookPick, setBookPick] = useState<ChatBook | null>(null);
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
  const fileInput = useRef<HTMLInputElement>(null);
  const files = useAttachments();
  const [dragging, setDragging] = useState(false);
  // The skill called with «/»: it stays chosen for the next messages until it is removed.
  const [skill, setSkill] = useState<SkillId | null>(null);
  // The chat a skill message just created keeps that skill chosen.
  const keepSkill = useRef(false);
  const [menu, setMenu] = useState<{open: boolean; index: number; dismissed: string | null}>({open: false, index: 0, dismissed: null});

  const {data: modelData, isError, isPending, refetch, isFetching} = useQuery<{models: ChatModel[]}>({
    queryKey: ['personal-kie-models'],
    queryFn: async () => { const r = await fetch('/api/personal-chat'); if (!r.ok) throw Error(); return r.json(); },
    staleTime: 60000,
  });
  const allModels = modelData?.models || [];
  // Only models that can really answer; unverified ones stay visible (disabled) in the picker.
  const models = allModels.filter(usable);
  const selectedModel = chat?.model || model;
  const hasMessages = Boolean(chat?.messages.length);
  const last = chat?.messages.at(-1);
  // «Automático» answers with the fast Gemini model (or the first available), as the server resolves it.
  const modelFor = (id: string) => id === 'auto' ? models.find(m => m.id === 'kie-flash') || models[0] : models.find(m => m.id === id);
  const effective = modelFor(selectedModel);
  // Search is asked only from models whose Kie page documents a search tool.
  const searchOn = chat ? Boolean(chat.webSearch) : search;
  const bookOn: ChatBook | null = chat ? chat.book || null : bookPick;
  const canSearch = Boolean(effective?.webSearch);
  // With an image or video skill, attached images are references for that model, not for the text model.
  const imagesBlocked = !skill && Boolean(effective) && files.ready.some(a => a.kind === 'image') && !effective!.inputs?.includes('image');
  const hasInput = Boolean(text.trim()) || files.ready.length > 0;
  const canSend = hydrated && !busy && !files.reading && !imagesBlocked && models.length > 0 && (skill === 'revisar-ruso' ? true : skill === 'pdf-generator' ? Boolean(text.trim()) : hasInput);
  // «/» at the start of the message opens the list of skills; typing filters it.
  const typed = /^\/[a-z-]*$/i.test(text) ? text : null;
  const menuItems = typed !== null ? matchSkills(typed) : menu.open ? [...chatSkills] : [];
  const menuOpen = (typed !== null && menu.dismissed !== typed && menuItems.length > 0) || menu.open;

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
    setText(''); files.clear(); setConversion(false); setConfirmSend(false); setConfirmRegenerate(null); setEditing(false); setPendingAssistant(null); setPreview(null);
    if (!keepSkill.current) setSkill(null);
    keepSkill.current = false;
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

  function changeBook(value: ChatBook | null) {
    if (chat) patch(chat.id, {book: value || undefined}); else setBookPick(value);
    textarea.current?.focus();
  }

  function changeSearch(value: boolean) {
    if (chat) patch(chat.id, {webSearch: value}); else setSearch(value);
    textarea.current?.focus();
  }

  function requestSend() {
    if (!canSend) return;
    // Image and video skills ask in their own card, with the model and options, before anything goes to Kie.
    const media = skill === 'image-generation' || skill === 'video-generation' || /^\/(image|video)-generation\b/.test(text.trim());
    if (askFirst && !media) setConfirmSend(true); else void send();
  }

  function requestRegenerate(withModel?: string) {
    if (busy || !chat) return;
    if (withModel && withModel !== chat.model) patch(chat.id, {model: withModel});
    if (askFirst) setConfirmRegenerate(withModel || chat.model || 'auto'); else void send(true);
  }

  function saveTitle() {
    if (chat && title.trim() && rename(chat.id, title)) setEditing(false);
  }

  function chooseSkill(id: SkillId) {
    setSkill(id);
    setMenu({open: false, index: 0, dismissed: null});
    setText(t => /^\/[a-z-]*$/i.test(t) ? '' : t);
    textarea.current?.focus();
  }

  /** A message to a skill: the user's line and the skill's card, which does the rest (with its own confirmation). */
  function sendSkill(id: SkillId, prompt: string) {
    const attached = files.ready;
    const existing = chat?.id;
    if (!existing) keepSkill.current = true;
    const chatId = existing || create(prompt || skillById(id)!.name);
    if (!chatId) return;
    const base = usePersonal.getState().data.chats.find(c => c.id === chatId)?.messages || [];
    const images: MediaRef[] = attached.filter(a => a.kind === 'image').map(a => ({kind: 'asset', hash: a.hash, mime: a.mime, name: a.name}));
    const documents = attached.filter(a => a.kind === 'document');
    const useSearch = searchOn && canSearch;
    const run: SkillRun = id === 'image-generation' ? {skill: id, prompt, model: '', aspect: '', resolution: '', count: 1, refs: images}
      : id === 'video-generation' ? {skill: id, prompt, model: '', aspect: '', resolution: '', duration: '', ...(images[0] ? {start: images[0]} : {})}
        : id === 'pdf-generator' ? {skill: id, request: prompt, state: 'writing', ...(useSearch ? {webSearch: true} : {})}
          : prompt || documents.length ? {skill: id, state: 'reviewing', source: {kind: 'text', text: prompt, documents: documents.length}, ...(useSearch ? {webSearch: true} : {})}
            : {skill: id, state: 'choose', source: {kind: 'unit', unitId: '', title: '', from: 1, to: 10}, ...(useSearch ? {webSearch: true} : {})};
    const now = new Date().toISOString();
    const user: PersonalMessage = {id: crypto.randomUUID(), role: 'user', content: prompt, command: id, createdAt: now, ...(attached.length ? {attachments: attached} : {})};
    const card: PersonalMessage = {id: crypto.randomUUID(), role: 'assistant', content: skillSummary(run), skill: run, status: 'done', createdAt: now};
    const selected = existing ? usePersonal.getState().data.chats.find(c => c.id === chatId)?.model || 'auto' : model;
    nearBottom.current = true;
    if (!patch(chatId, {messages: [...base, user, card], model: selected, ...(existing ? {} : {webSearch: search, ...(bookPick ? {book: bookPick} : {})})})) return;
    if (!existing) setBookPick(null);
    setText(''); files.clear();
    if (id === 'pdf-generator') void writePdf(chatId, card.id, selected);
    if (id === 'revisar-ruso' && run.skill === 'revisar-ruso' && run.state === 'reviewing') void reviewText(chatId, card.id, selected, attached);
  }

  async function send(isRegeneration = false) {
    if (!hydrated || sending.current) return;
    // «/image-generation …» typed in full works like choosing the skill.
    // A command typed at the start switches to that skill; otherwise the chosen one gets the message.
    const parsed = splitCommand(text);
    const called = isRegeneration ? {rest: ''} : parsed.skill ? parsed : skill ? {skill, rest: text.trim()} : parsed;
    if (called.skill) { setSkill(called.skill); sendSkill(called.skill, called.rest); return; }
    const prompt = text.trim();
    const attached = isRegeneration ? [] : files.ready;
    if (!prompt && !attached.length && !isRegeneration) return;
    const existing = chat?.id;
    const id = existing || create(prompt || attached[0]?.name);
    if (!id) return;
    let base = usePersonal.getState().data.chats.find(c => c.id === id)?.messages || [];
    if (isRegeneration) {
      let i = base.length - 1;
      while (i >= 0 && base[i].role !== 'user') i--;
      base = base.slice(0, i + 1);
      if (!base.length) return;
    } else {
      base = [...base, {id: crypto.randomUUID(), role: 'user', content: prompt, ...(attached.length ? {attachments: attached} : {}), createdAt: new Date().toISOString()}];
    }
    // Files go as references; the server reads them from the studio's stored files.
    // A skill's card goes as its one-line summary; the user's line keeps the command it called.
    const outbound = base.filter(m => m.content.trim() || m.attachments?.length).map(({role, content, attachments, command}) => ({role, content: command ? ('/' + command + ' ' + content).trim() : content, ...(role === 'user' && attachments?.length ? {attachments} : {})}));
    const messageId = crypto.randomUUID();
    const requestId = crypto.randomUUID();
    // A new chat uses the model chosen before it existed; an existing chat keeps its own.
    const selected = existing ? usePersonal.getState().data.chats.find(c => c.id === id)?.model || 'auto' : model;
    const wanted = existing ? Boolean(usePersonal.getState().data.chats.find(c => c.id === id)?.webSearch) : search;
    const useSearch = wanted && Boolean(modelFor(selected)?.webSearch);
    const assistant: PersonalMessage = {id: messageId, role: 'assistant', content: '', status: 'streaming', createdAt: new Date().toISOString(), ...(useSearch ? {webSearch: true} : {})};
    // The assistant applies only if it was chosen for this chat. Its current instructions are sent and kept.
    const chosen = existing ? usePersonal.getState().data.chats.find(c => c.id === id)?.assistant : pendingAssistant ? {id: pendingAssistant.id, name: pendingAssistant.name, instructions: pendingAssistant.instructions, mediaCatalog: pendingAssistant.mediaCatalog} : undefined;
    const live = chosen ? useAssistants.getState().assistants.find(a => a.id === chosen.id) : undefined;
    const active = chosen ? (live ? {id: live.id, name: live.name, instructions: live.instructions, mediaCatalog: live.mediaCatalog} : chosen) : undefined;
    nearBottom.current = true;
    lastScrollTop.current = log.current?.scrollTop || 0;
    if (!patch(id, {messages: [...base, assistant], model: selected, ...(active ? {assistant: active} : {}), ...(existing ? {} : {webSearch: search, ...(bookPick ? {book: bookPick} : {})})})) return;
    if (!existing) { setPendingAssistant(null); setBookPick(null); }
    const chatBook = existing ? usePersonal.getState().data.chats.find(c => c.id === id)?.book : bookPick;

    const chatId = id;
    sending.current = true; setBusy(true);
    if (!isRegeneration) { setText(''); files.clear(); }
    const controller = new AbortController();
    stoppedByUser.current = false;
    requestChat.current = chatId;
    abort.current = controller;
    let done = false, accepted = false, realCredits: number | undefined, content = '', modelName = '', sources: Source[] = [];

    function update(value: Partial<PersonalMessage>) {
      const current = usePersonal.getState().data.chats.find(c => c.id === chatId);
      if (current) patch(chatId, {messages: current.messages.map(m => m.id === messageId ? {...m, ...value} : m)});
    }

    try {
      // A book's data goes only when the person turned on «Contexto del libro» in this chat, or with an assistant they
      // linked to that book. The neutral Chat sends none.
      const lastUser = [...outbound].reverse().find(m => m.role === 'user')?.content || '';
      const book = chatBook ? await bookForProject(chatBook.project, {query: lastUser, cast: true}).catch(() => null)
        : active ? await bookForAssistant(active.id, {query: lastUser}).catch(() => null) : null;
      if (book) update({book: usedOf(book)});
      const r = await fetch('/api/personal-chat', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({requestId, purpose: 'chat', model: selected, messages: outbound, ...(active ? {assistant: {name: active.name, instructions: active.instructions, mediaCatalog: active.mediaCatalog}} : {}), ...(useSearch ? {webSearch: true} : {}), ...(book ? {book: book.payload} : {})}),
        signal: controller.signal,
      });
      if (!r.ok) { const e = await r.json(); throw Error(e.error); }
      accepted = true;
      if (!r.body) throw Error('PROVIDER_UNAVAILABLE');
      for await (const frame of sseData(r.body)) {
        const e = JSON.parse(frame);
        if (e.type === 'delta') { content += e.text; update({content}); }
        if (e.type === 'model') { modelName = e.name; update({model: e.name}); }
        if (e.type === 'sources' && Array.isArray(e.sources)) { sources = mergeSources(sources, e.sources); update({sources}); }
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
    if (menuOpen && menuItems.length && !e.nativeEvent.isComposing) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setMenu(m => ({...m, index: (m.index + step + menuItems.length) % menuItems.length}));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); chooseSkill(menuItems[Math.min(menu.index, menuItems.length - 1)].id); return; }
      if (e.key === 'Escape') { e.preventDefault(); setMenu({open: false, index: 0, dismissed: typed}); return; }
    }
    if (e.key === 'Backspace' && skill && !text) { setSkill(null); return; }
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
    <div
      ref={shell}
      className={'rc-chat' + (hasMessages ? '' : ' is-empty')}
      onDragOver={e => { if (hydrated && e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={e => { if (!e.dataTransfer.files.length) return; e.preventDefault(); setDragging(false); files.add(filesOf(e.dataTransfer)); textarea.current?.focus(); }}
    >
      {dragging ? <div className="rc-drop-overlay" aria-hidden="true"><Paperclip /><span>Soltá para adjuntar</span></div> : null}
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
              <div className="rc-skill-starters" role="group" aria-label="Skills">
                <span className="rc-hint">Skills (escribí «/»):</span>
                {chatSkills.map(sk => <button key={sk.id} type="button" className="rc-chip" onClick={() => chooseSkill(sk.id)} title={sk.description}><code>{sk.command}</code></button>)}
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
                      <div className="rc-bubble">
                        {m.command ? <code className="rc-skill-chip-inline">{skillById(m.command)?.command || '/' + m.command}</code> : null}
                        {m.attachments?.length ? <MessageFiles files={m.attachments} /> : null}
                        {m.content ? <p>{m.content}</p> : null}
                      </div>
                    ) : m.skill && chat ? (
                      <SkillCard chatId={chat.id} message={m} model={chat.model || 'auto'} attachments={chat.messages[i - 1]?.attachments} />
                    ) : m.content ? (
                      <>
                        <MessageMarkdown content={m.content} />
                        {m.sources?.length ? <MessageSources sources={m.sources} /> : null}
                      </>
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
                          {m.content && !m.skill ? (
                            <Tip label={copied === m.id ? 'Copiado' : 'Copiar'}>
                              <button type="button" className="rc-icon-btn rc-icon-btn--sm" onClick={() => copy(m)} aria-label={copied === m.id ? 'Mensaje copiado' : 'Copiar mensaje'}>
                                {copied === m.id ? <Check /> : <Copy />}
                              </button>
                            </Tip>
                          ) : null}
                          {m.role === 'assistant' && isLast && !failed && !m.skill ? (
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
                              {m.role === 'assistant' && isLast && otherModels.length && !m.skill ? (
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
                          {m.role === 'assistant' && m.webSearch ? <span>Con búsqueda web</span> : null}
                          {m.role === 'assistant' && m.book ? <BookUsedNote used={m.book} /> : null}
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

          {imagesBlocked ? (
            <div className="rc-notice" role="status">
              <span className="rc-dot rc-dot--danger" aria-hidden="true" />
              <span>{modelLabel(effective!.name)} no lee imágenes en Kie. Elegí un modelo que diga «lee imágenes» o quitá las imágenes.</span>
            </div>
          ) : null}
          {searchOn && effective && !canSearch && !skill?.endsWith('-generation') ? (
            <div className="rc-notice" role="status">
              <span className="rc-dot" aria-hidden="true" />
              <span>{modelLabel(effective.name)} no busca en la web en Kie: este mensaje va sin búsqueda. Elegí un modelo que diga «busca en la web» (Gemini o GPT).</span>
            </div>
          ) : null}
          {menuOpen ? (
            <div className="rc-skill-menu" role="listbox" id="skill-menu" aria-label="Skills">
              {menuItems.map((sk, k) => (
                <button
                  key={sk.id} type="button" role="option" id={'skill-option-' + sk.id} aria-selected={k === Math.min(menu.index, menuItems.length - 1)}
                  className="rc-skill-option" onMouseDown={e => e.preventDefault()} onClick={() => chooseSkill(sk.id)}
                >
                  <code>{sk.command}</code><strong>{sk.name}</strong><span>{sk.description}</span>
                </button>
              ))}
            </div>
          ) : null}
          <form className="rc-composer" onSubmit={e => { e.preventDefault(); requestSend(); }}>
            {skill ? (
              <div className="rc-skill-active">
                <code>{skillById(skill)!.command}</code><span>{skillById(skill)!.name}</span>
                <Tip label="Quitar la skill (el chat vuelve a ser neutro)"><button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label={'Quitar ' + skillById(skill)!.command} onClick={() => { setSkill(null); textarea.current?.focus(); }}><X /></button></Tip>
              </div>
            ) : null}
            {bookOn ? <BookChip value={bookOn} onClear={() => changeBook(null)} /> : null}
            <AttachmentTray drafts={files.drafts} onRemove={files.remove} />
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
              placeholder={skill ? skillById(skill)!.placeholder : 'Escribí tu mensaje (o «/» para una skill)'}
              role="combobox"
              aria-expanded={menuOpen}
              aria-controls={menuOpen ? 'skill-menu' : undefined}
              aria-autocomplete="list"
              aria-activedescendant={menuOpen && menuItems.length ? 'skill-option-' + menuItems[Math.min(menu.index, menuItems.length - 1)].id : undefined}
              onChange={e => { setText(e.target.value); setMenu(m => ({...m, index: 0, open: false})); }}
              onKeyDown={onKeyDown}
              onPaste={e => {
                // A pasted image (a screenshot, an image copied from a page) is attached; pasted text stays text.
                const pasted = filesOf(e.clipboardData);
                if (pasted.length && !e.clipboardData.getData('text/plain')) { e.preventDefault(); files.add(pasted); }
              }}
            />
            <div className="rc-composer-bar">
              <Tip label="Adjuntar imágenes o archivos">
                <button type="button" className="rc-icon-btn rc-attach-btn" aria-label="Adjuntar imágenes o archivos" disabled={!hydrated} onClick={() => fileInput.current?.click()}><Paperclip /></button>
              </Tip>
              <input ref={fileInput} type="file" multiple hidden accept={acceptAttachments} onChange={e => { files.add([...(e.target.files || [])]); e.target.value = ''; }} />
              <Tip label="Skills: generar imágenes o videos, crear páginas del manual, revisar el ruso">
                <button type="button" className="rc-icon-btn" aria-label="Elegir una skill" aria-pressed={menu.open} disabled={!hydrated} onClick={() => { setMenu(m => ({open: !m.open, index: 0, dismissed: null})); textarea.current?.focus(); }}><SquareSlash /></button>
              </Tip>
              <Tip label={searchOn ? 'Búsqueda web activada: el modelo puede consultar páginas y citarlas' : 'Buscar en la web (solo modelos que digan «busca en la web»)'}>
                <button type="button" className={'rc-icon-btn rc-search-btn' + (searchOn ? ' is-on' : '')} aria-label="Buscar en la web" aria-pressed={searchOn} disabled={!hydrated} onClick={() => changeSearch(!searchOn)}><Globe /></button>
              </Tip>
              <BookToggle value={bookOn} onChange={changeBook} disabled={!hydrated} />
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
          <dt>Búsqueda web</dt><dd>{searchOn && canSearch ? 'Sí' : 'No'}</dd>
          <dt>Contexto del libro</dt><dd>{bookOn ? '«' + bookOn.name + '»' : 'No'}</dd>
          {files.ready.length ? <><dt>Adjuntos</dt><dd>{files.ready.length}</dd></> : null}
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
