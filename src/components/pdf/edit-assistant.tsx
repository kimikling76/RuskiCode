'use client';
import {useEffect, useRef, useState} from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import {ArrowUp, Eye, Trash2} from 'lucide-react';
import {addDocMessages, clearDocThread, type DocMessage} from '@/lib/books/doc-chat';
import type {BookContext, PdfContext} from '@/lib/assistant/edit-plan';
import {errorDetail} from '@/lib/cinema/errors';
import {usePersonal} from '@/store/personal-chat';
import {ChatModelPicker} from '@/components/studio/chat-model-picker';
import {useDocThread, useStoredModel, useTextModels} from './use-doc-chat';

const statusText: Record<NonNullable<DocMessage['status']>, string> = {
  proposed: 'Propuesta sin aplicar', applied: 'Aplicada', discarded: 'Descartada', failed: 'No se pudo aplicar', unsupported: 'Sin cambios',
};
const errors: Record<string, string> = {
  INVALID_ANSWER: 'El modelo respondió con un formato inesperado; no se aplicó nada. Probá de nuevo o con otro modelo.',
  REQUEST_TOO_LARGE: 'La página o el capítulo tienen demasiado texto para enviarlo. Elegí un bloque o una página más corta.',
  INVALID_REQUEST: 'El pedido no es válido.',
};

/**
 * The editing assistant: the author writes what to change; a Kie model proposes it with the editor's tools;
 * the server checks the proposal; the author previews the real result and confirms. History stays with the document.
 */
