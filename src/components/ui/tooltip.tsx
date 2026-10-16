'use client';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import type {ReactNode} from 'react';

export const TooltipProvider = RadixTooltip.Provider;

/** Short label shown on hover or keyboard focus. The trigger keeps its own aria-label. */
export function Tip({label, shortcut, side = 'top', children}: {label: string; shortcut?: string; side?: 'top' | 'bottom' | 'left' | 'right'; children: ReactNode}) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content className="rc-tooltip rc-layer" side={side} sideOffset={6} collisionPadding={8}>
          {label}
          {shortcut ? <kbd className="rc-kbd">{shortcut}</kbd> : null}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
