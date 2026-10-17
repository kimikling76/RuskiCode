'use client';
import {useEffect, useRef, useState} from 'react';
import {usePersonal, type ConversionDraft, type PersonalChat, type StudioProject} from '@/store/personal-chat';
import {Dialog} from '@/components/ui/dialog';
import {sseData} from '@/lib/ai/sse';

type BriefResponse = {summary: string; objective: string; audience: string; level: string; style: string; constraints: string};

const destinations = [
  {id: 'pdf', name: 'PDF Studio', note: 'Libros y documentos'},
  {id: 'cinema', name: 'Cinema Studio', note: 'Imagen y video'},
] as const;

const types: Record<'pdf' | 'cinema', {id: string; name: string}[]> = {
  pdf: [{id: 'libro', name: 'Libro'}, {id: 'documento', name: 'Documento'}, {id: 'presentacion', name: 'Presentación'}],
  cinema: [{id: 'imagen', name: 'Imagen'}, {id: 'video', name: 'Video'}],
};

const modes: {id: ConversionDraft['mode']; name: string; note: string}[] = [
  {id: 'all', name: 'Todo', note: 'La conversación completa'},
  {id: 'summary', name: 'Resumen', note: 'Un resumen que revisás'},
  {id: 'selected', name: 'Algunos', note: 'Solo lo que marques'},
];

