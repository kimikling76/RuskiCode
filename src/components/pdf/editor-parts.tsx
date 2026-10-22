'use client';
import {useEffect, useRef, useState} from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import {Check, ChevronDown, Minus, Plus} from 'lucide-react';
import {Tip} from '@/components/ui/tooltip';
import {Menu, MenuContent, MenuItem, MenuTrigger} from '@/components/ui/menu';

// The pieces the three PDF Studio editors (book, manual unit, imported PDF) share, so they read and work the same.

import type {Zoom} from './doc-view';
export type {Zoom};
const zoomSteps = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** Zoom out · Fit (or the percentage, which goes back to fitting) · zoom in. */
export function ZoomControl({zoom, onChange}: {zoom: Zoom; onChange: (zoom: Zoom) => void}) {
  const i = zoom === 'fit' ? -1 : zoomSteps.indexOf(zoom);
  return (
    <div className="rc-doc-zoom" role="group" aria-label="Zoom">
      <Tip label="Alejar"><button type="button" className="rc-icon-btn" aria-label="Alejar" disabled={i === 0} onClick={() => onChange(i <= 0 ? 0.75 : zoomSteps[i - 1])}><Minus /></button></Tip>
      <Tip label={zoom === 'fit' ? 'Ver al 100 %' : 'Ajustar al ancho'}>
        <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" aria-pressed={zoom === 'fit'} onClick={() => onChange(zoom === 'fit' ? 1 : 'fit')}>{zoom === 'fit' ? 'Ajustar' : Math.round(zoom * 100) + ' %'}</button>
      </Tip>
      <Tip label="Acercar"><button type="button" className="rc-icon-btn" aria-label="Acercar" disabled={i === zoomSteps.length - 1} onClick={() => onChange(i < 0 ? 1.25 : zoomSteps[i + 1])}><Plus /></button></Tip>
    </div>
  );
}

export type SaveState = 'opening' | 'idle' | 'saving' | 'saved' | 'error';
const clock = (at: number) => new Date(at).toLocaleTimeString('es-AR', {hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});

/**
 * Whether the work is saved, the same in every editor. The time is the last save made while the editor is open;
 * a document just opened says «Guardado» without one.
 */
export function SaveStatus({state, saved = 'Guardado', saving = 'Guardando…', error = 'Sin guardar'}: {state: SaveState; saved?: string; saving?: string; error?: string}) {
  const [at, setAt] = useState<number | null>(null);
  const previous = useRef(state);
  useEffect(() => {
    if (previous.current === 'saving' && state === 'saved') setAt(Date.now());
    previous.current = state;
  }, [state]);
  const text = state === 'opening' ? 'Abriendo…' : state === 'saving' ? saving : state === 'error' ? error : state === 'saved' ? saved + (at ? ' · ' + clock(at) : '') : '';
  return (
    <span className="rc-pdf-save" data-state={state} role="status" aria-live="polite">
      {state === 'saved' ? <Check aria-hidden="true" /> : null}{text}
    </span>
  );
}

/**
 * The inspector's tabs: the main ones always in view and the rest behind «Más», so none is cut off at the edge.
 * A tab chosen from «Más» shows after the others while it is open, and «Más» shrinks to its arrow to make room.
 */
export function InspectorTabs<T extends string>({label, tabs, more = [], value, onChange}: {label: string; tabs: readonly (readonly [T, string])[]; more?: readonly (readonly [T, string])[]; value: T; onChange: (value: T) => void}) {
  const list = useRef<HTMLDivElement>(null);
  const chosen = useRef(false);
  const open = more.find(([id]) => id === value);
  const name = 'Más pestañas: ' + more.map(([, name]) => name).join(', ');
  const trigger = (
    <MenuTrigger asChild>
      <button type="button" className={(open ? 'rc-icon-btn' : 'rc-btn rc-btn--ghost rc-btn--sm') + ' rc-pdf-tabs-more'} aria-label={name}>
        {open ? null : 'Más'}<ChevronDown aria-hidden="true" />
      </button>
    </MenuTrigger>
  );
  return (
    <div className="rc-pdf-tabbar">
      <Tabs.List ref={list} className="rc-pdf-tabs" aria-label={label}>
        {[...tabs, ...(open ? [open] : [])].map(([id, name]) => <Tabs.Trigger key={id} value={id} className="rc-tab">{name}</Tabs.Trigger>)}
      </Tabs.List>
      {more.length ? (
        <Menu>
          {open ? <Tip label="Más pestañas">{trigger}</Tip> : trigger}
          {/* A tab picked here takes the focus, so the keyboard goes on from it instead of from «Más». */}
          <MenuContent onCloseAutoFocus={e => {
            if (!chosen.current) return;
            chosen.current = false;
            e.preventDefault();
            list.current?.querySelector<HTMLElement>('[data-state="active"]')?.focus();
          }}>
            {more.map(([id, name]) => (
              <MenuItem key={id} onSelect={() => { chosen.current = true; onChange(id); }}>
                <span className="rc-menu-check" aria-hidden="true">{value === id ? <Check /> : null}</span>{name}
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
      ) : null}
    </div>
  );
}
