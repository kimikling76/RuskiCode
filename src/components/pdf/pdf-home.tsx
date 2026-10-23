'use client';
import {useEffect, useMemo, useState, type ReactNode} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {toast} from 'sonner';
import {BookOpen, ChevronDown, ChevronRight, Plus, Search, Upload} from 'lucide-react';
import type {EditableBook} from '@/lib/books/editable';
import {acceptedFiles, kindOf, ImportError} from '@/lib/books/import/browser';
import {ImportDialog} from './import-dialog';
import {createOriginal, deleteOriginal, fileSize, listOriginals, loadOriginalData, restoreOriginal, type OriginalPdf} from '@/lib/books/originals';
import {OperationError, runStirling} from '@/lib/stirling/client';
import {MAX_PDF_BYTES} from '@/lib/stirling/operations';
import {ConfirmDialog} from '@/components/ui/dialog';
import {editableBookSchema} from '@/lib/books/editable';
import type {BookSpec} from '@/lib/books/spec';
import {newBook} from '@/lib/books/templates';
import {composerBooks, createLocalBook, editorHref, listLocalBooks, libraryEvents, type LocalBook} from '@/lib/books/library';
import {getAsset, listUnits} from '@/lib/manual/store';
import type {Unit} from '@/lib/manual/model';
import {Dialog} from '@/components/ui/dialog';
import {Menu, MenuContent, MenuItem, MenuTrigger} from '@/components/ui/menu';
import {Segmented} from '@/components/cinema/controls';
import {NewUnitDialog, designModels, removeUnit, useManualImport} from '@/components/manual/manual-home';
import {BookStrip} from '@/components/kb/book-section';
import {BookCover, FirstPage, LibraryCard, type CardKind} from './library-card';

type Project = {id: string; name: string; brief: string};
const dateFormat = new Intl.DateTimeFormat('es-AR', {day: 'numeric', month: 'short', year: 'numeric'});
const plural = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many);
// Searching ignores case and accents: «tipografica» finds «Tipográfica».
const plain = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

