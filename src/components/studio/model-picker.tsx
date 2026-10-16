'use client';

import {Fragment, useId, useMemo, useRef, useState, type KeyboardEvent, type SVGProps} from 'react';
import * as Popover from '@radix-ui/react-popover';
import {Check, ChevronDown, Search, Shuffle} from 'lucide-react';

export type ChatModel = {id: string; name: string; provider?: string; description?: string};

const AUTO: ChatModel = {id: 'auto', name: 'Auto'};
const FALLBACK_PROVIDER = 'Kie.ai';

const providerOf = (model: ChatModel) => model.provider || FALLBACK_PROVIDER;

/** Isotipo de Gemini en una sola tinta (currentColor). SVG en línea: no se descarga nada en ejecución. */
function GeminiMark(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 296 298" fill="currentColor" aria-hidden="true" focusable="false" {...props}>
    <path d="M141.201 4.886c2.282-6.17 11.042-6.071 13.184.148l5.985 17.37a184.004 184.004 0 0 0 111.257 113.049l19.304 6.997c6.143 2.227 6.156 10.91.02 13.155l-19.35 7.082a184.001 184.001 0 0 0-109.495 109.385l-7.573 20.629c-2.241 6.105-10.869 6.121-13.133.025l-7.908-21.296a184 184 0 0 0-109.02-108.658l-19.698-7.239c-6.102-2.243-6.118-10.867-.025-13.132l20.083-7.467A183.998 183.998 0 0 0 133.291 26.28l7.91-21.394Z"/>
  </svg>;
}

function ProviderMark({provider, size}: {provider: string; size: number}) {
  if (provider === 'Google') return <GeminiMark width={size} height={size}/>;
  return <span aria-hidden="true">{provider.slice(0, 1)}</span>;
}

