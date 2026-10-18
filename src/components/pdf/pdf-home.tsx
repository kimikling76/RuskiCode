'use client';
import {useEffect, useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {toast} from 'sonner';
import {BookOpen, ChevronRight, FileText, Plus, Trash2, Upload} from 'lucide-react';
import type {EditableBook} from '@/lib/books/editable';
import {acceptedFiles, kindOf, ImportError} from '@/lib/books/import/browser';
import {ImportDialog} from './import-dialog';
import {createOriginal, deleteOriginal, fileSize, listOriginals, restoreOriginal, type OriginalPdf} from '@/lib/books/originals';
import {OperationError, runStirling} from '@/lib/stirling/client';
import {MAX_PDF_BYTES} from '@/lib/stirling/operations';
import {ConfirmDialog} from '@/components/ui/dialog';
import {editableBookSchema} from '@/lib/books/editable';
import type {BookSpec} from '@/lib/books/spec';
import {newBook} from '@/lib/books/templates';
import {composerBooks, createLocalBook, editorHref, listLocalBooks, libraryEvents, type LocalBook} from '@/lib/books/library';
import {Dialog} from '@/components/ui/dialog';
import {Segmented} from '@/components/cinema/controls';
import {ManualSection} from '@/components/manual/manual-home';
import {BookSection} from '@/components/kb/book-section';

type Project = {id: string; name: string; brief: string};
const dateFormat = new Intl.DateTimeFormat('es-AR', {day: 'numeric', month: 'short', year: 'numeric'});

export function PdfHome({projects, legacy, onOpenProject, onOpenLegacy}: {projects: Project[]; legacy: {id: string; brief: string}[]; onOpenProject: (id: string) => void; onOpenLegacy: (id: string) => void}) {
  const router = useRouter();
  const [books, setBooks] = useState<LocalBook[] | null>(null);
  const [composer, setComposer] = useState<{id: string; projectId: string}[]>([]);
  const [creating, setCreating] = useState<{from?: Project} | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [importing, setImporting] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [originals, setOriginals] = useState<OriginalPdf[]>([]);
  const [removing, setRemoving] = useState<OriginalPdf | null>(null);

  useEffect(() => {
    const load = () => {
      setComposer(composerBooks());
      listLocalBooks().then(setBooks).catch(() => { setBooks([]); setStorageError(true); });
      listOriginals().then(setOriginals).catch(() => setOriginals([]));
    };
    load();
    // Books that arrive from another computer show up without reloading.
    libraryEvents?.addEventListener('synced', load);
    return () => libraryEvents?.removeEventListener('synced', load);
  }, []);

  async function importEditable(file: File) {
    try {
      if (file.size > 12_000_000) throw Error();
      const project = editableBookSchema.parse(JSON.parse(await file.text()));
      router.push(editorHref({kind: 'local', id: await createLocalBook({...project, layout: undefined})}));
    } catch {
      toast('Ese archivo no es un editable válido de PDF Studio.');
    }
  }

  // The .json editable opens as it is; PDF, Word, HTML and text go through the import dialog.
  function importFile(file?: File) {
    if (!file) return;
    try {
      if (kindOf(file) === 'json') { void importEditable(file); return; }
    } catch (e) {
      toast(e instanceof ImportError ? e.message : 'Ese archivo no se puede importar.');
      return;
    }
    setImporting(file);
  }

  async function editOriginal(file: File) {
    try {
      const id = await createOriginal(file.name, await file.arrayBuffer());
      setImporting(null);
      router.push('/workspace/documento?id=' + id);
    } catch (e) {
      toast(e instanceof Error && e.message === 'NOT_PDF' ? 'Ese archivo no es un PDF válido.' : 'No se pudo guardar el PDF en este navegador.');
    }
  }

  // Word → PDF on Stirling's server, then the PDF is kept and edited as it is.
  async function wordToPdf(file: File) {
    if (file.size > MAX_PDF_BYTES) { toast('Ese Word pesa más de 4 MB, el máximo que pasa por el servidor hacia Stirling.'); return; }
    try {
      const out = await runStirling('from-word', {}, await file.arrayBuffer());
      const id = await createOriginal(file.name.replace(/\.docx$/i, ''), out.bytes, 'Convertido de Word con Stirling');
      setImporting(null);
      router.push('/workspace/documento?id=' + id);
    } catch (e) {
      toast(e instanceof OperationError ? e.message : 'No se pudo convertir el Word.', {duration: 9000});
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    const saved = await deleteOriginal(removing.id);
    setRemoving(null);
    setOriginals(await listOriginals());
    if (saved) toast('PDF borrado', {action: {label: 'Deshacer', onClick: () => { void restoreOriginal(saved).then(() => listOriginals().then(setOriginals)); }}, duration: 8000});
  }

  async function createImported(book: EditableBook) {
    try {
      const id = await createLocalBook(book);
      setImporting(null);
      toast('Libro importado. Revisá títulos y tablas antes de exportar.');
      router.push(editorHref({kind: 'local', id}));
    } catch {
      toast('No se pudo guardar el libro en este navegador.');
    }
  }

  return (
    <section
      className="rc-studio-page rc-pdf-home"
      data-dragging={dragging ? 'true' : undefined}
      onDragOver={e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDragging(true); } }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={e => { if (!e.dataTransfer.files.length) return; e.preventDefault(); setDragging(false); importFile(e.dataTransfer.files[0]); }}
    >
      {dragging ? <div className="rc-pdf-drop" aria-hidden="true"><Upload />Soltá el archivo para importarlo</div> : null}
      <h1 className="rc-page-title"><BookOpen className="rc-page-icon" aria-hidden="true" />PDF Studio</h1>
      <p className="rc-page-lead">Libros, documentos y materiales. Se editan por bloques y se exportan a PDF.</p>
      <div className="rc-pdf-home-actions">
        <button type="button" className="rc-btn rc-btn--primary" onClick={() => setCreating({})}><Plus aria-hidden="true" />Nuevo libro</button>
        <label className="rc-btn rc-btn--secondary">
          <Upload aria-hidden="true" />Importar archivo
          <input type="file" accept={acceptedFiles} className="sr-only" aria-describedby="pdf-import-hint" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; importFile(f); }} />
        </label>
      </div>
      <p id="pdf-import-hint" className="rc-hint rc-pdf-home-note">PDF, Word (.docx), texto, Markdown, HTML o un editable (.json). También podés arrastrarlo hasta acá. Un PDF se puede editar tal cual o convertir en bloques.</p>
      {storageError ? <p className="rc-form-error" role="alert">Este navegador no permite guardar libros (almacenamiento bloqueado o modo privado).</p> : null}

      <BookSection />

      <ManualSection />

      <section className="rc-page-section">
        <h2>Tus libros</h2>
        {books === null ? (
          <div className="rc-history-loading" role="status" aria-label="Cargando libros"><span className="rc-skeleton" /><span className="rc-skeleton" /></div>
        ) : books.length ? (
          <ul className="rc-project-list">
            {books.map(b => (
              <li key={b.id}>
                <Link href={editorHref({kind: 'local', id: b.id})} className="rc-project-row">
                  <span className="rc-project-name">{b.project.spec.title}</span>
                  <span className="rc-project-type">{b.project.chapters.length} {b.project.chapters.length === 1 ? 'capítulo' : 'capítulos'} · {dateFormat.format(new Date(b.updatedAt))}</span>
                  <ChevronRight aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rc-empty">
            <p className="rc-empty-title">Todavía no hay libros propios.</p>
            <p className="rc-hint">Creá uno nuevo, importá un PDF o un Word, o duplicá la muestra.</p>
          </div>
        )}
        <p className="rc-hint rc-pdf-home-note">Se guardan en tu cuenta y aparecen en tus otras computadoras. También podés descargar el editable (.json) como copia.</p>
      </section>

      {originals.length ? (
        <section className="rc-page-section">
          <h2>PDF importados</h2>
          <ul className="rc-project-list">
            {originals.map(p => (
              <li key={p.id} className="rc-pdf-project-row">
                {p.missing ? (
                  <span className="rc-project-row" aria-disabled="true">
                    <span className="rc-project-name"><FileText aria-hidden="true" />{p.name}</span>
                    <span className="rc-project-type">Más de 4 MB: quedó en la otra computadora</span>
                  </span>
                ) : (
                  <Link href={'/workspace/documento?id=' + p.id} className="rc-project-row">
                    <span className="rc-project-name"><FileText aria-hidden="true" />{p.name}</span>
                    <span className="rc-project-type">{fileSize(p.size)} · {dateFormat.format(new Date(p.updatedAt))}</span>
                    <ChevronRight aria-hidden="true" />
                  </Link>
                )}
                <button type="button" className="rc-icon-btn" aria-label={'Borrar ' + p.name} onClick={() => setRemoving(p)}><Trash2 aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
          <p className="rc-hint rc-pdf-home-note">Se editan tal cual: páginas, notas y texto con Stirling PDF, y cada cambio queda como versión. Los de hasta 4 MB se guardan en tu cuenta (con sus versiones) y aparecen en tus otras computadoras.</p>
        </section>
      ) : null}

      {composer.length ? (
        <section className="rc-page-section">
          <h2>Del compositor</h2>
          <ul className="rc-project-list">
            {composer.map(b => (
              <li key={b.id}>
                <Link href={editorHref({kind: 'server', id: b.id})} className="rc-project-row">
                  <span className="rc-project-name">{legacy.find(p => p.id === b.projectId)?.brief || 'Libro ' + b.id.slice(0, 8)}</span>
                  <span className="rc-project-type">Guardado en el servidor</span>
                  <ChevronRight aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rc-page-section">
        <h2>Muestra</h2>
        <ul className="rc-project-list">
          <li>
            <Link href={editorHref({kind: 'demo'})} className="rc-project-row">
              <span className="rc-project-name">Русский код · A1</span>
              <span className="rc-project-type">Muestra para probar el editor</span>
              <ChevronRight aria-hidden="true" />
            </Link>
          </li>
        </ul>
      </section>

      {projects.length ? (
        <section className="rc-page-section">
          <h2>Proyectos desde el Chat</h2>
          <ul className="rc-project-list">
            {projects.map(p => (
              <li key={p.id} className="rc-pdf-project-row">
                <button type="button" className="rc-project-row" onClick={() => onOpenProject(p.id)}>
                  <span className="rc-project-name">{p.name}</span>
                  <span className="rc-project-type">Brief</span>
                </button>
                <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => setCreating({from: p})}>Crear libro</button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {legacy.length ? (
        <section className="rc-page-section">
          <h2>Herramientas anteriores</h2>
          <ul className="rc-project-list">
            {legacy.map(p => (
              <li key={p.id}>
                <button type="button" className="rc-project-row" onClick={() => onOpenLegacy(p.id)}>
                  <span className="rc-project-name">{p.brief}</span>
                  <ChevronRight aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* A new dialog per file, so it never shows the previous file's summary. */}
      <ImportDialog key={importing ? importing.name + importing.size + importing.lastModified : 'closed'} file={importing} onClose={() => setImporting(null)} onCreate={createImported} onEditOriginal={editOriginal} onWordToPdf={wordToPdf} />
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={() => void confirmRemove()}
        title={'¿Borrar «' + (removing?.name || '') + '»?'}
        description="Se borra de tu cuenta, también en tus otras computadoras. Si querés conservarlo, descargalo antes desde el editor."
        confirmLabel="Borrar PDF"
        tone="danger"
      />
      <NewBookDialog open={Boolean(creating)} from={creating?.from} onClose={() => setCreating(null)} onCreate={id => router.push(editorHref({kind: 'local', id}))} />
    </section>
  );
}

export function NewBookDialog({open, from, onClose, onCreate}: {open: boolean; from?: Project; onClose: () => void; onCreate: (id: string) => void}) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [language, setLanguage] = useState<BookSpec['language']>('ru');
  const [level, setLevel] = useState<BookSpec['level']>('A1');
  const [format, setFormat] = useState<BookSpec['pageFormat']>('A4');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setTitle(from?.name || ''); setAuthor(''); } }, [open, from]);

  async function create() {
    setBusy(true);
    try {
      onCreate(await createLocalBook(newBook({title, author, language, level, pageFormat: format, goal: from?.brief})));
      onClose();
    } catch {
      toast('No se pudo crear el libro en este navegador.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={from ? 'Libro desde «' + from.name + '»' : 'Nuevo libro'} description={from ? 'El brief del proyecto queda como objetivo del libro, para el asistente. El primer capítulo arranca con la plantilla de unidad.' : 'Arranca con un capítulo de unidad: título, vocabulario, diálogo, ejercicio y repaso.'}>
      <form className="rc-dialog-body" onSubmit={e => { e.preventDefault(); if (title.trim()) void create(); }}>
        <label className="rc-field"><span>Título</span><input className="rc-input" autoFocus required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label className="rc-field"><span>Autor (opcional)</span><input className="rc-input" maxLength={200} value={author} onChange={e => setAuthor(e.target.value)} /></label>
        <div className="rc-field"><span>Idioma del libro</span>
          <Segmented name="new-language" label="Idioma del libro" value={language} onChange={setLanguage} options={[{value: 'ru', label: 'Ruso'}, {value: 'es', label: 'Español'}, {value: 'en', label: 'Inglés'}]} />
        </div>
        <div className="rc-field"><span>Nivel</span>
          <Segmented name="new-level" label="Nivel" value={level} onChange={setLevel} options={(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const).map(l => ({value: l, label: l}))} />
        </div>
        <div className="rc-field"><span>Formato</span>
          <Segmented name="new-format" label="Formato" value={format} onChange={setFormat} options={[{value: 'A4', label: 'A4'}, {value: 'A5', label: 'A5'}, {value: '6x9in', label: '6 × 9 in'}]} />
        </div>
        <div className="rc-dialog-footer rc-dialog-footer--end">
          <button type="button" className="rc-btn rc-btn--ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="rc-btn rc-btn--primary" disabled={busy || !title.trim()}>Crear libro</button>
        </div>
      </form>
    </Dialog>
  );
}
