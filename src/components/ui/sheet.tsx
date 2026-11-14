'use client';
import type {ReactNode} from 'react';
import {Drawer} from 'vaul';

/** A sheet that rises from the bottom of a phone and is dragged down to close (Vaul, MIT, on Radix Dialog). */
export function Sheet({open, onOpenChange, title, children}: {open: boolean; onOpenChange: (open: boolean) => void; title: string; children: ReactNode}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="ui-sheet-overlay rc-layer" />
        <Drawer.Content className="ui-sheet rc-layer" aria-describedby={undefined}>
          <span className="ui-sheet-grab" aria-hidden="true" />
          <Drawer.Title className="sr-only">{title}</Drawer.Title>
          <div className="ui-sheet-body">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
