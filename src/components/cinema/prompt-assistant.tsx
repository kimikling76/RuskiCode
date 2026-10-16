'use client';
import {useEffect, useRef, useState} from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import {Dialog} from '@/components/ui/dialog';
import {textRequest} from '@/lib/cinema/client';
import {errorDetail} from '@/lib/cinema/errors';

/** Turns a rough idea into one concrete prompt with the chat model. It never generates an image. */
export function PromptAssistant({open, onClose, initial, onUse}: {open: boolean; onClose: () => void; initial: string; onUse: (prompt: string) => void}) {
  const [idea, setIdea] = useState(initial);
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);

  useEffect(() => { if (open) { setIdea(initial); setResult(''); setError(''); } }, [open]); // reset on every opening
  useEffect(() => () => abort.current?.abort(), []);

  async function propose() {
    if (!idea.trim() || busy) return;
    setBusy(true); setError('');
    const controller = new AbortController();
    abort.current = controller;
    try {
      setResult(await textRequest('prompt', idea.trim(), controller.signal));
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'PROVIDER_UNAVAILABLE');
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }

  function close() { abort.current?.abort(); onClose(); }

  return (
    <Dialog open={open} onClose={close} title="Ayuda con el prompt" description="Contá la idea con tus palabras. El modelo de chat propone un prompt concreto; vos lo revisás. No genera imágenes.">
      <div className="rc-dialog-body">
        <label className="rc-field">
          <span>Idea</span>
          <TextareaAutosize className="rc-textarea" minRows={3} maxRows={8} value={idea} disabled={busy} onChange={e => setIdea(e.target.value)} placeholder="Una calle de Moscú en invierno, de noche, con una panadería iluminada" />
        </label>
        <div className="rc-step-inline">
          <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" disabled={busy || !idea.trim()} onClick={propose}>{busy ? 'Pensando…' : result ? 'Proponer otro' : 'Proponer prompt'}</button>
          <p className="rc-hint">Usa el modelo de chat de Kie y puede consumir créditos.</p>
        </div>
        {error ? (
          <div className="rc-msg-error" role="alert">
            <span className="rc-dot rc-dot--danger" aria-hidden="true" />
            <span className="rc-msg-error-text">No pude proponer un prompt.</span>
            <details className="rc-msg-error-details"><summary>Detalles</summary><p>{errorDetail(error)}</p></details>
          </div>
        ) : null}
        {result ? (
          <label className="rc-field">
            <span>Propuesta</span>
            <TextareaAutosize className="rc-textarea" minRows={3} maxRows={10} value={result} onChange={e => setResult(e.target.value)} />
          </label>
        ) : null}
      </div>
      <div className="rc-dialog-footer rc-dialog-footer--end">
        <button type="button" className="rc-btn rc-btn--ghost" onClick={close}>Cancelar</button>
        <button type="button" className="rc-btn rc-btn--primary" disabled={!result.trim()} onClick={() => { onUse(result.trim()); onClose(); }}>Usar este prompt</button>
      </div>
    </Dialog>
  );
}
