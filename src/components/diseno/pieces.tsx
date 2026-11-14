'use client';
import {useEffect, useState, type ReactNode} from 'react';
import * as RadixMenu from '@radix-ui/react-dropdown-menu';
import {AnimatePresence, motion} from 'framer-motion';
import {toast} from 'sonner';
import {Check, ChevronDown, Download, Maximize2, RotateCcw, Sparkles, Trash2} from 'lucide-react';
import {BorderBeam} from '@/components/ui/border-beam';
import {TextShimmer} from '@/components/ui/text-shimmer';
import {Dialog} from '@/components/ui/dialog';
import type {Tile as TileData} from './data';

// Shared pieces of the prototype: the pill with its small menu, the main key with the price inside, and the grid of
// results. Springs are short and the same everywhere; framer-motion's MotionConfig (in prototype.tsx) turns the travel
// off for people who asked their system for less motion.

export const spring = {type: 'spring', stiffness: 520, damping: 34, mass: 0.7} as const;
export const soft = {type: 'spring', stiffness: 260, damping: 26} as const;

export function usePhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const q = window.matchMedia('(max-width: 760px)');
    const set = () => setPhone(q.matches);
    set();
    q.addEventListener('change', set);
    return () => q.removeEventListener('change', set);
  }, []);
  return phone;
}

/** A pill that shows its value and changes it in a small menu that opens right there. */
export function Pill({label, value, options, onChange, icon}: {label: string; value: string; options: readonly string[]; onChange: (v: string) => void; icon?: ReactNode}) {
  if (!options.length) return null;
  return (
    <RadixMenu.Root>
      <RadixMenu.Trigger asChild>
        <button type="button" className="dz-pill" aria-label={label + ': ' + value}>{icon}<em>{label}</em><span>{value}</span><ChevronDown className="dz-pill-caret" aria-hidden="true" /></button>
      </RadixMenu.Trigger>
      <RadixMenu.Portal>
        <RadixMenu.Content className="dz-menu rc-layer" side="top" align="start" sideOffset={8} collisionPadding={12}>
          <RadixMenu.Label className="dz-menu-label">{label}</RadixMenu.Label>
          <RadixMenu.RadioGroup value={value} onValueChange={onChange}>
            {options.map(o => (
              <RadixMenu.RadioItem key={o} value={o} className="dz-menu-item">
                <span>{o}</span><RadixMenu.ItemIndicator><Check aria-hidden="true" /></RadixMenu.ItemIndicator>
              </RadixMenu.RadioItem>
            ))}
          </RadixMenu.RadioGroup>
        </RadixMenu.Content>
      </RadixMenu.Portal>
    </RadixMenu.Root>
  );
}

/** A pill that is only on or off. */
export function TogglePill({on, onChange, children}: {on: boolean; onChange: (on: boolean) => void; children: ReactNode}) {
  return <button type="button" className="dz-pill" aria-pressed={on} onClick={() => onChange(!on)}>{children}</button>;
}

/** The main key: the verb in the poster face and the price inside. `price` null: there is no data for this model. */
export function GoButton({verb, price, busy, disabled, beam, wide, onClick}: {verb: string; price: number | null; busy?: boolean; disabled?: boolean; beam?: boolean; wide?: boolean; onClick: () => void}) {
  return (
    <motion.button
      type="button" className="dz-go" data-wide={wide ? 'true' : undefined} disabled={disabled || busy} aria-busy={busy || undefined}
      whileHover={disabled || busy ? undefined : {y: -1}} whileTap={disabled || busy ? undefined : {scale: 0.97, y: 1}} transition={spring} onClick={onClick}
    >
      <b>{busy ? <TextShimmer>Enviando…</TextShimmer> : verb}</b>
      <small><Sparkles aria-hidden="true" />{price === null ? 'precio a confirmar' : '≈ ' + price.toLocaleString('es-AR') + ' créditos'}</small>
      {beam && !disabled && !busy ? <BorderBeam /> : null}
    </motion.button>
  );
}

const tones = ['#5A2A1C', '#2A3D57', '#3A4A34', '#6B5632'];

