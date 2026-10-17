'use client';
import {useEffect, useRef, useState} from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import type {Block} from '@/lib/pipeline/types';
import {textRequest, type TextPurpose} from '@/lib/ai/text-request';
import {chapterMessage, parseExercises, parseReview, parseRewrite, rewriteMessage, type Review} from '@/lib/books/assistant';
import {errorDetail} from '@/lib/cinema/errors';
import {useNotes} from '@/store/book-notes';
import {useAssistants, type Assistant} from '@/store/assistants';
import {AssistantSelect} from '@/components/studio/assistant-chooser';
import {blockSummary, type EditorApi} from './editor-api';

type Result =
  | {kind: 'review'; review: Review}
  | {kind: 'exercises'; blocks: Extract<Block, {type: 'exercise'}>[]}
  | {kind: 'rewrite'; blockId: string; field: 'text' | 'instruction'; before: string; after: string};

const severityName = {error: 'Error', warning: 'A revisar', info: 'Sugerencia'} as const;

function rewritable(block: Block | undefined): {field: 'text' | 'instruction'; value: string} | null {
  if (!block) return null;
  if (block.type === 'heading' || block.type === 'paragraph' || block.type === 'callout') return {field: 'text', value: block.text};
  if (block.type === 'exercise') return {field: 'instruction', value: block.instruction};
  return null;
}

