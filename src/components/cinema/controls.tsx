'use client';
import {Fragment, useRef, useState, type MouseEvent, type KeyboardEvent, type ReactNode} from 'react';
import * as Popover from '@radix-ui/react-popover';
import {ChevronDown, Sparkles} from 'lucide-react';
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

/**
 * `onPick`: an option chosen on purpose, with a click or tap, Space or Enter. The arrow keys only move the choice
 * (browsers report them as clicks too, with no click count).
 */
const pickedByPointer = (onPick?: () => void) => onPick ? {onClick: (e: MouseEvent) => { if (e.detail > 0) setTimeout(onPick, 0); }} : {};
const pickedByKey = (onPick?: () => void) => onPick ? {
  onKeyUp: (e: KeyboardEvent) => { if (e.key === ' ') onPick(); },
  onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); onPick(); } },
} : {};

export function Segmented<T extends string | number>({name, label, options, value, onChange, disabled, onPick}: {name: string; label: string; options: {value: T; label: string}[]; value: T; onChange: (value: T) => void; disabled?: boolean; onPick?: () => void}) {
  return (
    <div className="rc-segmented rc-segmented--compact" role="radiogroup" aria-label={label}>
      {options.map(o => (
        <label key={String(o.value)} {...pickedByPointer(onPick)}>
          <input type="radio" name={name} checked={value === o.value} disabled={disabled} onChange={() => onChange(o.value)} {...pickedByKey(onPick)} />
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
export function AspectPicker({value, onChange, name = 'aspect', disabled, options = aspectRatios, onPick}: {value: AspectRatio; onChange: (v: AspectRatio) => void; name?: string; disabled?: boolean; options?: readonly AspectRatio[]; onPick?: () => void}) {
  return (
    <div className="rc-aspects" role="radiogroup" aria-label="Formato">
      {options.map(a => {
        const r = ratioValue(a);
        const w = r >= 1 ? 22 : Math.round(22 * r);
        const h = r >= 1 ? Math.round(22 / r) : 22;
        const word = !/^\d/.test(a);
        return (
          <label key={a} className="rc-aspect" title={aspectName(a)} {...pickedByPointer(onPick)}>
            <input type="radio" name={name} checked={value === a} disabled={disabled} onChange={() => onChange(a)} {...pickedByKey(onPick)} />
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

/**
 * A setting of the generation composer. The chip always shows the chosen value; its options open next to it. A click
 * (or Space) on an option chooses it and closes them; the arrow keys move the choice and leave them open.
 */
export function SettingChip({label, valueText, value, hint, wide, disabled, children}: {label: string; valueText: string; value?: ReactNode; hint?: ReactNode; wide?: boolean; disabled?: boolean; children: (close: () => void) => ReactNode}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" className="rc-chip-setting" disabled={disabled}>
          {/* The name read aloud is the visible text: the label (hidden, not removed, on narrow screens) and the value. */}
          <span className="rc-chip-setting-label">{label} </span>
          <strong>{value ?? valueText}</strong>
          <ChevronDown aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={'rc-popover rc-layer rc-chip-pop' + (wide ? ' rc-chip-pop--wide' : '')}
          side="top" align="start" sideOffset={8} collisionPadding={12} aria-label={label}
          // The chosen option gets the focus, so the arrow keys start from it.
          onOpenAutoFocus={e => { e.preventDefault(); const box = e.currentTarget as HTMLElement; (box.querySelector<HTMLElement>('input:checked') || box.querySelector<HTMLElement>('input, button'))?.focus(); }}
        >
          <p className="rc-chip-pop-title">{label}</p>
          {children(() => setOpen(false))}
          {hint ? <p className="rc-hint">{hint}</p> : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** «Preguntar antes», with its label always visible. */
export function AskFirst({id = 'cinema-ask-first'}: {id?: string}) {
  const askFirst = useCinemaUi(s => s.askFirst);
  const setAskFirst = useCinemaUi(s => s.setAskFirst);
  return (
    <label className="rc-ask" htmlFor={id}>
      <span className="rc-ask-label">Preguntar antes</span>
      <Switch id={id} checked={askFirst} onCheckedChange={setAskFirst} />
    </label>
  );
}

/**
 * Generating with «Preguntar antes» on asks first, with what will be sent. The confirmation never shows a cost Kie has
 * not reported. `onGenerate` returns the request's promise: until it settles a second click (a double click, say) is
 * ignored, so one request is never sent, and paid, twice. `busy` is true meanwhile.
 */
export function useGenerateConfirm({label, facts, onGenerate}: {label: string; facts: [string, string][]; onGenerate: () => unknown}) {
  const askFirst = useCinemaUi(s => s.askFirst);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const run = () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    Promise.resolve().then(onGenerate).catch(() => {}).finally(() => { inFlight.current = false; setBusy(false); });
  };
  const dialog = (
    <ConfirmDialog
      open={confirm}
      onClose={() => setConfirm(false)}
      onConfirm={() => { setConfirm(false); run(); }}
      title="¿Generar en Kie?"
      description="Cada resultado es una tarea en Kie y consume créditos. El costo real aparece al terminar, cuando Kie lo informa."
      confirmLabel={label}
    >
      <dl className="rc-facts">
        {facts.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}
      </dl>
    </ConfirmDialog>
  );
  return {request: () => { if (!inFlight.current) { if (askFirst) setConfirm(true); else run(); } }, dialog, busy};
}

/** «Preguntar antes» + the single primary action of a panel. */
export function GenerateBar({label, disabled, facts, onGenerate}: {label: string; disabled?: boolean; facts: [string, string][]; onGenerate: () => unknown}) {
  const {request, dialog, busy} = useGenerateConfirm({label, facts, onGenerate});
  return (
    <div className="rc-cine-generate">
      <AskFirst />
      <button type="button" className="rc-btn rc-btn--primary" disabled={disabled || busy} onClick={request}>
        {label}
      </button>
      {dialog}
    </div>
  );
}
