'use client';
import {useEffect, useRef, useState} from 'react';
import type {PDFDocumentProxy} from 'pdfjs-dist';
import {AlertTriangle} from 'lucide-react';
import {Dialog} from '@/components/ui/dialog';
import {drawPage, openPdf} from '@/lib/pdf/viewer';

export type Preview = {
  title: string;
  /** What the change does, said plainly (from operationInfo). */
  effect: string;
  before: ArrayBuffer;
  after: ArrayBuffer;
  /** 1-based pages to show from each side. */
  focus: {before: number[]; after: number[]};
  warnings: string[];
  /** «Stirling: al menos 1 crédito» — already used: the preview is the real result. */
  cost: string;
  /** Text changes to read before applying (find and replace). */
  texts?: {before: string; after: string}[];
  /** The result is a new PDF instead of a new version of this one. */
  newDocument?: boolean;
};

function PagePic({doc, page, label}: {doc: PDFDocumentProxy | null; page: number; label: string}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!doc || !canvas.current || page > doc.numPages) return;
    let task: {cancel: () => void} | null = null;
    void doc.getPage(page).then(p => { const r = drawPage(p, canvas.current!, 220); task = r.task; return r.task.promise; }).catch(() => {});
    return () => task?.cancel();
  }, [doc, page]);
  return (
    <figure className="rc-doc-preview-page">
      <canvas ref={canvas} role="img" aria-label={label} />
      <figcaption>{label}</figcaption>
    </figure>
  );
}

function useDoc(bytes: ArrayBuffer | null) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  useEffect(() => {
    if (!bytes) return;
    let alive = true;
    let opened: PDFDocumentProxy | null = null;
    void openPdf(bytes).then(d => { opened = d; if (alive) setDoc(d); else void d.loadingTask.destroy(); }).catch(() => {});
    return () => { alive = false; setDoc(null); void opened?.loadingTask.destroy(); };
  }, [bytes]);
  return doc;
}

/** The real result of a change, next to what is there now. Nothing is saved until «Aplicar». */
export function PreviewDialog({preview, applying, onApply, onDiscard}: {preview: Preview | null; applying: boolean; onApply: () => void; onDiscard: () => void}) {
  const before = useDoc(preview?.before || null);
  const after = useDoc(preview?.after || null);
  if (!preview) return null;
  return (
    <Dialog open onClose={() => { if (!applying) onDiscard(); }} title={preview.title} description={preview.effect} wide>
      <div className="rc-dialog-body rc-doc-preview">
        <div className="rc-doc-preview-sides">
          <section aria-label="Ahora">
            <h3>Ahora</h3>
            <div className="rc-doc-preview-row">{preview.focus.before.length ? preview.focus.before.map(n => <PagePic key={'b' + n} doc={before} page={n} label={'Página ' + n} />) : <p className="rc-hint">—</p>}</div>
          </section>
          <section aria-label={preview.newDocument ? 'PDF nuevo' : 'Después'}>
            <h3>{preview.newDocument ? 'PDF nuevo' : 'Después'}</h3>
            <div className="rc-doc-preview-row">{preview.focus.after.map(n => <PagePic key={'a' + n} doc={after} page={n} label={'Página ' + n} />)}</div>
          </section>
        </div>
        {preview.texts?.length ? (
          <section className="rc-doc-preview-texts" aria-label="Texto que cambia">
            {preview.texts.map((t, i) => (
              <p key={i} className="rc-pdf-before-after"><span className="rc-pdf-before"><span>Antes</span>{t.before}</span><span className="rc-pdf-after"><span>Después</span>{t.after}</span></p>
            ))}
          </section>
        ) : null}
        {preview.warnings.length ? (
          <ul className="rc-doc-preview-warn" aria-label="Para revisar">
            {preview.warnings.map(w => <li key={w}><AlertTriangle aria-hidden="true" />{w}</li>)}
          </ul>
        ) : null}
        <p className="rc-hint">{preview.cost} (ya usados: esta vista previa es el resultado real). {preview.newDocument ? 'Este documento no cambia.' : 'Al aplicar se guarda como versión nueva; la actual queda en el historial y se puede volver con «Deshacer».'}</p>
        <div className="rc-dialog-footer rc-dialog-footer--end">
          <button type="button" className="rc-btn rc-btn--ghost" disabled={applying} onClick={onDiscard}>Descartar</button>
          <button type="button" className="rc-btn rc-btn--primary" disabled={applying} onClick={onApply}>{applying ? 'Guardando…' : preview.newDocument ? 'Crear el PDF nuevo' : 'Aplicar'}</button>
        </div>
      </div>
    </Dialog>
  );
}