/** Honest editorial help on the current chapter. Nothing changes until the author applies it. */
export function AssistantPanel({api, bookKey, onGoToBlock}: {api: EditorApi; bookKey: string; onGoToBlock: (id: string) => void}) {
  const index = api.selection.chapter;
  const chapter = api.book.chapters[index];
  const block = chapter?.blocks.find(b => b.id === api.selection.blockId);
  const target = rewritable(block);
  const addNotes = useNotes(s => s.add);
  const [busy, setBusy] = useState<TextPurpose | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [request, setRequest] = useState('');
  const [hidden, setHidden] = useState<number[]>([]);
  const abort = useRef<AbortController | null>(null);
  const [assistant, setAssistant] = useState<Assistant | null>(null);
  const hydrateAssistants = useAssistants(s => s.hydrate);
  useEffect(() => { hydrateAssistants(); }, [hydrateAssistants]);

  useEffect(() => { setResult(null); setError(''); setHidden([]); }, [index]);
  useEffect(() => () => abort.current?.abort(), []);

  if (!chapter) return <p className="rc-hint rc-pdf-empty">Elegí una página de un capítulo para pedir ayuda sobre él.</p>;

  async function ask(purpose: TextPurpose, content: string, read: (text: string) => Result | null) {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(purpose); setError(''); setResult(null); setHidden([]);
    try {
      const value = read(await textRequest(purpose, content, controller.signal, assistant));
      if (!value) throw Error('INVALID_ANSWER');
      setResult(value);
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'PROVIDER_UNAVAILABLE');
    } finally {
      setBusy(null);
    }
  }

  const ids = new Set(chapter.blocks.map(b => b.id));
  const review = () => ask('book-review', chapterMessage(api.book.spec, chapter), t => { const r = parseReview(t, ids); return r ? {kind: 'review', review: r} : null; });
  const exercises = () => ask('book-exercises', chapterMessage(api.book.spec, chapter), t => { const b = parseExercises(t); return b ? {kind: 'exercises', blocks: b as Extract<Block, {type: 'exercise'}>[]} : null; });
  const rewrite = () => {
    if (!block || !target) return;
    const before = target.value;
    void ask('book-rewrite', rewriteMessage(api.book.spec, before, request.trim() || 'Mejorá la claridad sin cambiar el contenido.'), t => { const after = parseRewrite(t); return after ? {kind: 'rewrite', blockId: block.id, field: target.field, before, after} : null; });
  };

  function saveAsNotes(items: Review['issues']) {
    addNotes(items.map(i => ({id: crypto.randomUUID(), book: bookKey, blockId: i.blockId || null, chapter: index, text: i.problem, suggestion: i.suggestion, severity: i.severity, author: 'Asistente', createdAt: Date.now()})));
  }

  return (
    <div className="rc-pdf-form">
      <div className="rc-pdf-form-head"><span className="rc-pdf-kind">Capítulo {index + 1} · {chapter.title}</span></div>
      <p className="rc-hint">Usa el modelo de chat de Kie con los datos de este libro (nivel, público, reglas). Puede consumir créditos. No cambia nada hasta que lo apliques.</p>
      <AssistantSelect scope="pdf" value={assistant?.id || null} onChange={setAssistant} />
      <div className="rc-pdf-assist-actions">
        <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" disabled={Boolean(busy)} onClick={() => void review()}>{busy === 'book-review' ? 'Revisando…' : 'Revisar la calidad pedagógica'}</button>
        <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" disabled={Boolean(busy)} onClick={() => void exercises()}>{busy === 'book-exercises' ? 'Preparando…' : 'Proponer ejercicios'}</button>
      </div>

      <div className="rc-field">
        <span>Mejorar el bloque elegido</span>
        {target ? (
          <>
            <p className="rc-pdf-quote">{blockSummary(block!)}</p>
            <TextareaAutosize className="rc-textarea rc-pdf-text" minRows={1} maxRows={4} maxLength={1000} value={request} onChange={e => setRequest(e.target.value)} placeholder="Qué cambiar: «más simple para A1», «revisá los acentos tónicos»" />
            <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" disabled={Boolean(busy)} onClick={rewrite}>{busy === 'book-rewrite' ? 'Reescribiendo…' : 'Proponer cambio'}</button>
          </>
        ) : <p className="rc-hint">Elegí un título, párrafo, recuadro o consigna en la página.</p>}
      </div>

      {error ? (
        <div className="rc-msg-error" role="alert">
          <span className="rc-dot rc-dot--danger" aria-hidden="true" />
          <span className="rc-msg-error-text">No pude completar el pedido.</span>
          <details className="rc-msg-error-details"><summary>Detalles</summary><p>{error === 'INVALID_ANSWER' ? 'El modelo respondió con un formato inesperado. Probá de nuevo.' : errorDetail(error)}</p></details>
        </div>
      ) : null}

      {result?.kind === 'review' ? (
        <section className="rc-pdf-result" aria-label="Revisión">
          <p className="rc-pdf-result-summary">{result.review.summary}</p>
          {result.review.issues.length ? (
            <>
              <ul className="rc-pdf-issues">
                {result.review.issues.map((issue, i) => hidden.includes(i) ? null : (
                  <li key={i} data-severity={issue.severity}>
                    <span className="rc-pdf-issue-head"><span className="rc-pdf-sev" aria-hidden="true" />{severityName[issue.severity]}{issue.blockId ? ' · ' + blockSummary(chapter.blocks.find(b => b.id === issue.blockId)!).slice(0, 40) : ' · Capítulo'}</span>
                    <p>{issue.problem}</p>
                    {issue.suggestion ? <p className="rc-pdf-suggestion">{issue.suggestion}</p> : null}
                    <span className="rc-pdf-inline">
                      {issue.blockId ? <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => onGoToBlock(issue.blockId!)}>Ver</button> : null}
                      <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => { saveAsNotes([issue]); setHidden(h => [...h, i]); }}>Guardar como nota</button>
                      <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => setHidden(h => [...h, i])}>Descartar</button>
                    </span>
                  </li>
                ))}
              </ul>
              <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => { saveAsNotes(result.review.issues.filter((_, i) => !hidden.includes(i))); setHidden(result.review.issues.map((_, i) => i)); }}>Guardar todas como notas</button>
            </>
          ) : <p className="rc-hint">No encontró problemas concretos.</p>}
        </section>
      ) : result?.kind === 'exercises' ? (
        <section className="rc-pdf-result" aria-label="Ejercicios propuestos">
          {result.blocks.map((b, i) => hidden.includes(i) ? null : (
            <article key={b.id} className="rc-pdf-proposal">
              <strong>{b.instruction}</strong>
              <ol>{b.items.map((item, n) => <li key={n}>{item}</li>)}</ol>
              <span className="rc-pdf-inline">
                <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" onClick={() => { api.insertBlocks([{...b, id: crypto.randomUUID()}]); setHidden(h => [...h, i]); }}>Insertar</button>
                <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => setHidden(h => [...h, i])}>Descartar</button>
              </span>
            </article>
          ))}
        </section>
      ) : result?.kind === 'rewrite' ? (
        <section className="rc-pdf-result" aria-label="Cambio propuesto">
          <p className="rc-pdf-before"><span>Antes</span>{result.before}</p>
          <p className="rc-pdf-after"><span>Después</span>{result.after}</p>
          <span className="rc-pdf-inline">
            <button type="button" className="rc-btn rc-btn--primary rc-btn--sm" onClick={() => { api.updateBlock(result.blockId, {[result.field]: result.after} as Partial<Block>); setResult(null); }}>Aplicar</button>
            <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => setResult(null)}>Descartar</button>
          </span>
        </section>
      ) : null}
    </div>
  );
}