export function ConvertChat({chat, open, onClose, onCreated}: {chat: PersonalChat; open: boolean; onClose: () => void; onCreated: (p: StudioProject) => void}) {
  const convert = usePersonal(s => s.convert);
  const charge = usePersonal(s => s.charge);
  const storageError = usePersonal(s => s.error);
  const initial = (): ConversionDraft => ({name: chat.title, destination: 'pdf', projectType: 'documento', mode: 'all', selectedIds: [], brief: '', summary: ''});
  const [draft, setDraft] = useState<ConversionDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [usage, setUsage] = useState('');
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (open) { setDraft(initial()); setError(''); setUsage(''); } }, [open, chat.id]); // reset each time it opens

  function change(patch: Partial<ConversionDraft>) { setDraft(d => ({...d, ...patch})); }
  const selected = draft.mode === 'selected' ? chat.messages.filter(m => draft.selectedIds.includes(m.id)) : chat.messages;
  const canConfirm = !busy && Boolean(draft.name.trim()) && Boolean(draft.brief.trim()) && selected.length > 0 && (draft.mode !== 'summary' || Boolean(draft.summary.trim()));

  async function propose() {
    if (busy || !selected.length) return;
    setBusy(true); setError(''); setUsage('');
    const abort = new AbortController();
    controller.current = abort;
    const requestId = crypto.randomUUID();
    let text = '', done = false, accepted = false, credits: number | undefined;
    try {
      const r = await fetch('/api/personal-chat', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          requestId, purpose: 'brief', model: chat.model, destination: draft.destination, projectType: draft.projectType,
          messages: selected.filter(m => m.content.trim()).map(({role, content}) => ({role, content})),
        }),
        signal: abort.signal,
      });
      if (!r.ok) {
        const body = await r.json();
        throw Error(body.error === 'INVALID_REQUEST' ? 'El chat es demasiado largo. Elegí solo algunos mensajes.' : 'No pude proponer el brief. Podés escribirlo vos.');
      }
      accepted = true;
      if (!r.body) throw Error('No llegó ninguna respuesta. Podés escribir el brief vos.');
      for await (const frame of sseData(r.body)) {
        const e = JSON.parse(frame);
        if (e.type === 'delta') text += e.text;
        if (e.type === 'usage' && typeof e.usage?.credits === 'number') credits = e.usage.credits;
        if (e.type === 'error') throw Error('La propuesta se interrumpió. Puede haber consumo en los registros de Kie.');
        if (e.type === 'done') done = true;
      }
      if (!done) throw Error('La propuesta quedó incompleta. Puede haber consumo en los registros de Kie.');
      const raw = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const p = JSON.parse(raw) as BriefResponse;
      if (!['summary', 'objective', 'audience', 'level', 'style', 'constraints'].every(k => typeof p[k as keyof BriefResponse] === 'string')) {
        throw Error('La propuesta no tenía el formato esperado. Podés escribir el brief vos.');
      }
      change({
        brief: ['Objetivo: ' + p.objective, 'Público: ' + p.audience, 'Nivel: ' + p.level, 'Estilo: ' + p.style, 'Restricciones: ' + p.constraints].join('\n\n'),
        summary: p.summary,
      });
    } catch (e) {
      if (!abort.signal.aborted) setError(e instanceof Error && !(e instanceof SyntaxError) ? e.message : 'La propuesta no tenía el formato esperado. Podés escribir el brief vos.');
    } finally {
      if (accepted) {
        charge(requestId, credits, {studio: 'chat', label: 'Propuesta de brief'});
        if (credits !== undefined) setUsage('Kie informó ' + credits + (credits === 1 ? ' crédito.' : ' créditos.'));
      }
      setBusy(false);
      controller.current = null;
    }
  }

  function close() { controller.current?.abort(); onClose(); }

  return (
    <Dialog open={open} onClose={close} wide title="Convertir en proyecto" description="Nada se crea hasta que confirmes. El chat original se conserva.">
      <div className="rc-dialog-body rc-convert">
        <section className="rc-step">
          <h3><span className="rc-step-num">01</span>Destino</h3>
          <div className="rc-segmented" role="radiogroup" aria-label="Estudio de destino">
            {destinations.map(d => (
              <label key={d.id}>
                <input
                  type="radio" name="destination" value={d.id} disabled={busy}
                  checked={draft.destination === d.id}
                  onChange={() => change({destination: d.id, projectType: d.id === 'pdf' ? 'documento' : 'imagen', brief: '', summary: ''})}
                />
                <strong>{d.name}</strong>
                <small>{d.note}</small>
              </label>
            ))}
          </div>
          <div className="rc-step-row">
            <label className="rc-field">
              <span>Nombre del proyecto</span>
              <input className="rc-input" disabled={busy} maxLength={120} value={draft.name} onChange={e => change({name: e.target.value})} />
            </label>
            <div className="rc-field">
              <span id="convert-type">Tipo</span>
              <div className="rc-segmented rc-segmented--compact" role="radiogroup" aria-labelledby="convert-type">
                {types[draft.destination].map(t => (
                  <label key={t.id}>
                    <input type="radio" name="projectType" value={t.id} disabled={busy} checked={draft.projectType === t.id} onChange={() => change({projectType: t.id, brief: '', summary: ''})} />
                    <strong>{t.name}</strong>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="rc-step">
          <h3><span className="rc-step-num">02</span>Qué trasladar</h3>
          <div className="rc-segmented" role="radiogroup" aria-label="Contenido que se traslada">
            {modes.map(m => (
              <label key={m.id}>
                <input type="radio" name="mode" value={m.id} disabled={busy} checked={draft.mode === m.id} onChange={() => change({mode: m.id, brief: '', summary: ''})} />
                <strong>{m.name}</strong>
                <small>{m.note}</small>
              </label>
            ))}
          </div>
          {draft.mode === 'selected' ? (
            <fieldset className="rc-convert-messages">
              <legend className="sr-only">Mensajes que se trasladan</legend>
              {chat.messages.map(m => (
                <label key={m.id} className="rc-check">
                  <input
                    type="checkbox" disabled={busy}
                    checked={draft.selectedIds.includes(m.id)}
                    onChange={e => change({selectedIds: e.target.checked ? [...draft.selectedIds, m.id] : draft.selectedIds.filter(id => id !== m.id), brief: '', summary: ''})}
                  />
                  <span>
                    <strong>{m.role === 'user' ? 'Vos' : 'Respuesta'}</strong>
                    {m.content.slice(0, 240)}{m.content.length > 240 ? '…' : ''}
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}
        </section>

        <section className="rc-step">
          <h3><span className="rc-step-num">03</span>Brief</h3>
          <div className="rc-step-inline">
            <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" disabled={busy || !selected.length} onClick={propose}>
              {busy ? 'Preparando propuesta…' : 'Proponer con IA'}
            </button>
            <p className="rc-hint">Usa Kie y puede consumir créditos. No crea el proyecto.{usage ? ' ' + usage : ''}</p>
          </div>
          <label className="rc-field">
            <span>Objetivo, público, nivel, estilo y restricciones</span>
            <textarea
              className="rc-textarea" disabled={busy} rows={8} value={draft.brief}
              onChange={e => change({brief: e.target.value})}
              placeholder="Escribí el brief o pedí una propuesta."
            />
          </label>
          {draft.mode === 'summary' ? (
            <label className="rc-field">
              <span>Resumen que se guarda en el proyecto</span>
              <textarea className="rc-textarea" disabled={busy} rows={5} value={draft.summary} onChange={e => change({summary: e.target.value})} />
            </label>
          ) : null}
        </section>

        {error || storageError ? <p role="alert" className="rc-form-error">{error || storageError}</p> : null}
      </div>

      <div className="rc-dialog-footer">
        <p className="rc-hint">{draft.mode === 'summary' ? 'Se guardan el resumen y el brief, no una copia del chat.' : 'Los mensajes se copian al proyecto al confirmar.'}</p>
        <button type="button" className="rc-btn rc-btn--ghost" onClick={close}>Cancelar</button>
        <button
          type="button" className="rc-btn rc-btn--primary" disabled={!canConfirm}
          onClick={() => { const p = convert(chat.id, draft); if (p) { onClose(); onCreated(p); } }}
        >
          Crear proyecto
        </button>
      </div>
    </Dialog>
  );
}
