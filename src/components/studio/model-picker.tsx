'use client';

import {useId, useRef, useState, type KeyboardEvent} from 'react';
import * as Popover from '@radix-ui/react-popover';
import {Check, ChevronDown, Search, Shuffle} from 'lucide-react';

export type ChatModel = {id: string; name: string; provider?: string; description?: string};

export function ModelPicker({models, value, onChange, disabled}: {
  models: ChatModel[]; value: string; onChange: (value: string) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const tabDestination = useRef<HTMLElement | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const options: ChatModel[] = [{id: 'auto', name: 'Auto', description: 'Usa la selección automática configurada'}, ...models];
  const filtered = options.filter(model => `${model.name} ${model.provider || ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const selected = options.find(model => model.id === value);
  const current = Math.min(active, Math.max(0, filtered.length - 1));
  function changeOpen(next: boolean) {
    setOpen(next);
    if (next) {tabDestination.current = null; setQuery(''); setActive(Math.max(0, options.findIndex(model => model.id === value)));}
  }
  function choose(model: ChatModel) {onChange(model.id); setOpen(false);}
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
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (filtered.length) move(current + (event.key === 'ArrowDown' ? 1 : -1));
    }
    if (event.key === 'Enter') {event.preventDefault(); if (filtered[current]) choose(filtered[current]);}
  }
  return <Popover.Root open={open} onOpenChange={changeOpen}>
    <Popover.Trigger asChild>
      <button ref={trigger} type="button" className="chat-model-trigger" aria-label={`Modelo de chat: ${selected?.name || value}`} disabled={disabled}
        onKeyDown={event => {if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {event.preventDefault(); changeOpen(true);}}}>
        <span className="chat-provider-mark" aria-hidden="true">{value === 'auto' ? <Shuffle size={14}/> : (selected?.provider?.slice(0,1) || 'K')}</span>
        <span>{selected?.name || 'Elegir modelo'}</span><ChevronDown size={13}/>
      </button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content className="chat-model-popover author-layer" side="top" align="start" sideOffset={10} collisionPadding={12} aria-label="Elegir modelo de chat"
        onOpenAutoFocus={event => {event.preventDefault(); input.current?.focus();}}
        onCloseAutoFocus={event => {if (tabDestination.current) {event.preventDefault(); tabDestination.current.focus(); tabDestination.current = null;}}}>
        <label className="chat-model-search"><Search size={16} aria-hidden="true"/>
          <input ref={input} role="combobox" aria-label="Buscar modelo" aria-expanded={open} aria-autocomplete="list" aria-controls={`${id}-list`}
            aria-activedescendant={filtered[current] ? `${id}-${filtered[current].id}` : undefined}
            value={query} onChange={event => {setQuery(event.target.value); setActive(0);}} onKeyDown={navigate} placeholder="Buscá un modelo…" autoComplete="off"/>
        </label>
        <div ref={list} id={`${id}-list`} role="listbox" aria-label="Modelos disponibles" className="chat-model-options">
          {filtered.map((model, index) => <div key={model.id} id={`${id}-${model.id}`} role="option" aria-selected={model.id === value}
            data-active={index === current} className="chat-model-option" onPointerMove={() => setActive(index)}
            onPointerDown={event => event.preventDefault()} onClick={() => choose(model)}>
            <span className="chat-model-provider" aria-hidden="true">{model.id === 'auto' ? <Shuffle size={17}/> : (model.provider?.slice(0,1) || 'K')}</span>
            <span className="chat-model-info"><strong>{model.name}</strong><small>{model.description || (model.provider ? `${model.provider} · disponible mediante Kie.ai` : 'Disponible mediante Kie.ai')}</small></span>
            {model.id === value ? <Check size={15} aria-hidden="true"/> : null}
          </div>)}
        </div>
        {!filtered.length ? <p className="chat-model-no-results" role="status">No encontré modelos con ese nombre.</p> : null}
        <p className="chat-model-help">↑ ↓ para recorrer · Enter para elegir · Esc para cerrar</p>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}