type Filter = 'all' | 'book' | 'pdf' | 'unit';
type Item = {key: string; kind: CardKind; title: string; meta: string; href?: string; at: number; picture: ReactNode; onDelete?: () => void; deleteLabel?: string};

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
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [unitRemoving, setUnitRemoving] = useState<Unit | null>(null);
  const [newUnit, setNewUnit] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const manual = useManualImport();

  useEffect(() => {
    const load = () => {
      setComposer(composerBooks());
      listLocalBooks().then(setBooks).catch(() => { setBooks([]); setStorageError(true); });
      listOriginals().then(setOriginals).catch(() => setOriginals([]));
    };
    const loadUnits = () => { listUnits().then(setUnits).catch(() => setUnits([])); };
    load();
    loadUnits();
    // What arrives from another computer shows up without reloading.
    libraryEvents?.addEventListener('synced', load);
    libraryEvents?.addEventListener('synced', loadUnits);
    libraryEvents?.addEventListener('change', loadUnits);
    return () => {
      libraryEvents?.removeEventListener('synced', load);
      libraryEvents?.removeEventListener('synced', loadUnits);
      libraryEvents?.removeEventListener('change', loadUnits);
    };
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

  const models = designModels(units || []);
  // Everything in one list, the last touched first; the sample goes last.
  const items = useMemo<Item[]>(() => [
    ...(books || []).map((b): Item => ({
      key: 'book:' + b.id, kind: 'book', title: b.project.spec.title || 'Sin título', at: b.updatedAt, href: editorHref({kind: 'local', id: b.id}),
      meta: plural(b.project.chapters.length, 'capítulo', 'capítulos') + ' · ' + dateFormat.format(new Date(b.updatedAt)),
      picture: <BookCover title={b.project.spec.title} level={b.project.spec.level} language={b.project.spec.language} author={b.project.spec.author} />,
    })),
    ...originals.map((p): Item => ({
      key: 'pdf:' + p.id, kind: 'pdf', title: p.name, at: p.updatedAt, href: p.missing ? undefined : '/workspace/documento?id=' + p.id,
      meta: p.missing ? 'Quedó en la otra computadora' : fileSize(p.size) + ' · ' + dateFormat.format(new Date(p.updatedAt)),
      picture: <FirstPage cacheKey={'pdf:' + p.id + ':' + p.updatedAt} load={() => loadOriginalData(p.id)} missing={p.missing ? 'Más de 4 MB: está en la otra computadora' : undefined} />,
      onDelete: () => setRemoving(p), deleteLabel: 'Borrar PDF',
    })),
    ...(units || []).map((u): Item => ({
      key: 'unit:' + u.id, kind: 'unit', title: u.title, at: u.updatedAt, href: '/workspace/manual?id=' + u.id,
      meta: plural(u.pages.length, 'página', 'páginas') + ' · ' + dateFormat.format(new Date(u.updatedAt)),
      // The first page of the PDF it was imported from; a unit made from a design has no PDF of its own.
      picture: u.source ? <FirstPage cacheKey={'unit:' + u.source.asset} load={() => getAsset(u.source!.asset)} /> : <BookCover title={u.title} level={u.number ? 'Unidad ' + u.number : undefined} />,
      onDelete: () => setUnitRemoving(u), deleteLabel: 'Borrar unidad',
    })),
  ].sort((a, b) => b.at - a.at).concat({
    key: 'sample', kind: 'sample', title: 'Русский код · A1', at: 0, href: editorHref({kind: 'demo'}), meta: 'Para probar el editor',
    picture: <BookCover title="Русский код" level="A1" language="ru" />,
  }), [books, originals, units]);
  const counts = {all: items.length, book: items.filter(i => i.kind === 'book' || i.kind === 'sample').length, pdf: items.filter(i => i.kind === 'pdf').length, unit: items.filter(i => i.kind === 'unit').length};
  const wanted = plain(query.trim());
  const shown = items.filter(i => (filter === 'all' || i.kind === filter || (filter === 'book' && i.kind === 'sample')) && (!wanted || plain(i.title).includes(wanted)));
  const loading = books === null || units === null;
  const own = items.length - 1;
  const filters: [Filter, string][] = [['all', 'Todo'], ['book', 'Libros'], ['pdf', 'PDF'], ['unit', 'Manual']];
  const importInput = (describedBy?: string) => (
    <input type="file" accept={acceptedFiles} className="sr-only" aria-describedby={describedBy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; importFile(f); }} />
  );

  return (
    <section
      className="rc-studio-page rc-pdf-home rc-lib"
      data-dragging={dragging ? 'true' : undefined}
      onDragOver={e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDragging(true); } }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={e => { if (!e.dataTransfer.files.length) return; e.preventDefault(); setDragging(false); importFile(e.dataTransfer.files[0]); }}
    >
      {dragging ? <div className="rc-pdf-drop" aria-hidden="true"><Upload />Soltá el archivo para importarlo</div> : null}
      <header className="rc-lib-head">
        <div className="rc-lib-title">
          <h1 className="rc-page-title"><BookOpen className="rc-page-icon" aria-hidden="true" />PDF Studio</h1>
          <p id="pdf-import-hint" className="rc-page-lead">Libros, PDF y unidades del manual. Importá un PDF, un Word, un texto o un editable (.json), o arrastralo hasta acá.</p>
        </div>
        <div className="rc-lib-actions">
          <label className="rc-btn rc-btn--secondary"><Upload aria-hidden="true" />Importar{importInput('pdf-import-hint')}</label>
          <Menu>
            <MenuTrigger asChild>
              <button type="button" className="rc-btn rc-btn--primary"><Plus aria-hidden="true" />Nuevo<span className="sr-only"> libro o unidad</span><ChevronDown aria-hidden="true" /></button>
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem onSelect={() => setCreating({})}>Libro</MenuItem>
              <MenuItem disabled={!models.length} onSelect={() => setNewUnit(true)}>{models.length ? 'Unidad con el diseño del manual' : 'Unidad del manual (importá una primero)'}</MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </header>
      {storageError ? <p className="rc-form-error" role="alert">Este navegador no permite guardar libros (almacenamiento bloqueado o modo privado).</p> : null}
      {manual.busy ? <p className="rc-notice" role="status"><span className="rc-dot" aria-hidden="true" />{manual.busy}</p> : null}

      <BookStrip />

      <div className="rc-lib-bar">
        <div className="rc-lib-filters" role="group" aria-label="Mostrar">
          {filters.map(([id, name]) => (
            <button key={id} type="button" className="rc-chip" aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {name}<span className="rc-lib-count">{counts[id]}</span>
            </button>
          ))}
        </div>
        <label className="rc-lib-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Buscar en la biblioteca</span>
          <input type="search" className="rc-input" placeholder="Buscar" value={query} onChange={e => setQuery(e.target.value)} />
        </label>
      </div>

      {loading ? (
        <div className="rc-history-loading" role="status" aria-label="Cargando la biblioteca"><span className="rc-skeleton" /><span className="rc-skeleton" /></div>
      ) : shown.length || (!own && filter === 'all' && !wanted) ? (
        <ul className="rc-lib-grid" aria-label="Biblioteca">
          {/* With nothing of your own yet, the first card is where to start. */}
          {!own && filter === 'all' && !wanted ? (
            <li className="rc-lib-card rc-lib-start">
              <label className="rc-lib-open">
                <span className="rc-lib-thumb"><span className="rc-lib-page rc-lib-drop"><Upload aria-hidden="true" />Importar un archivo</span></span>
                <span className="rc-lib-text"><strong>Tu primer libro o PDF</strong><span>PDF, Word, texto o un editable, o arrastralo hasta acá</span></span>
                {importInput()}
              </label>
            </li>
          ) : null}
          {shown.map(i => <LibraryCard key={i.key} kind={i.kind} title={i.title} meta={i.meta} href={i.href} picture={i.picture} onDelete={i.onDelete} deleteLabel={i.deleteLabel} />)}
        </ul>
      ) : (
        <p className="rc-lib-none" role="status">{wanted ? 'Nada coincide con «' + query.trim() + '».' : filter === 'pdf' ? 'Todavía no hay PDF importados.' : filter === 'unit' ? 'Todavía no hay unidades del manual: importá el PDF de una unidad y elegí «Importar como unidad del manual».' : 'Todavía no hay libros propios.'}</p>
      )}
      <p className="rc-hint rc-lib-note">Todo se guarda en tu cuenta y aparece en tus otras computadoras. Los PDF de más de 4 MB quedan solo en la computadora donde los importaste.</p>

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
      <ImportDialog key={importing ? importing.name + importing.size + importing.lastModified : 'closed'} file={importing} onClose={() => setImporting(null)} onCreate={createImported} onEditOriginal={editOriginal} onWordToPdf={wordToPdf} onManualUnit={manual.importUnit} />
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={() => void confirmRemove()}
        title={'¿Borrar «' + (removing?.name || '') + '»?'}
        description="Se borra de tu cuenta, también en tus otras computadoras. Si querés conservarlo, descargalo antes desde el editor."
        confirmLabel="Borrar PDF"
        tone="danger"
      />
      <ConfirmDialog
        open={Boolean(unitRemoving)}
        onClose={() => setUnitRemoving(null)}
        onConfirm={() => { const u = unitRemoving; setUnitRemoving(null); if (u) void removeUnit(u); }}
        title={'¿Borrar «' + (unitRemoving?.title || '') + '»?'}
        description="Se borra de tu cuenta con sus versiones, también en tus otras computadoras. Si querés conservarla, exportá el PDF antes."
        confirmLabel="Borrar unidad"
        tone="danger"
      />
      <NewUnitDialog open={newUnit} models={models} onClose={() => setNewUnit(false)} onCreated={id => router.push('/workspace/manual?id=' + id)} />
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