export function ModelPicker({models, value, onChange, disabled}: {
  models: ChatModel[]; value: string; onChange: (value: string) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [tab, setTab] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const tabDestination = useRef<HTMLElement | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();

  // El riel solo existe cuando el catálogo del servidor trae más de un proveedor.
  const providers = useMemo(() => Array.from(new Set(models.map(providerOf))), [models]);
  const hasRail = providers.length > 1;
  const activeTab = providers.includes(tab) ? tab : providers[0] || '';
  const scoped = (provider: string) => hasRail ? models.filter(model => providerOf(model) === provider) : models;

  const needle = query.trim().toLocaleLowerCase();
  const searching = needle.length > 0;
  const filtered = useMemo(() => {
    const pool: ChatModel[] = [AUTO, ...(searching ? models : scoped(activeTab))];
    return searching ? pool.filter(model => `${model.name} ${providerOf(model)}`.toLocaleLowerCase().includes(needle)) : pool;
  }, [models, searching, needle, activeTab, hasRail]);

  const selected = value === 'auto' ? AUTO : models.find(model => model.id === value);
  const current = Math.min(active, Math.max(0, filtered.length - 1));

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) return;
    tabDestination.current = null;
    setQuery('');
    const owner = selected && selected.id !== 'auto' ? providerOf(selected) : providers[0] || '';
    setTab(owner);
    setActive(Math.max(0, [AUTO, ...scoped(owner)].findIndex(model => model.id === value)));
  }
  function choose(model: ChatModel) {onChange(model.id); setOpen(false);}
  function pickTab(provider: string) {
    setTab(provider);
    setActive(scoped(provider).length ? 1 : 0);
    list.current?.scrollTo({top: 0});
  }
  function move(next: number) {
    const index = (next + filtered.length) % filtered.length;
    setActive(index);
    list.current?.querySelectorAll<HTMLElement>('[role="option"]')[index]?.scrollIntoView({block: 'nearest'});
  }
  function navigate(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Tab') {
      const controls = Array.from(trigger.current?.closest('form')?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled)') || []).filter(element => element.getClientRects().length);
      const index = controls.findIndex(element => element === trigger.current);
      tabDestination.current = controls[index + (event.shiftKey ? -1 : 1)] || trigger.current;
      event.preventDefault();
      setOpen(false);
      return;
    }
    if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && hasRail && !searching) {
      event.preventDefault();
      const index = providers.indexOf(activeTab);
      pickTab(providers[(index + (event.key === 'ArrowRight' ? 1 : -1) + providers.length) % providers.length]);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (filtered.length) move(current + (event.key === 'ArrowDown' ? 1 : -1));
    }
    if (event.key === 'Enter') {event.preventDefault(); if (filtered[current]) choose(filtered[current]);}
  }

  const listLabel = searching ? 'Resultados de la búsqueda' : hasRail ? `Modelos de ${activeTab}` : 'Modelos disponibles';
  const caption = searching ? `${filtered.length} ${filtered.length === 1 ? 'resultado' : 'resultados'}` : hasRail ? activeTab : '';

  return <Popover.Root open={open} onOpenChange={changeOpen}>
    <Popover.Trigger asChild>
      <button ref={trigger} type="button" className="chat-model-trigger" aria-label={`Modelo de chat: ${selected?.name || value}`} disabled={disabled}
        onKeyDown={event => {if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {event.preventDefault(); changeOpen(true);}}}>
        <span className="chat-provider-mark" aria-hidden="true">{value === 'auto' ? <Shuffle size={14}/> : selected ? <ProviderMark provider={providerOf(selected)} size={14}/> : 'K'}</span>
        <span>{selected?.name || 'Elegir modelo'}</span><ChevronDown size={13}/>
      </button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content className="chat-model-popover author-layer" data-rail={hasRail} side="top" align="start" sideOffset={10} collisionPadding={12} aria-label="Elegir modelo de chat"
        onOpenAutoFocus={event => {event.preventDefault(); input.current?.focus();}}
        onCloseAutoFocus={event => {if (tabDestination.current) {event.preventDefault(); tabDestination.current.focus(); tabDestination.current = null;}}}>
        {hasRail ? <div className="chat-model-rail" role="group" aria-label="Proveedores">
          {providers.map(provider => <button key={provider} type="button" tabIndex={-1} title={provider} aria-label={provider}
            aria-pressed={!searching && provider === activeTab} data-active={!searching && provider === activeTab}
            onPointerDown={event => event.preventDefault()} onClick={() => {pickTab(provider); input.current?.focus();}}>
            <ProviderMark provider={provider} size={17}/>
          </button>)}
        </div> : null}
        <div className="chat-model-main">
          <label className="chat-model-search"><Search size={16} aria-hidden="true"/>
            <input ref={input} role="combobox" aria-label="Buscar modelo" aria-expanded={open} aria-autocomplete="list" aria-controls={`${id}-list`}
              aria-activedescendant={filtered[current] ? `${id}-${filtered[current].id}` : undefined}
              value={query} onChange={event => {setQuery(event.target.value); setActive(0);}} onKeyDown={navigate} placeholder="Buscá un modelo…" autoComplete="off"/>
          </label>
          {caption ? <p className="chat-model-group" aria-hidden="true">{caption}</p> : null}
          <div ref={list} id={`${id}-list`} role="listbox" aria-label={listLabel} className="chat-model-options">
            {filtered.map((model, index) => {
              const isAuto = model.id === 'auto';
              const detail = searching && !isAuto ? providerOf(model) : model.description;
              return <Fragment key={model.id}>
                <div id={`${id}-${model.id}`} role="option" aria-selected={model.id === value} data-auto={isAuto}
                  data-active={index === current} className="chat-model-option" onPointerMove={() => setActive(index)}
                  onPointerDown={event => event.preventDefault()} onClick={() => choose(model)}>
                  <span className="chat-model-provider" aria-hidden="true">{isAuto ? <Shuffle size={16}/> : <ProviderMark provider={providerOf(model)} size={16}/>}</span>
                  <span className="chat-model-info"><strong>{model.name}</strong>{detail ? <small>{detail}</small> : null}</span>
                  {model.id === value ? <Check size={15} aria-hidden="true"/> : null}
                </div>
                {isAuto && !searching && filtered.length > 1 ? <div className="chat-model-divider" aria-hidden="true"/> : null}
              </Fragment>;
            })}
          </div>
          {!filtered.length ? <p className="chat-model-no-results" role="status">No encontré modelos con ese nombre.</p> : null}
          <p className="chat-model-help">↑ ↓ para recorrer · Enter para elegir{hasRail ? ' · ← → proveedor' : ''} · Esc para cerrar</p>
        </div>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}
