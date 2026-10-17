'use client';
import {Plus} from 'lucide-react';
import {templateGroups} from '@/lib/books/templates';
import {Menu, MenuTrigger, MenuContent, MenuItem, MenuLabel, MenuSeparator} from '@/components/ui/menu';
import type {EditorApi} from './editor-api';

/** Templates and plain blocks, inserted after the selected block (or at the end of the chapter). */
export function InsertMenu({api, label = 'Insertar'}: {api: EditorApi; label?: string}) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" disabled={api.selection.chapter < 0}>
          <Plus aria-hidden="true" />{label}
        </button>
      </MenuTrigger>
      <MenuContent align="start">
        {templateGroups.map((group, g) => (
          <div key={group.label}>
            {g ? <MenuSeparator /> : null}
            <MenuLabel>{group.label}</MenuLabel>
            {group.items.map(item => (
              <MenuItem key={item.id} onSelect={() => api.insertTemplate(item.id)}>
                <span className="rc-pdf-menu-item"><span>{item.name}</span>{item.hint ? <small>{item.hint}</small> : null}</span>
              </MenuItem>
            ))}
          </div>
        ))}
      </MenuContent>
    </Menu>
  );
}
