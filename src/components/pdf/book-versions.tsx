'use client';
import {useEffect, useState} from 'react';
import {History} from 'lucide-react';
import {libraryEvents} from '@/lib/books/library';
import {listBookVersions, type BookVersion} from '@/lib/books/versions';

const when = (at: number) => new Date(at).toLocaleString('es-AR', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});

/** Saved versions of a book. Restoring one is a normal edit: the current state is saved first and it can be undone. */
export function BookVersions({bookId, onSave, onRestore}: {bookId: string | null; onSave: () => Promise<void>; onRestore: (v: BookVersion) => void}) {
  const [versions, setVersions] = useState<BookVersion[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!bookId) return;
    const load = () => { void listBookVersions(bookId).then(setVersions).catch(() => setVersions([])); };
    load();
    libraryEvents?.addEventListener('change', load);
    libraryEvents?.addEventListener('synced', load);
    return () => { libraryEvents?.removeEventListener('change', load); libraryEvents?.removeEventListener('synced', load); };
  }, [bookId]);

  if (!bookId) return <p className="rc-hint rc-pdf-empty">Las versiones se guardan en los libros propios. Usá «Duplicar como libro propio» en el menú para tener versiones de este.</p>;
  return (
    <div className="rc-pdf-form">
      <p className="rc-hint">Se guarda una versión antes de cada cambio del asistente y cuando la pedís. Se sincronizan con tu cuenta.</p>
      <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" disabled={busy} onClick={async () => { setBusy(true); try { await onSave(); } finally { setBusy(false); } }}>Guardar una versión ahora</button>
      {versions?.length ? (
        <ol className="rc-doc-versions">
          {versions.map(v => (
            <li key={v.id}>
              <History aria-hidden="true" />
              <span className="rc-doc-version-text"><strong>{v.label}</strong><small>{when(v.createdAt)} · {v.project.chapters.length} {v.project.chapters.length === 1 ? 'capítulo' : 'capítulos'}</small></span>
              <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => onRestore(v)} aria-label={'Volver a la versión: ' + v.label}>Volver a esta</button>
            </li>
          ))}
        </ol>
      ) : versions ? <p className="rc-hint">Todavía no hay versiones guardadas.</p> : null}
    </div>
  );
}
