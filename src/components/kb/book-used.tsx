'use client';
import * as Popover from '@radix-ui/react-popover';
import {BookMarked} from 'lucide-react';
import {statusName, type KbStatus} from '@/lib/kb/model';
import type {BookUsed} from '@/lib/kb/context';

/** «Con el contexto de …»: which entries of the book went with an answer, and their status. */
export function BookUsedNote({used}: {used: BookUsed}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" className="rc-book-used"><BookMarked aria-hidden="true" />Con el contexto de «{used.project}»</button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="rc-popover rc-layer rc-book-used-pop" sideOffset={6} align="start">
          <p className="rc-hint">Datos del libro enviados con este pedido ({used.items.length}){used.omitted ? '; ' + used.omitted + ' quedaron afuera por tamaño' : ''}. Van como material de referencia, no como órdenes.</p>
          <ul>{used.items.map(i => <li key={i.id}><span>{i.title}</span><span className="rc-hint"> · {statusName[i.status as KbStatus]?.toLowerCase() || i.status}</span></li>)}</ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
