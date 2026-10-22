'use client';
import Link from 'next/link';
import * as RadixMenu from '@radix-ui/react-dropdown-menu';
import type {ReactNode} from 'react';

export const Menu = RadixMenu.Root;
export const MenuTrigger = RadixMenu.Trigger;

export function MenuContent({children, align = 'end', side = 'bottom', onCloseAutoFocus}: {children: ReactNode; align?: 'start' | 'center' | 'end'; side?: 'top' | 'bottom' | 'left' | 'right'; onCloseAutoFocus?: (event: Event) => void}) {
  return (
    <RadixMenu.Portal>
      <RadixMenu.Content className="rc-menu rc-layer" align={align} side={side} sideOffset={6} collisionPadding={12} onCloseAutoFocus={onCloseAutoFocus}>
        {children}
      </RadixMenu.Content>
    </RadixMenu.Portal>
  );
}

export function MenuItem({children, onSelect, danger, disabled}: {children: ReactNode; onSelect?: () => void; danger?: boolean; disabled?: boolean}) {
  return (
    <RadixMenu.Item className={'rc-menu-item' + (danger ? ' rc-menu-item--danger' : '')} onSelect={onSelect} disabled={disabled}>
      {children}
    </RadixMenu.Item>
  );
}

export function MenuLink({children, href, external}: {children: ReactNode; href: string; external?: boolean}) {
  return (
    <RadixMenu.Item asChild className="rc-menu-item">
      {external ? <a href={href} target="_blank" rel="noreferrer">{children}</a> : <Link href={href}>{children}</Link>}
    </RadixMenu.Item>
  );
}

export function MenuSeparator() {
  return <RadixMenu.Separator className="rc-menu-separator" />;
}

export function MenuLabel({children}: {children: ReactNode}) {
  return <RadixMenu.Label className="rc-menu-label">{children}</RadixMenu.Label>;
}
