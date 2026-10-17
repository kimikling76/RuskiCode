'use client';
import {useEffect, useMemo, useRef, useState} from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import {ArrowUp, Sparkles, Square, Trash2, X} from 'lucide-react';
import {toast} from 'sonner';
import {addDocMessages, clearDocThread, type DocMessage} from '@/lib/books/doc-chat';
import {docChatRequest} from '@/lib/ai/doc-chat-request';
import {draftToBlocks} from '@/lib/assistant/draft';
import {errorDetail} from '@/lib/cinema/errors';
import type {Block} from '@/lib/pipeline/types';
import {MessageMarkdown} from '@/components/studio/message-markdown';
import {ChatModelPicker} from '@/components/studio/chat-model-picker';
import {useDocThread, useStoredModel, useTextModels} from './use-doc-chat';
import {blockNames, blockSummary} from './editor-api';

export type InsertTarget = {id: string; label: string; hint: string; disabled?: string | null; run: (blocks: Block[]) => Promise<void> | void};

function Draft({message, targets}: {message: DocMessage; targets: InsertTarget[]}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const draft = useMemo(() => open ? draftToBlocks(message.content) : null, [open, message.content]);
  if (!open) return <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => setOpen(true)}>Revisar e insertar</button>;
  return (
    <div className="rc-create-draft">
      <p className="rc-hint">Así entra al documento ({draft!.blocks.length} {draft!.blocks.length === 1 ? 'bloque' : 'bloques'}):</p>
      <ol className="rc-create-blocks">
        {draft!.blocks.map(b => <li key={b.id}><strong>{blockNames[b.type]}</strong> {blockSummary(b)}</li>)}
      </ol>
      {draft!.notes.map(n => <small key={n} className="rc-assist-warn">{n}</small>)}
      <div className="rc-create-targets">
        {targets.map(t => (
          <button key={t.id} type="button" className="rc-btn rc-btn--secondary rc-btn--sm" title={t.disabled || t.hint} disabled={Boolean(busy) || Boolean(t.disabled) || !draft!.blocks.length}
            onClick={async () => { setBusy(t.id); try { await t.run(draft!.blocks.map(b => ({...b, id: crypto.randomUUID()}))); setOpen(false); } catch { toast('No se pudo insertar.'); } finally { setBusy(null); } }}>
            {busy === t.id ? 'Insertando…' : t.label}
          </button>
        ))}
        <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => setOpen(false)}>Cerrar</button>
      </div>
      {targets.map(t => t.disabled ? <small key={t.id} className="rc-hint">{t.label}: {t.disabled}</small> : null)}
    </div>
  );
}

/**
 * «Crear con IA»: a small chat with any verified Kie text model to write units, exercises, tables or explanations.
 * A text model returns text, not a PDF: the answer becomes the editor's blocks, and the editor or Stirling lays them out.
 */
