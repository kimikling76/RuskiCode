'use client';
import {Fragment, useState, type ReactNode} from 'react';
import {Sparkles} from 'lucide-react';
import {aspectRatios, imageModel, ratioValue, type AspectRatio} from '@/lib/cinema/capabilities';
import {imageModels, videoModels, publicModel} from '@/lib/ai/models';
import {ChatModelPicker} from '@/components/studio/chat-model-picker';
import {useCinemaUi} from '@/store/cinema-ui';
import {ConfirmDialog} from '@/components/ui/dialog';
import {Switch} from '@/components/ui/switch';

export function Field({label, hint, children, action}: {label: string; hint?: ReactNode; children: ReactNode; action?: ReactNode}) {
  return (
    <div className="rc-cine-field">
      <div className="rc-cine-field-head"><span>{label}</span>{action}</div>
      {children}
      {hint ? <p className="rc-hint">{hint}</p> : null}
    </div>
  );
}

export function Segmented<T extends string | number>({name, label, options, value, onChange, disabled}: {name: string; label: string; options: {value: T; label: string}[]; value: T; onChange: (value: T) => void; disabled?: boolean}) {
  return (
    <div className="rc-segmented rc-segmented--compact" role="radiogroup" aria-label={label}>
      {options.map(o => (
        <label key={String(o.value)}>
          <input type="radio" name={name} checked={value === o.value} disabled={disabled} onChange={() => onChange(o.value)} />
          <strong>{o.label}</strong>
        </label>
      ))}
    </div>
  );
}

export const aspectName = (a: string) => a === 'auto' ? 'Automático' : a === 'adaptive' ? 'Se adapta a la imagen' : a;

/** Kie's size names («landscape_16_9», «square_hd») read as words; other values stay as Kie writes them. */
export function optionLabel(value: string) {
  const m = value.match(/^(square|portrait|landscape)(?:_(hd|\d+)_?(\d+)?)?$/);
  if (!m) return value;
  const shape = {square: 'Cuadrado', portrait: 'Vertical', landscape: 'Horizontal'}[m[1] as 'square'];
  return m[3] ? shape + ' ' + (m[1] === 'portrait' ? m[3] + ':' + m[2] : m[2] + ':' + m[3]) : m[2] === 'hd' ? shape + ' HD' : shape;
}

/** Each ratio is drawn to scale inside the same 22px box. */
export function AspectPicker({value, onChange, name = 'aspect', disabled, options = aspectRatios}: {value: AspectRatio; onChange: (v: AspectRatio) => void; name?: string; disabled?: boolean; options?: readonly AspectRatio[]}) {
  return (
    <div className="rc-aspects" role="radiogroup" aria-label="Formato">
      {options.map(a => {
        const r = ratioValue(a);
        const w = r >= 1 ? 22 : Math.round(22 * r);
        const h = r >= 1 ? Math.round(22 / r) : 22;
        const word = !/^\d/.test(a);
        return (
          <label key={a} className="rc-aspect" title={aspectName(a)}>
            <input type="radio" name={name} checked={value === a} disabled={disabled} onChange={() => onChange(a)} />
            <span className="rc-aspect-shape" data-auto={word ? 'true' : undefined} style={{width: w, height: h}} aria-hidden="true" />
            <span className="rc-aspect-label">{a === 'auto' ? 'Auto' : a === 'adaptive' ? 'Adapt.' : a}</span>
          </label>
        );
      })}
    </div>
  );
}

/** Image or video model picker from the catalog: verified models are selectable, the rest are listed as «No verificado». */
export function MediaModelPicker({category, value, onChange}: {category: 'image' | 'video'; value: string; onChange: (id: string) => void}) {
  const models = (category === 'image' ? imageModels : videoModels).map(m => publicModel(m, true));
  return <div className="rc-cine-model-picker"><ChatModelPicker models={models} value={value} onChange={onChange} category={category} allowAuto={false} title={category === 'image' ? 'Modelo de imagen' : 'Modelo de video'} /></div>;
}

export function ModelRow({detail}: {detail?: string}) {
  return (
    <div className="rc-cine-model">
      <span className="rc-model-icon" aria-hidden="true">G</span>
      <span className="rc-model-text">
        <strong>{imageModel.name}</strong>
        <small>{imageModel.provider} · vía Kie{detail ? ' · ' + detail : ''}</small>
      </span>
    </div>
  );
}

export function AssistantButton({onClick}: {onClick: () => void}) {
  return (
    <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm rc-cine-assist" onClick={onClick}>
      <Sparkles aria-hidden="true" />Ayuda con el prompt
    </button>
  );
}

/** «Preguntar antes» + the single primary action of a panel. Confirmation never shows a cost Kie has not reported. */
export function GenerateBar({label, disabled, facts, onGenerate}: {label: string; disabled?: boolean; facts: [string, string][]; onGenerate: () => void}) {
  const askFirst = useCinemaUi(s => s.askFirst);
  const setAskFirst = useCinemaUi(s => s.setAskFirst);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="rc-cine-generate">
      <label className="rc-ask" htmlFor="cinema-ask-first">
        <span className="rc-ask-label">Preguntar antes</span>
        <Switch id="cinema-ask-first" checked={askFirst} onCheckedChange={setAskFirst} />
      </label>
      <button type="button" className="rc-btn rc-btn--primary" disabled={disabled} onClick={() => askFirst ? setConfirm(true) : onGenerate()}>
        {label}
      </button>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => { setConfirm(false); onGenerate(); }}
        title="¿Generar en Kie?"
        description="Cada resultado es una tarea en Kie y consume créditos. El costo real aparece al terminar, cuando Kie lo informa."
        confirmLabel={label}
      >
        <dl className="rc-facts">
          {facts.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}
        </dl>
      </ConfirmDialog>
    </div>
  );
}
