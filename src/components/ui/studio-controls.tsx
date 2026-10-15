'use client';

import {forwardRef, useRef, type ButtonHTMLAttributes, type ReactNode} from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import {MoreHorizontal} from 'lucide-react';
import {Button} from './button';

export const StudioTooltipProvider = Tooltip.Provider;

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {label: string}>(
  function IconButton({label, children, className = 'chat-icon', type = 'button', ...props}, ref) {
    return <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <Button unstyled {...props} ref={ref} type={type} className={className} aria-label={label}>{children}</Button>
      </Tooltip.Trigger>
      <Tooltip.Portal><Tooltip.Content className="studio-tooltip author-layer" sideOffset={7} collisionPadding={12}>{label}</Tooltip.Content></Tooltip.Portal>
    </Tooltip.Root>;
  }
);

export function ActionMenu({label, items, className = 'chat-icon', children}: {
  label: string;
  className?: string;
  children?: ReactNode;
  items: {label: string; icon?: ReactNode; onSelect: () => void}[];
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const action = useRef<(() => void) | null>(null);
  return <Dropdown.Root>
    <Dropdown.Trigger asChild><IconButton ref={trigger} label={label} className={className}>{children || <MoreHorizontal size={16}/>}</IconButton></Dropdown.Trigger>
    <Dropdown.Portal>
      <Dropdown.Content className="studio-action-menu author-layer" align="end" sideOffset={6} collisionPadding={12} loop
        onCloseAutoFocus={event => {
          if (!action.current) return;
          event.preventDefault();
          trigger.current?.focus();
          const next = action.current;
          action.current = null;
          next();
        }}>
        {items.map(item => <Dropdown.Item key={item.label} className="studio-action-item" onSelect={() => {action.current = item.onSelect;}}>{item.icon}<span>{item.label}</span></Dropdown.Item>)}
      </Dropdown.Content>
    </Dropdown.Portal>
  </Dropdown.Root>;
}

export function ConfirmDialog({open, onClose, title, description, confirmLabel, onConfirm, disabled = false}: {
  open: boolean; onClose: () => void; title: string; description: string;
  confirmLabel: string; onConfirm: () => boolean | void; disabled?: boolean;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  return <AlertDialog.Root open={open} onOpenChange={value => {if (!value) onClose();}}>
    <AlertDialog.Portal>
      <AlertDialog.Overlay className="studio-modal-overlay"/>
      <AlertDialog.Content className="studio-modal personal-modal author-confirm"
        onOpenAutoFocus={() => {returnFocus.current = document.activeElement as HTMLElement;}}
        onCloseAutoFocus={event => {
          event.preventDefault();
          const target = returnFocus.current;
          if (target?.isConnected) target.focus();
          else document.querySelector<HTMLButtonElement>('.chat-header-actions button, .studio-new-chat')?.focus();
        }}>
        <AlertDialog.Title>{title}</AlertDialog.Title>
        <AlertDialog.Description>{description}</AlertDialog.Description>
        <div className="personal-dialog-actions">
          <AlertDialog.Cancel asChild><button className="studio-text-button">Cancelar</button></AlertDialog.Cancel>
          <AlertDialog.Action asChild><button className="studio-primary" disabled={disabled} onClick={event => {if (onConfirm() === false) event.preventDefault();}}>{confirmLabel}</button></AlertDialog.Action>
        </div>
      </AlertDialog.Content>
    </AlertDialog.Portal>
  </AlertDialog.Root>;
}
