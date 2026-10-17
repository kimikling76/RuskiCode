'use client';
import * as RadixDialog from '@radix-ui/react-dialog';
import * as RadixAlert from '@radix-ui/react-alert-dialog';
import {X} from 'lucide-react';
import type {ReactNode} from 'react';

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  wide?: boolean;
};

/** Standard dialog: Escape closes it, focus is trapped and returns to the trigger. */
export function Dialog({open, onClose, title, description, children, wide}: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={value => { if (!value) onClose(); }}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="rc-overlay rc-layer" />
        <RadixDialog.Content
          className={'rc-dialog rc-layer' + (wide ? ' rc-dialog--wide' : '')}
          {...(description ? {} : {'aria-describedby': undefined})}
        >
          <RadixDialog.Title className="rc-dialog-title">{title}</RadixDialog.Title>
          {description ? (
            <RadixDialog.Description className="rc-dialog-description">{description}</RadixDialog.Description>
          ) : null}
          <RadixDialog.Close asChild>
            <button type="button" className="rc-icon-btn rc-dialog-close" aria-label="Cerrar">
              <X />
            </button>
          </RadixDialog.Close>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

type ConfirmProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  busy?: boolean;
  children?: ReactNode;
};

/** Confirmation for actions that spend credits or remove data. */
export function ConfirmDialog({open, onClose, onConfirm, title, description, confirmLabel, cancelLabel = 'Cancelar', tone = 'primary', busy, children}: ConfirmProps) {
  return (
    <RadixAlert.Root open={open} onOpenChange={value => { if (!value) onClose(); }}>
      <RadixAlert.Portal>
        <RadixAlert.Overlay className="rc-overlay rc-layer" />
        <RadixAlert.Content className="rc-dialog rc-layer">
          <RadixAlert.Title className="rc-dialog-title">{title}</RadixAlert.Title>
          <RadixAlert.Description className="rc-dialog-description">{description}</RadixAlert.Description>
          {children}
          <div className="rc-dialog-footer rc-dialog-footer--end">
            <RadixAlert.Cancel asChild>
              <button type="button" className="rc-btn rc-btn--ghost">{cancelLabel}</button>
            </RadixAlert.Cancel>
            <button
              type="button"
              className={'rc-btn ' + (tone === 'danger' ? 'rc-btn--danger' : 'rc-btn--primary')}
              disabled={busy}
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </RadixAlert.Content>
      </RadixAlert.Portal>
    </RadixAlert.Root>
  );
}
