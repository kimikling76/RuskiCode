'use client';
import {useRef} from 'react';
import {Check, Plus} from 'lucide-react';
import {Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger} from '@/components/ui/menu';
import {useKbProjects} from '@/components/kb/use-kb';
import {turnOnBook} from '@/components/kb/book-toggle';
import type {ChatBook} from '@/lib/personal-chat/state';

/**
 * On a phone the composer's four tools (attach, skills, web search, the book's context) share one «+» menu, so
 * «Preguntar antes» keeps its visible label on the same line. The dot on «+» says a tool is on.
 */
export function ComposerMore({disabled, onAttach, onSkills, searchOn, onSearch, book, onBook}: {
  disabled?: boolean; onAttach: () => void; onSkills: () => void; searchOn: boolean; onSearch: (on: boolean) => void;
  book: ChatBook | null; onBook: (book: ChatBook | null) => void;
}) {
  const projects = useKbProjects();
  const skills = useRef(false);
  const on = searchOn || Boolean(book);
  const check = (active: boolean) => <span className="rc-menu-check" aria-hidden="true">{active ? <Check /> : null}</span>;
  return (
    <Menu>
      <MenuTrigger asChild>
        <button type="button" className="rc-icon-btn rc-composer-more" disabled={disabled} aria-label={'Herramientas: adjuntar, skills, búsqueda web y contexto del libro' + (on ? ' (hay una activada)' : '')}>
          <Plus />{on ? <span className="rc-composer-more-dot" aria-hidden="true" /> : null}
        </button>
      </MenuTrigger>
      {/* The skills list opens once the menu has closed, with the focus in the message box instead of on «+». */}
      <MenuContent align="start" side="top" onCloseAutoFocus={e => { if (!skills.current) return; skills.current = false; e.preventDefault(); onSkills(); }}>
        <MenuItem onSelect={onAttach}>{check(false)}Adjuntar imágenes o archivos</MenuItem>
        <MenuItem onSelect={() => { skills.current = true; }}>{check(false)}Skills</MenuItem>
        <MenuItem onSelect={() => onSearch(!searchOn)}>{check(searchOn)}Buscar en la web</MenuItem>
        {projects && projects.length > 1 ? (
          <>
            <MenuSeparator />
            <MenuLabel>Contexto del libro</MenuLabel>
            {projects.map(p => <MenuItem key={p.id} onSelect={() => onBook(book?.project === p.id ? null : {project: p.id, name: p.name})}>{check(book?.project === p.id)}{p.name}</MenuItem>)}
          </>
        ) : (
          <MenuItem onSelect={() => book ? onBook(null) : turnOnBook(projects, onBook)}>{check(Boolean(book))}Contexto del libro</MenuItem>
        )}
      </MenuContent>
    </Menu>
  );
}