export function EditAssistant({kind, doc, contextLabel, buildContext, describe, onReview, reviewing, disabled, examples}: {
  kind: 'pdf' | 'book'; doc: string; contextLabel: string;
  buildContext: () => Promise<PdfContext | BookContext | null>;
  describe: (action: unknown) => string;
  onReview: (message: DocMessage) => void;
  reviewing: string | null;
  disabled?: string | null;
  examples: string[];
}) {
  const messages = useDocThread(doc, 'assistant');
  const {models, failed} = useTextModels();
  const [model, setModel] = useStoredModel('rc-edit-assistant-model');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => { end.current?.scrollIntoView({block: 'nearest'}); }, [messages.length]);
  const usable = models.filter(m => m.available !== false && m.status !== 'unverified');

  async function send(instruction: string) {
    const clean = instruction.trim();
    if (!clean || busy) return;
    const context = await buildContext();
    if (!context) return;
    setBusy(true);
    setText('');
    const requestId = crypto.randomUUID();
    const history = messages.slice(-6).map(m => ({role: m.role, content: (m.content || (m.error ? '(error)' : '')).slice(0, 4000) || '—'}));
    await addDocMessages(doc, [{id: crypto.randomUUID(), thread: 'assistant', role: 'user', content: clean, createdAt: Date.now()}]);
    const controller = new AbortController();
    abort.current = controller;
    let reached = false, credits: number | undefined;
    try {
      const r = await fetch('/api/pdf/assistant', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({requestId, model, instruction: clean, context, history}), signal: controller.signal});
      const body = await r.json().catch(() => ({}));
      reached = r.ok || Boolean(body.model);
      credits = typeof body.credits === 'number' ? body.credits : undefined;
      const answer: DocMessage = {id: crypto.randomUUID(), thread: 'assistant', role: 'assistant', content: '', createdAt: Date.now(), ...(body.model ? {model: body.model} : {}), ...(credits !== undefined ? {credits} : {})};
      if (!r.ok) {
        await addDocMessages(doc, [{...answer, error: typeof body.error === 'string' ? body.error : 'PROVIDER_UNAVAILABLE'}]);
        return;
      }
      const actions = (body.actions || []) as {action: unknown; warnings: string[]}[];
      await addDocMessages(doc, [{
        ...answer,
        content: String(body.reply || ''),
        plan: {actions: actions.map(a => a.action), warnings: actions.map(a => a.warnings || []), rejected: body.rejected || [], unsupported: body.unsupported || null},
        status: actions.length ? 'proposed' : 'unsupported',
      }]);
    } catch {
      if (!controller.signal.aborted) await addDocMessages(doc, [{id: crypto.randomUUID(), thread: 'assistant', role: 'assistant', content: '', createdAt: Date.now(), error: 'NETWORK'}]);
    } finally {
      if (reached) usePersonal.getState().charge(requestId, credits, {studio: 'pdf', label: 'Asistente de edición'});
      setBusy(false);
    }
  }

  return (
    <div className="rc-pdf-form rc-assist">
      <div className="rc-assist-head">
        <span className="rc-pdf-kind">{contextLabel}</span>
        {messages.length ? <button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label="Borrar el historial del asistente" onClick={() => void clearDocThread(doc, 'assistant')}><Trash2 /></button> : null}
      </div>
      <p className="rc-hint">
        {kind === 'pdf'
          ? 'Propone cambios con las herramientas de Stirling. Ves el resultado real antes de aplicarlo y cada cambio queda como versión.'
          : 'Propone cambios en los bloques del libro. Ves el antes y el después, y se guarda una versión antes de aplicar.'} Usa un modelo de texto de Kie y puede consumir créditos.
      </p>

      <div className="rc-assist-thread" aria-live="polite">
        {messages.map(m => m.role === 'user' ? (
          <p key={m.id} className="rc-assist-user">{m.content}</p>
        ) : (
          <article key={m.id} className="rc-assist-answer" data-status={m.status || (m.error ? 'error' : undefined)}>
            {m.error ? (
              <p className="rc-form-error" role="alert">{errors[m.error] || errorDetail(m.error)}</p>
            ) : (
              <>
                {m.content ? <p>{m.content}</p> : null}
                {m.plan?.unsupported ? <p className="rc-assist-unsupported">{m.plan.unsupported}</p> : null}
                {m.plan?.actions.length ? (
                  <ul className="rc-assist-actions">
                    {m.plan.actions.map((a, i) => (
                      <li key={i}>
                        <span>{describe(a)}</span>
                        {m.plan!.warnings[i]?.map(w => <small key={w} className="rc-assist-warn">{w}</small>)}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {m.plan?.rejected.map(r => <small key={r} className="rc-assist-warn">{r}</small>)}
                {m.status === 'proposed' ? (
                  <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" disabled={Boolean(reviewing) || Boolean(disabled)} onClick={() => onReview(m)}>
                    <Eye aria-hidden="true" />{reviewing === m.id ? 'Preparando la vista previa…' : 'Ver vista previa'}
                  </button>
                ) : m.status && m.status !== 'unsupported' ? <span className="rc-assist-status">{statusText[m.status]}</span> : null}
              </>
            )}
            <small className="rc-assist-meta">{m.model ? m.model.name.replace(/\s*·\s*kie\s*$/i, '') : 'Asistente'}{m.credits !== undefined ? ' · Kie informó ' + m.credits.toLocaleString('es-AR') + ' créditos' : ''}</small>
          </article>
        ))}
        {busy ? <p className="rc-assist-busy" role="status"><span className="rc-job-pulse" aria-hidden="true" />Pensando la propuesta…</p> : null}
        <div ref={end} />
      </div>

      {!messages.length ? (
        <div className="rc-assist-examples" role="group" aria-label="Ejemplos">
          {examples.map(e => <button key={e} type="button" className="rc-chip" disabled={busy || Boolean(disabled)} onClick={() => setText(e)}>{e}</button>)}
        </div>
      ) : null}

      {disabled ? <p className="rc-hint" role="status">{disabled}</p> : null}
      <form className="rc-assist-form" onSubmit={e => { e.preventDefault(); void send(text); }}>
        <TextareaAutosize
          className="rc-textarea" minRows={2} maxRows={6} maxLength={2000} value={text} onChange={e => setText(e.target.value)} lang="es"
          placeholder={kind === 'pdf' ? '¿Qué querés cambiar? «Agregá una página de ejercicios después de esta»' : '¿Qué querés cambiar? «Insertá un cuadro de vocabulario»'}
          aria-label="Instrucción para el asistente" disabled={busy || Boolean(disabled)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(text); } }}
        />
        <div className="rc-assist-bar">
          {usable.length || models.length ? <ChatModelPicker models={models} value={model} onChange={setModel} title="Modelo del asistente" /> : <span className="rc-hint">{failed ? 'No se pudo leer la lista de modelos.' : 'Cargando modelos…'}</span>}
          <button type="submit" className="rc-btn rc-btn--primary rc-btn--sm" disabled={busy || !text.trim() || Boolean(disabled)} aria-label="Proponer cambio"><ArrowUp aria-hidden="true" />Proponer</button>
        </div>
      </form>
    </div>
  );
}
