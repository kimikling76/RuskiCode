'use client';
import {useEffect, useMemo, useRef, useState} from 'react';
import {AlertTriangle, FileText} from 'lucide-react';
import type {BookSpec} from '@/lib/books/spec';
import type {EditableBook} from '@/lib/books/editable';
import {buildBook, suggestions, type ImportedDoc} from '@/lib/books/import/model';
import {readImport, ImportError, type ImportProgress} from '@/lib/books/import/browser';
import {Dialog} from '@/components/ui/dialog';
import {Segmented} from '@/components/cinema/controls';

type State =
  | {phase: 'reading'; progress: ImportProgress}
  | {phase: 'ready'; doc: ImportedDoc}
  | {phase: 'error'; message: string};

const sourceNames: Record<ImportedDoc['source'], string> = {pdf: 'PDF', docx: 'Word', html: 'HTML', markdown: 'Markdown', text: 'Texto'};
const count = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many);

/**
 * Reads a PDF, Word, HTML or text file in this browser and shows what will become of it before
 * creating the book: chapters, tables, images and anything that could not be kept.
 */
export function ImportDialog({file, onClose, onCreate}: {file: File | null; onClose: () => void; onCreate: (book: EditableBook) => Promise<void>}) {
  const [state, setState] = useState<State>({phase: 'reading', progress: {stage: 'loading'}});
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState<BookSpec['language']>('ru');
  const [format, setFormat] = useState<BookSpec['pageFormat']>('A4');
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!file) return;
    const controller = new AbortController();
    abort.current = controller;
    setState({phase: 'reading', progress: {stage: 'loading'}});
    setBusy(false);
    readImport(file, {signal: controller.signal, onProgress: progress => { if (!controller.signal.aborted) setState({phase: 'reading', progress}); }})
      .then(doc => {
        if (controller.signal.aborted) return;
        const s = suggestions(doc);
        setTitle(s.title); setLanguage(s.language); setFormat(s.pageFormat);
        setState({phase: 'ready', doc});
      })
      .catch(e => {
        if (controller.signal.aborted) return;
        setState({phase: 'error', message: e instanceof ImportError ? e.message : 'No se pudo leer el archivo. Probá de nuevo o guardalo como PDF o .docx.'});
      });
    return () => controller.abort();
  }, [file]);

  const preview = useMemo(() => {
    if (state.phase !== 'ready') return null;
    try { return buildBook(state.doc, {title, language, pageFormat: format}); } catch { return null; }
  }, [state, title, language, format]);

  function close() {
    abort.current?.abort();
    onClose();
  }

  async function create() {
    if (!preview || busy) return;
    setBusy(true);
    try { await onCreate(preview.book); } finally { setBusy(false); }
  }

  const progress = state.phase === 'reading' ? state.progress : null;
  const percent = progress?.total ? Math.round(((progress.page || 0) / progress.total) * 100) : null;

  return (
    <Dialog
      open={Boolean(file)}
      onClose={close}
      title={file ? 'Importar «' + file.name + '»' : 'Importar'}
      description="Se convierte en un libro editable: después lo exportás otra vez como PDF con «Exportar PDF»."
      wide
    >
      <div className="rc-dialog-body rc-import">
        {state.phase === 'reading' ? (
          <div className="rc-import-reading" role="status" aria-live="polite">
            <p>{progress?.stage === 'reading' && progress.total ? 'Leyendo la página ' + progress.page + ' de ' + progress.total + '…' : 'Abriendo el archivo…'}</p>
            <div className="rc-import-bar" role="progressbar" aria-label="Avance de la lectura" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined}>
              <span style={{width: (percent ?? 8) + '%'}} />
            </div>
            <p className="rc-hint">El archivo se lee en este navegador. No se sube a ningún lado ni lo lee una IA.</p>
            <div className="rc-dialog-footer rc-dialog-footer--end">
              <button type="button" className="rc-btn rc-btn--ghost" onClick={close}>Cancelar</button>
            </div>
          </div>
        ) : state.phase === 'error' ? (
          <>
            <p className="rc-form-error" role="alert">{state.message}</p>
            <div className="rc-dialog-footer rc-dialog-footer--end">
              <button type="button" className="rc-btn rc-btn--primary" onClick={close}>Entendido</button>
            </div>
          </>
        ) : (
          <form className="rc-import-form" onSubmit={e => { e.preventDefault(); void create(); }}>
            <p className="rc-import-summary">
              <FileText aria-hidden="true" />
              <span>
                <strong>{sourceNames[state.doc.source]}{state.doc.pages ? ' · ' + count(state.doc.pages, 'página', 'páginas') : ''}</strong>
                {preview ? (
                  <span className="rc-hint">
                    {[count(preview.report.chapters.length, 'capítulo', 'capítulos'), count(preview.report.blocks, 'bloque', 'bloques'), preview.report.tables ? count(preview.report.tables, 'tabla', 'tablas') : '', preview.report.images ? count(preview.report.images, 'imagen', 'imágenes') : ''].filter(Boolean).join(' · ')}
                  </span>
                ) : null}
              </span>
            </p>

            <label className="rc-field"><span>Título del libro</span><input className="rc-input" required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /></label>
            <div className="rc-import-options">
              <div className="rc-field"><span>Idioma</span>
                <Segmented name="import-language" label="Idioma del libro" value={language} onChange={setLanguage} options={[{value: 'ru', label: 'Ruso'}, {value: 'es', label: 'Español'}, {value: 'en', label: 'Inglés'}]} />
              </div>
              <div className="rc-field"><span>Formato</span>
                <Segmented name="import-format" label="Formato de página" value={format} onChange={setFormat} options={[{value: 'A4', label: 'A4'}, {value: 'A5', label: 'A5'}, {value: '6x9in', label: '6 × 9 in'}]} />
              </div>
            </div>

            {preview ? (
              <section className="rc-import-chapters" aria-label="Capítulos que se van a crear">
                <h3>Capítulos</h3>
                <ol>
                  {preview.report.chapters.map((c, i) => (
                    <li key={i}><span>{c.title}</span><span className="rc-hint">{count(c.blocks, 'bloque', 'bloques')}</span></li>
                  ))}
                </ol>
              </section>
            ) : <p className="rc-form-error" role="alert">No se pudo armar el libro con ese archivo.</p>}

            {preview?.report.notes.length ? (
              <section className="rc-import-notes" aria-label="Para revisar">
                <h3><AlertTriangle aria-hidden="true" />Para revisar</h3>
                <ul>{preview.report.notes.map(n => <li key={n}>{n}</li>)}</ul>
              </section>
            ) : null}

            <p className="rc-hint">Se importa el contenido (textos, títulos, listas, tablas e imágenes), no el diseño exacto: el libro usa el diseño del estudio y se puede editar bloque por bloque.</p>
            <div className="rc-dialog-footer rc-dialog-footer--end">
              <button type="button" className="rc-btn rc-btn--ghost" onClick={close}>Cancelar</button>
              <button type="submit" className="rc-btn rc-btn--primary" disabled={!preview || busy || !title.trim()}>{busy ? 'Creando…' : 'Crear libro editable'}</button>
            </div>
          </form>
        )}
      </div>
    </Dialog>
  );
}