export function CreateChat({doc, context, targets, onClose}: {doc: string; context: () => string; targets: InsertTarget[]; onClose: () => void}) {
  const messages = useDocThread(doc, 'create');
  const {models, failed} = useTextModels();
  const [model, setModel] = useStoredModel('rc-create-chat-model');
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState<{text: string; model?: string} | null>(null);
  const abort = useRef<AbortController | null>(null);
  const partial = useRef('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => { end.current?.scrollIntoView({block: 'nearest'}); }, [messages.length, streaming?.text]);

  async function send() {
    const clean = text.trim();
    if (!clean || streaming) return;
    setText('');
    const userMessage: DocMessage = {id: crypto.randomUUID(), thread: 'create', role: 'user', content: clean, createdAt: Date.now()};
    await addDocMessages(doc, [userMessage]);
    const turns = [...messages, userMessage].filter(m => m.content).slice(-12).map(m => ({role: m.role, content: m.content.slice(0, 12000)}));
    // The document's context goes with the first turn sent, as material.
    turns[0] = {...turns[0], content: context() + '\n\n' + turns[0].content};
    const controller = new AbortController();
    abort.current = controller;
    setStreaming({text: ''});
    partial.current = '';
    try {
      const answer = await docChatRequest({messages: turns, model, signal: controller.signal, onDelta: t => { partial.current = t; setStreaming(s => ({...s, text: t})); }});
      await addDocMessages(doc, [{id: crypto.randomUUID(), thread: 'create', role: 'assistant', content: answer.text, createdAt: Date.now(), ...(answer.model ? {model: answer.model} : {}), ...(answer.credits !== undefined ? {credits: answer.credits} : {})}]);
    } catch (e) {
      // A stopped answer keeps what arrived, so it can still be reviewed and inserted.
      if (controller.signal.aborted) {
        if (partial.current) await addDocMessages(doc, [{id: crypto.randomUUID(), thread: 'create', role: 'assistant', content: partial.current, createdAt: Date.now()}]);
      } else {
        await addDocMessages(doc, [{id: crypto.randomUUID(), thread: 'create', role: 'assistant', content: '', error: e instanceof Error ? e.message : 'PROVIDER_UNAVAILABLE', createdAt: Date.now()}]);
      }
    } finally {
      setStreaming(null);
    }
  }

  return (
    <aside className="rc-create" aria-label="Crear con IA">
      <header className="rc-create-head">
        <Sparkles aria-hidden="true" />
        <h2>Crear con IA</h2>
        {messages.length ? <button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label="Borrar esta conversación" onClick={() => void clearDocThread(doc, 'create')}><Trash2 /></button> : null}
        <button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label="Cerrar Crear con IA" onClick={onClose}><X /></button>
      </header>
      <div className="rc-create-thread" aria-live="polite">
        {!messages.length && !streaming ? (
          <div className="rc-create-empty">
            <p>Pedí una unidad, ejercicios, una tabla o una explicación. Después la revisás y la insertás donde quieras.</p>
            <p className="rc-hint">Un modelo de texto escribe texto: no crea el PDF. El estudio lo convierte en bloques y los arma {targets.some(t => t.id === 'pages') ? 'como páginas' : ''}. Las ilustraciones se generan aparte, con un modelo de imagen (bloque de imagen → «Generar con Cinema»).</p>
          </div>
        ) : null}
        {messages.map(m => m.role === 'user' ? <p key={m.id} className="rc-assist-user">{m.content}</p> : (
          <article key={m.id} className="rc-create-answer">
            {m.error ? <p className="rc-form-error" role="alert">{errorDetail(m.error)}</p> : <MessageMarkdown content={m.content} />}
            <small className="rc-assist-meta">{m.model ? m.model.name.replace(/\s*·\s*kie\s*$/i, '') : 'Respuesta interrumpida'}{m.credits !== undefined ? ' · Kie informó ' + m.credits.toLocaleString('es-AR') + ' créditos' : ''}</small>
            {!m.error && m.content ? <Draft message={m} targets={targets} /> : null}
          </article>
        ))}
        {streaming ? <article className="rc-create-answer" aria-busy="true">{streaming.text ? <MessageMarkdown content={streaming.text} /> : <p className="rc-assist-busy"><span className="rc-job-pulse" aria-hidden="true" />Escribiendo…</p>}</article> : null}
        <div ref={end} />
      </div>
      <form className="rc-assist-form" onSubmit={e => { e.preventDefault(); void send(); }}>
        <TextareaAutosize className="rc-textarea" minRows={2} maxRows={6} maxLength={8000} value={text} onChange={e => setText(e.target.value)}
          placeholder="«Creá dos ejercicios de A1 sobre presentarse»" aria-label="Mensaje para Crear con IA"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
        <div className="rc-assist-bar">
          {models.length ? <ChatModelPicker models={models} value={model} onChange={setModel} title="Modelo de Crear con IA" /> : <span className="rc-hint">{failed ? 'No se pudo leer la lista de modelos.' : 'Cargando modelos…'}</span>}
          {streaming ? (
            <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" onClick={() => abort.current?.abort()}><Square aria-hidden="true" />Detener</button>
          ) : (
            <button type="submit" className="rc-btn rc-btn--primary rc-btn--sm" disabled={!text.trim()} aria-label="Enviar"><ArrowUp aria-hidden="true" />Enviar</button>
          )}
        </div>
      </form>
    </aside>
  );
}