export function Results({tiles, onReuse, onRemove}: {tiles: TileData[]; onReuse: (prompt: string) => void; onRemove: (id: string) => void}) {
  const [open, setOpen] = useState<TileData | null>(null);
  const [touched, setTouched] = useState('');
  return (
    <>
      <div className="dz-grid">
        <AnimatePresence initial={false} mode="popLayout">
          {tiles.map(t => (
            <motion.article
              key={t.id} layout className="dz-card" data-state={t.state} data-touched={touched === t.id ? 'true' : undefined}
              initial={{opacity: 0, scale: 0.94, y: 12}} animate={{opacity: 1, scale: 1, y: 0}} exit={{opacity: 0, scale: 0.94}} transition={soft}
              whileHover={t.state === 'done' ? {y: -4} : undefined} onClick={() => setTouched(x => (x === t.id ? '' : t.id))}
              aria-label={t.prompt + (t.state === 'working' ? ', generando' : t.state === 'failed' ? ', falló' : '')}
            >
              {t.state === 'working' ? (
                <>
                  <span className="dz-sweep" aria-hidden="true" />
                  <span className="dz-tag"><span className="dz-dot" data-tone="work" /><TextShimmer>Generando…</TextShimmer></span>
                  <span className="dz-progress" aria-hidden="true"><motion.i initial={{scaleX: 0.05}} animate={{scaleX: 0.92}} transition={{duration: 2.6, ease: 'easeOut'}} /></span>
                </>
              ) : t.state === 'failed' ? (
                <>
                  <span className="dz-tag"><span className="dz-dot" data-tone="bad" />Falló</span>
                  <span className="dz-tag dz-tag--second">{t.cost === 0 ? 'Kie no cobró' : 'Costo sin confirmar'}</span>
                  <p className="dz-card-note">{t.prompt}</p>
                  <div className="dz-actions dz-actions--stay">
                    <button type="button" title="Reusar el prompt" aria-label="Reusar el prompt" onClick={e => { e.stopPropagation(); onReuse(t.prompt); }}><RotateCcw /></button>
                    <button type="button" title="Borrar" aria-label="Borrar" onClick={e => { e.stopPropagation(); onRemove(t.id); }}><Trash2 /></button>
                  </div>
                </>
              ) : (
                <>
                  <span className="dz-art" style={{background: tones[t.tone % tones.length]}} aria-hidden="true"><i>{t.letter}{t.letter.toLowerCase()}</i></span>
                  <div className="dz-actions">
                    <button type="button" title="Descargar" aria-label="Descargar" onClick={e => { e.stopPropagation(); toast('En el prototipo no se descarga nada.'); }}><Download /></button>
                    <button type="button" title="Reusar el prompt" aria-label="Reusar el prompt" onClick={e => { e.stopPropagation(); onReuse(t.prompt); }}><RotateCcw /></button>
                    <button type="button" title="Ampliar" aria-label="Ampliar" onClick={e => { e.stopPropagation(); setOpen(t); }}><Maximize2 /></button>
                    <button type="button" title="Borrar" aria-label="Borrar" onClick={e => { e.stopPropagation(); onRemove(t.id); }}><Trash2 /></button>
                  </div>
                  <p className="dz-card-cap">{t.prompt}</p>
                </>
              )}
            </motion.article>
          ))}
        </AnimatePresence>
      </div>
      <Dialog open={Boolean(open)} onClose={() => setOpen(null)} title={open?.prompt || ''} description="Imagen de ejemplo del prototipo.">
        {open ? <span className="dz-art dz-art--big" style={{background: tones[open.tone % tones.length]}}><i>{open.letter}{open.letter.toLowerCase()}</i></span> : null}
      </Dialog>
    </>
  );
}

/** A group of the sidebar that folds, with its own small actions. */
export function Fold({title, actions, children}: {title: string; actions?: ReactNode; children: ReactNode}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="dz-fold">
      <div className="dz-fold-head">
        <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)}>{title}<ChevronDown data-open={open ? 'true' : undefined} aria-hidden="true" /></button>
        {actions}
      </div>
      <AnimatePresence initial={false}>
        {open ? <motion.div className="dz-fold-body" initial={{height: 0, opacity: 0}} animate={{height: 'auto', opacity: 1}} exit={{height: 0, opacity: 0}} transition={soft}>{children}</motion.div> : null}
      </AnimatePresence>
    </div>
  );
}
