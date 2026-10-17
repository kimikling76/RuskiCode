'use client';
import {useState} from 'react';
import {Dialog} from '@/components/ui/dialog';
import {useSync, resolveConflict, type Choice, type Conflict} from '@/lib/sync/engine';

const when = new Intl.DateTimeFormat('es-AR', {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});

const kindNames: Record<string, string> = {
  chat: 'Chat', project: 'Proyecto', 'cinema-board': 'Plan de Cinema', 'cinema-job': 'Imagen', book: 'Libro', 'book-draft': 'Borrador de libro',
  'book-note': 'Nota', assistant: 'Asistente', 'composer-book': 'Libro del compositor', favorite: 'Favorito', 'usage-day': 'Consumo',
};

function Row({conflict}: {conflict: Conflict}) {
  const [busy, setBusy] = useState(false);
  const deletedThere = conflict.remoteData === null;
  const deletedHere = conflict.local === null;
  const choose = async (c: Choice) => { setBusy(true); try { await resolveConflict(conflict.id, c); } finally { setBusy(false); } };
  return (
    <li className="rc-conflict">
      <div className="rc-conflict-head">
        <span className="rc-conflict-kind">{kindNames[conflict.kind] || conflict.kind}</span>
        <strong>{conflict.label}</strong>
      </div>
      <p className="rc-hint">
        {deletedThere ? 'Se borró en otra computadora' : 'Cambió en otra computadora'} ({when.format(new Date(conflict.remote.updatedAt))})
        {deletedHere ? ', y acá también se borró una versión anterior.' : ', y acá también tiene cambios que la otra no vio.'}
      </p>
      <div className="rc-conflict-actions">
        {deletedThere ? (
          <>
            <button type="button" className="rc-btn rc-btn--primary rc-btn--sm" disabled={busy} onClick={() => choose('mine')}>Conservar mi versión</button>
            <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" disabled={busy} onClick={() => choose('theirs')}>Borrarlo también acá</button>
          </>
        ) : deletedHere ? (
          <>
            <button type="button" className="rc-btn rc-btn--primary rc-btn--sm" disabled={busy} onClick={() => choose('theirs')}>Recuperar la otra versión</button>
            <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" disabled={busy} onClick={() => choose('mine')}>Borrarlo igual</button>
          </>
        ) : (
          <>
            <button type="button" className="rc-btn rc-btn--primary rc-btn--sm" disabled={busy} onClick={() => choose('both')}>Conservar las dos</button>
            <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" disabled={busy} onClick={() => choose('mine')}>Usar la de esta computadora</button>
            <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" disabled={busy} onClick={() => choose('theirs')}>Usar la otra</button>
          </>
        )}
      </div>
    </li>
  );
}

/** Lists what changed in two places at once. Nothing is overwritten until the person chooses. */
export function SyncConflicts({open, onClose}: {open: boolean; onClose: () => void}) {
  const conflicts = useSync(s => s.conflicts);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Cambios para revisar"
      description="Lo mismo se cambió en dos computadoras antes de que se guardara. Mientras no elijas, cada computadora conserva su versión. «Conservar las dos» guarda la de esta computadora como copia."
    >
      <div className="rc-dialog-body">
        {conflicts.length ? (
          <ul className="rc-conflicts">{conflicts.map(c => <Row key={c.id} conflict={c} />)}</ul>
        ) : (
          <p className="rc-hint">No queda nada para revisar.</p>
        )}
      </div>
      <div className="rc-dialog-footer rc-dialog-footer--end">
        <button type="button" className="rc-btn rc-btn--ghost" onClick={onClose}>Cerrar</button>
      </div>
    </Dialog>
  );
}
