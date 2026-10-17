'use client';
import {History} from 'lucide-react';
import {fileSize, type PdfVersion} from '@/lib/books/originals';

const when = (at: number) => new Date(at).toLocaleString('es-AR', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});

/** Every saved version, newest first. Opening one does not delete the others. */
export function DocVersions({versions, current, busy, onShow}: {versions: PdfVersion[]; current?: string; busy: boolean; onShow: (v: PdfVersion) => void}) {
  if (!versions.length) return <p className="rc-hint rc-pdf-empty">Todavía no hay versiones. La primera se guarda con el primer cambio.</p>;
  return (
    <div className="rc-pdf-form">
      <p className="rc-hint">Cada cambio guarda una versión. El original importado se conserva siempre. Volver a una versión no borra las demás.</p>
      <ol className="rc-doc-versions" reversed>
        {[...versions].reverse().map(v => (
          <li key={v.id} data-current={v.id === current ? 'true' : undefined}>
            <History aria-hidden="true" />
            <span className="rc-doc-version-text">
              <strong>{v.label}</strong>
              <small>{when(v.createdAt)} · {fileSize(v.size)}{v.missing ? ' · quedó en la otra computadora' : ''}</small>
            </span>
            {v.id === current ? <span className="rc-doc-version-now">Actual</span> : (
              <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" disabled={busy || v.missing} onClick={() => onShow(v)} aria-label={'Volver a la versión: ' + v.label}>Volver a esta</button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
