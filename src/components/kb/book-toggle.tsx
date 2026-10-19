'use client';
import {toast} from 'sonner';
import {BookMarked, X} from 'lucide-react';
import {Tip} from '@/components/ui/tooltip';
import {Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger} from '@/components/ui/menu';
import type {ChatBook} from '@/lib/personal-chat/state';
import {useKbProjects} from './use-kb';

/**
 * «Contexto del libro» in the Chat composer: off by default; turned on, every message of this chat (and its
 * /pdf-generator and /revisar-ruso) carries the chosen book's data. With several books, a menu picks one.
 */
export function BookToggle({value, onChange, disabled}: {value: ChatBook | null; onChange: (book: ChatBook | null) => void; disabled?: boolean}) {
  const projects = useKbProjects();
  const on = Boolean(value);
  const label = on ? 'Contexto del libro activado: «' + value!.name + '». Los mensajes llevan sus datos' : 'Contexto del libro: usar los personajes, las unidades y las reglas de un libro en este chat';
  const button = (props: Record<string, unknown> = {}) => (
    <button type="button" className={'rc-icon-btn rc-search-btn rc-book-btn' + (on ? ' is-on' : '')} aria-label="Contexto del libro" aria-pressed={on} disabled={disabled} {...props}><BookMarked /></button>
  );
  if (!projects || projects.length <= 1) {
    return (
      <Tip label={label}>
        {button({onClick: () => {
          if (on) { onChange(null); return; }
          const p = projects?.[0];
          if (!p) { toast('Todavía no hay un libro: crealo en PDF Studio → «Contexto del libro».', {action: {label: 'Ir', onClick: () => { window.location.href = '/workspace/libro'; }}}); return; }
          onChange({project: p.id, name: p.name});
        }})}
      </Tip>
    );
  }
  return (
    <Menu>
      <Tip label={label}><MenuTrigger asChild>{button()}</MenuTrigger></Tip>
      <MenuContent align="start" side="top">
        <MenuLabel>Contexto del libro</MenuLabel>
        {projects.map(p => <MenuItem key={p.id} onSelect={() => onChange({project: p.id, name: p.name})}>{value?.project === p.id ? '✓ ' : ''}{p.name}</MenuItem>)}
        <MenuSeparator />
        <MenuItem disabled={!on} onSelect={() => onChange(null)}>Sin contexto del libro</MenuItem>
      </MenuContent>
    </Menu>
  );
}

/** The chip above the message while the book's context is on, with a way to turn it off. */
export function BookChip({value, onClear}: {value: ChatBook; onClear: () => void}) {
  return (
    <div className="rc-skill-active rc-book-active">
      <BookMarked aria-hidden="true" /><span>Contexto del libro: «{value.name}»</span>
      <Tip label="Quitar el contexto del libro (el chat vuelve a ser neutro)"><button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label="Quitar el contexto del libro" onClick={onClear}><X /></button></Tip>
    </div>
  );
}
