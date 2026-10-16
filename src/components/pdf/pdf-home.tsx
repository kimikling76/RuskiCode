'use client';
import {useEffect, useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {toast} from 'sonner';
import {BookOpen, ChevronRight, Plus, Upload} from 'lucide-react';
import {editableBookSchema} from '@/lib/books/editable';
import type {BookSpec} from '@/lib/books/spec';
import {newBook} from '@/lib/books/templates';
import {composerBooks, createLocalBook, editorHref, listLocalBooks, type LocalBook} from '@/lib/books/library';
import {Dialog} from '@/components/ui/dialog';
import {Segmented} from '@/components/cinema/controls';

type Project = {id: string; name: string; brief: string};
const dateFormat = new Intl.DateTimeFormat('es-AR', {day: 'numeric', month: 'short', year: 'numeric'});

export function PdfHome({projects, legacy, onOpenProject, onOpenLegacy}: {projects: Project[]; legacy: {id: string; brief: string}[]; onOpenProject: (id: string) => void; onOpenLegacy: (id: string) => void}) {
  const router = useRouter();
  const [books, setBooks] = useState<LocalBook[] | null>(null);
  const [composer, setComposer] = useState<{id: string; projectId: string}[]>([]);
  const [creating, setCreating] = useState<{from?: Project} | null>(null);
  const [storageError, setStorageError] = useState(false);

  useEffect(() => {
    setComposer(composerBooks());
    listLocalBooks().then(setBooks).catch(() => { setBooks([]); setStorageError(true); });
  }, []);

  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 12_000_000) throw Error();
      const project = editableBookSchema.parse(JSON.parse(await file.text()));
      router.push(editorHref({kind: 'local', id: await createLocalBook({...project, layout: undefined})}));
    } catch {
      toast('Ese archivo no es un editable válido de PDF Studio.');
    }
  }

  return (
    <section className="rc-studio-page rc-pdf-home">
      <h1 className="rc-page-title"><BookOpen className="rc-page-icon" aria-hidden="true" />PDF Studio</h1>
      <p className="rc-page-lead">Libros, documentos y materiales. Se editan por bloques y se exportan a PDF.</p>
      <div className="rc-pdf-home-actions">
        <button type="button" className="rc-btn rc-btn--primary" onClick={() => setCreating({})}><Plus aria-hidden="true" />Nuevo libro</button>
        <label className="rc-btn rc-btn--secondary">
          <Upload aria-hidden="true" />Importar editable
          <input type="file" accept="application/json,.json" className="sr-only" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; void importFile(f); }} />
        </label>
      </div>
      {storageError ? <p className="rc-form-error" role="alert">Este navegador no permite guardar libros (almacenamiento bloqueado o modo privado).</p> : null}

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
            <p className="rc-hint">Creá uno nuevo, importá un editable o duplicá la muestra.</p>
          </div>
        )}
        <p className="rc-hint rc-pdf-home-note">Se guardan en este navegador. Descargá el editable (.json) para tener una copia o abrirlo en otra computadora.</p>
      </section>

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
