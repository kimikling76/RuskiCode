'use client';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import Link from 'next/link';
import {useRouter, useSearchParams} from 'next/navigation';
import {useQuery} from '@tanstack/react-query';
import * as Tabs from '@radix-ui/react-tabs';
import {arrayMove} from '@dnd-kit/sortable';
import {toast} from 'sonner';
import {BookOpen, ChevronRight, Download, MoreHorizontal, Redo2, Undo2} from 'lucide-react';
import {editableBookSchema, type EditableBook} from '@/lib/books/editable';
import type {BookSpec} from '@/lib/books/spec';
import type {Block, Chapter} from '@/lib/pipeline/types';
import {templateBlocks, unitChapter, emptyChapter, type TemplateId} from '@/lib/books/templates';
import {clearDraft, createLocalBook, deleteLocalBook, editorHref, loadDraft, loadLocalBook, saveDraft, saveLocalBook, type BookSource} from '@/lib/books/library';
import {useNotes} from '@/store/book-notes';
import {NavTrigger} from '@/components/studio/sidebar';
import {ConfirmDialog} from '@/components/ui/dialog';
import {Menu, MenuTrigger, MenuContent, MenuItem, MenuLink, MenuSeparator} from '@/components/ui/menu';
import {Tip} from '@/components/ui/tooltip';
import {PageCanvas, type CanvasHandle, type LayoutState, type PageInfo} from './page-canvas';
import {PageRail, issueText} from './page-rail';
import {BlockForm} from './block-form';
import {ChapterPanel} from './chapter-panel';
import {BookPanel} from './book-panel';
import {AssistantPanel} from './assistant-panel';
import {NotesPanel} from './notes-panel';
import {InsertMenu} from './insert-menu';
import type {EditorApi, Selection} from './editor-api';

type Tab = 'block' | 'chapter' | 'book' | 'assistant' | 'notes';
const MAX_CHAPTERS = 12;
const MAX_BLOCKS = 100;
const remoteErrors: Record<string, string> = {
  RELOAD_REQUIRED: 'El libro cambió en el servidor. Recargá la página antes de volver a enviar.',
  WORKER_OFFLINE: 'El compositor está apagado.',
  RATE_LIMIT: 'Demasiados envíos seguidos. Esperá un rato.',
  INVALID_PROJECT: 'Hay campos que el compositor no acepta (por ejemplo, textos vacíos).',
};

function sourceFrom(params: URLSearchParams): BookSource {
  const local = params.get('local');
  const server = params.get('book');
  return local ? {kind: 'local', id: local} : server ? {kind: 'server', id: server} : {kind: 'demo'};
}

// Images no block uses any more are dropped, so the 24-image limit only counts real ones.
function pruneAssets(book: EditableBook): EditableBook {
  const used = new Set(book.chapters.flatMap(c => c.blocks).flatMap(b => b.type === 'image' && b.assetId ? [b.assetId] : []));
  const keys = Object.keys(book.assets);
  if (keys.every(k => used.has(k))) return book;
  return {...book, assets: Object.fromEntries(keys.filter(k => used.has(k)).map(k => [k, book.assets[k]]))};
}

function withNewIds(blocks: Block[]): Block[] {
  return blocks.map(b => ({...b, id: crypto.randomUUID()}));
}

export function BookEditor() {
  const params = useSearchParams();
  const router = useRouter();
  const source = useMemo(() => sourceFrom(new URLSearchParams(params.toString())), [params]);
  const bookKey = source.kind === 'demo' ? 'demo' : source.kind + ':' + source.id;

  const [book, setBook] = useState<EditableBook | null>(null);
  const bookRef = useRef<EditableBook | null>(null);
  const past = useRef<EditableBook[]>([]);
  const future = useRef<EditableBook[]>([]);
  const lastKey = useRef<{key: string; at: number} | null>(null);
  const [, setHistoryVersion] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);
  const [remoteStatus, setRemoteStatus] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [selection, setSelection] = useState<Selection>({chapter: 0, blockId: null});
  const [tab, setTab] = useState<Tab>('chapter');
  const [layout, setLayout] = useState<LayoutState>({status: 'working', pages: [], css: '', pageSize: {w: 794, h: 1123}, missingImages: 0});
  const [visiblePage, setVisiblePage] = useState(0);
  const [zoom, setZoom] = useState<'fit' | number>('fit');
  const [exportConfirm, setExportConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const canvas = useRef<CanvasHandle>(null);
  const pendingScroll = useRef<string | null>(null);
  const notes = useNotes(s => s.notes);
  const hydrateNotes = useNotes(s => s.hydrate);

  useEffect(() => { hydrateNotes(); }, [hydrateNotes]);

  const {data: setup} = useQuery<{configured: boolean; workerOnline: boolean}>({
    queryKey: ['pipeline-setup'], enabled: source.kind === 'server',
    queryFn: () => fetch('/api/books').then(r => r.json()),
  });
  const {data: job} = useQuery<{artifacts: {id: string; name: string}[]}>({
    queryKey: ['editor-job', bookKey], enabled: source.kind === 'server',
    queryFn: async () => { const r = await fetch('/api/books/' + (source as {id: string}).id); if (!r.ok) throw Error(); return r.json(); },
  });

  function replace(next: EditableBook) {
    bookRef.current = next;
    setBook(next);
  }

  // Load: a local book, a composer book (with its unsent draft) or the bundled sample.
  useEffect(() => {
    let active = true;
    bookRef.current = null; setBook(null); setLoadError(''); setDirty(false); setSaveState('idle');
    past.current = []; future.current = []; setSelection({chapter: 0, blockId: null});
    (async () => {
      try {
        if (source.kind === 'local') {
          const stored = await loadLocalBook(source.id);
          if (!stored) throw Error('NOT_FOUND');
          if (active) replace(stored.project);
          return;
        }
        const r = await fetch(source.kind === 'server' ? `/api/books/${source.id}/project` : '/demo/ruskicode-sample.json');
        if (!r.ok) throw Error(r.status === 401 ? 'AUTH' : 'LOAD');
        const data = await r.json();
        const base = editableBookSchema.parse(source.kind === 'server' ? data.project : data);
        const rev = data.revision || 0;
        const draft = await loadDraft(source).catch(() => undefined);
        if (!active) return;
        setRevision(rev);
        setRemoteStatus(data.status || 'demo');
        if (draft && draft.revision === rev) { replace(draft.project); setDirty(true); setSaveState('saved'); }
        else replace({...base, layout: undefined});
      } catch (e) {
        if (active) setLoadError(e instanceof Error && e.message === 'AUTH' ? 'Iniciá sesión para abrir este libro.' : e instanceof Error && e.message === 'NOT_FOUND' ? 'Este libro no está en este navegador.' : 'No se pudo abrir el libro.');
      }
    })();
    return () => { active = false; };
  }, [bookKey]); // the source is derived from bookKey

  // Autosave in this browser shortly after each change.
  useEffect(() => {
    if (!book || !dirty) return;
    setSaveState('saving');
    const timer = setTimeout(async () => {
      try {
        if (source.kind === 'local') await saveLocalBook(source.id, book);
        else await saveDraft(source, revision, book);
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [book, dirty]); // source and revision are stable while editing

  const commit = useCallback((next: EditableBook, key?: string) => {
    const prev = bookRef.current;
    if (!prev) return;
    const now = Date.now();
    // Consecutive typing in the same field is one undo step.
    if (key && lastKey.current?.key === key && now - lastKey.current.at < 1500) lastKey.current.at = now;
    else { past.current = [...past.current.slice(-49), prev]; lastKey.current = key ? {key, at: now} : null; }
    future.current = [];
    replace(next);
    setDirty(true);
    setHistoryVersion(v => v + 1);
  }, []);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev || !bookRef.current) return;
    future.current.push(bookRef.current);
    lastKey.current = null;
    replace(prev); setDirty(true); setHistoryVersion(v => v + 1);
  }, []);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next || !bookRef.current) return;
    past.current.push(bookRef.current);
    lastKey.current = null;
    replace(next); setDirty(true); setHistoryVersion(v => v + 1);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.closest('input, textarea, select, [contenteditable="true"]'))) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const current = () => bookRef.current!;
  const setChapters = (chapters: Chapter[], key?: string, prune = false) => {
    const next = {...current(), chapters};
    commit(prune ? pruneAssets(next) : next, key);
  };
  const locate = (id: string) => {
    const chapters = current().chapters;
    for (let c = 0; c < chapters.length; c++) {
      const i = chapters[c].blocks.findIndex(b => b.id === id);
      if (i >= 0) return {c, i};
    }
    return null;
  };
  const editChapter = (c: number, fn: (blocks: Block[]) => Block[], key?: string, prune = false) =>
    setChapters(current().chapters.map((ch, i) => i === c ? {...ch, blocks: fn(ch.blocks)} : ch), key, prune);

  function insertBlocks(blocks: Block[]) {
    const b = current();
    const c = selection.chapter >= 0 ? selection.chapter : b.chapters.length - 1;
    const chapter = b.chapters[c];
    if (!chapter) return;
    if (chapter.blocks.length + blocks.length > MAX_BLOCKS) { toast('Un capítulo admite hasta ' + MAX_BLOCKS + ' bloques.'); return; }
    const at = selection.blockId ? chapter.blocks.findIndex(x => x.id === selection.blockId) + 1 : chapter.blocks.length;
    editChapter(c, list => [...list.slice(0, at), ...blocks, ...list.slice(at)]);
    setSelection({chapter: c, blockId: blocks[0].id});
    setTab(t => t === 'assistant' || t === 'notes' ? t : 'block');
    pendingScroll.current = blocks[0].id;
  }

  const canSubmit = source.kind === 'server' && Boolean(setup?.configured && setup.workerOnline) && ['complete', 'needs-review', 'failed', 'queue-error', 'awaiting-assets', 'awaiting-references'].includes(remoteStatus);
  const pdf = job?.artifacts.find(a => a.name === 'book.pdf');

  const api: EditorApi | null = book ? {
    book,
    selection,
    select: (chapter, blockId) => { setSelection({chapter, blockId}); if (blockId) { canvas.current?.scrollToBlock(blockId); setTab(t => t === 'assistant' || t === 'notes' ? t : 'block'); } },
    updateBlock: (id, patch, key) => { const at = locate(id); if (at) editChapter(at.c, list => list.map(x => x.id === id ? {...x, ...patch} as Block : x), key); },
    moveBlock: (id, by) => { const at = locate(id); if (at && at.i + by >= 0 && at.i + by < current().chapters[at.c].blocks.length) editChapter(at.c, list => arrayMove(list, at.i, at.i + by)); },
    reorderBlocks: (c, from, to) => editChapter(c, list => arrayMove(list, from, to)),
    duplicateBlock: id => {
      const at = locate(id);
      if (!at) return;
      const copy = {...current().chapters[at.c].blocks[at.i], id: crypto.randomUUID()};
      editChapter(at.c, list => [...list.slice(0, at.i + 1), copy, ...list.slice(at.i + 1)]);
      setSelection({chapter: at.c, blockId: copy.id});
    },
    deleteBlock: id => {
      const at = locate(id);
      if (!at || current().chapters[at.c].blocks.length <= 1) return;
      const list = current().chapters[at.c].blocks;
      const neighbor = list[at.i + 1] || list[at.i - 1];
      editChapter(at.c, l => l.filter(x => x.id !== id), undefined, true);
      setSelection({chapter: at.c, blockId: neighbor?.id || null});
      toast('Bloque borrado', {action: {label: 'Deshacer', onClick: undo}});
    },
    insertBlocks,
    insertTemplate: (t: TemplateId) => insertBlocks(templateBlocks(t, current().spec.language)),
    updateChapter: (index, patch, key) => setChapters(current().chapters.map((ch, i) => i === index ? {...ch, ...patch} : ch), key),
    addChapter: kind => {
      const b = current();
      if (b.chapters.length >= MAX_CHAPTERS) { toast('El libro admite hasta ' + MAX_CHAPTERS + ' capítulos.'); return; }
      const chapter = kind === 'unit' ? unitChapter(b.spec.language) : emptyChapter(b.spec.language);
      setChapters([...b.chapters, chapter]);
      setSelection({chapter: b.chapters.length, blockId: null});
      setTab('chapter');
      pendingScroll.current = chapter.blocks[0].id;
    },
    moveChapter: (index, by) => { const chapters = current().chapters; if (index + by < 0 || index + by >= chapters.length) return; setChapters(arrayMove(chapters, index, index + by)); setSelection({chapter: index + by, blockId: null}); },
    duplicateChapter: index => {
      const chapters = current().chapters;
      if (chapters.length >= MAX_CHAPTERS) return;
      const copy = {...chapters[index], title: chapters[index].title, blocks: withNewIds(chapters[index].blocks)};
      setChapters([...chapters.slice(0, index + 1), copy, ...chapters.slice(index + 1)]);
      setSelection({chapter: index + 1, blockId: null});
    },
    deleteChapter: index => {
      const chapters = current().chapters;
      if (chapters.length <= 1) return;
      setChapters(chapters.filter((_, i) => i !== index), undefined, true);
      setSelection({chapter: Math.max(0, index - 1), blockId: null});
    },
    updateSpec: (patch: Partial<BookSpec>, key) => commit({...current(), spec: {...current().spec, ...patch}}, key),
    setImage: (blockId, data) => {
      const b = current();
      const at = locate(blockId);
      if (!at) return;
      const block = b.chapters[at.c].blocks[at.i];
      if (block.type !== 'image') return;
      const assetKey = block.assetId || block.id;
      const assets = {...b.assets};
      if (data) {
        if (!assets[assetKey] && Object.keys(assets).length >= 24) { toast('El libro admite hasta 24 imágenes.'); return; }
        assets[assetKey] = data;
      } else delete assets[assetKey];
      commit({...b, assets, chapters: b.chapters.map((ch, i) => i !== at.c ? ch : {...ch, blocks: ch.blocks.map(x => x.id === blockId ? {...x, assetId: data ? assetKey : undefined} as Block : x)})});
    },
    server: source.kind === 'server' ? {canSubmit, busy, submit: (action, target) => void submit(action, target)} : null,
  } : null;

  async function submit(action: 'render' | 'chapter' | 'image', target?: string) {
    if (!book || source.kind !== 'server') return;
    const valid = editableBookSchema.safeParse(book);
    if (!valid.success) { toast(remoteErrors.INVALID_PROJECT); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/books/${source.id}/project`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({revision, action, project: {...valid.data, layout: undefined}, target})});
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw Error(data.error || 'EDIT_FAILED');
      setRevision(data.revision); setRemoteStatus('queued'); setDirty(false);
      await clearDraft(source).catch(() => undefined);
      toast('Enviado al compositor. El PDF nuevo aparece cuando termine.');
    } catch (e) {
      toast(remoteErrors[e instanceof Error ? e.message : ''] || 'No se pudo enviar al compositor.');
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!book) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({...book, layout: undefined}, null, 2)], {type: 'application/json'}));
    const a = document.createElement('a');
    a.href = url;
    a.download = (book.spec.title || 'libro').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() + '.editable.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function duplicateAsLocal() {
    if (!book) return;
    try {
      const id = await createLocalBook(pruneAssets({...book, layout: undefined}));
      router.push(editorHref({kind: 'local', id}));
    } catch {
      toast('No se pudo crear la copia. Revisá que el libro no tenga campos vacíos.');
    }
  }

  function exportPdf() {
    if (layout.missingImages) setExportConfirm(true);
    else canvas.current?.print();
  }

  const onLayout = useCallback((next: LayoutState) => {
    setLayout(prev => next.status === 'working' ? {...prev, status: 'working'} : next);
  }, []);

  // After the new pages are committed (the paper has its final height), bring a new block into view.
  useEffect(() => {
    if (layout.status === 'working' || !pendingScroll.current) return;
    const id = pendingScroll.current;
    pendingScroll.current = null;
    canvas.current?.scrollToBlock(id);
  }, [layout]);

  const onCanvasSelect = useCallback((blockId: string | null, chapter: number) => {
    setSelection({chapter, blockId});
    setTab(t => blockId ? (t === 'assistant' || t === 'notes' ? t : 'block') : 'book');
  }, []);

  function pickPage(page: PageInfo) {
    canvas.current?.scrollToPage(page.index);
    if (page.chapter >= 0) { setSelection({chapter: page.chapter, blockId: null}); setTab(t => t === 'book' || t === 'block' ? 'chapter' : t); }
    else setTab('book');
  }

  const noted = useMemo(() => new Set(notes.filter(n => n.book === bookKey && !n.resolved && n.blockId).map(n => n.blockId!)), [notes, bookKey]);

  if (loadError) {
    return (
      <div className="rc-cine-empty rc-cine-empty--page">
        <h2>{loadError}</h2>
        <Link href="/workspace?studio=pdf" className="rc-btn rc-btn--secondary">Volver a PDF Studio</Link>
      </div>
    );
  }
  if (!book || !api) {
    return <div className="rc-loading" role="status"><span className="rc-skeleton" /><span className="rc-skeleton" /><span className="rc-skeleton" /><span className="sr-only">Abriendo el libro…</span></div>;
  }

  const selectedBlock = book.chapters[selection.chapter]?.blocks.find(b => b.id === selection.blockId);
  const sourceLabel = source.kind === 'local' ? 'En este navegador' : source.kind === 'server' ? 'Compositor · revisión ' + revision : 'Muestra';
  const saveLabel = saveState === 'saving' ? 'Guardando…' : saveState === 'saved' ? (source.kind === 'local' ? 'Guardado' : 'Borrador guardado') : saveState === 'error' ? 'No se pudo guardar' : '';
  const issues = layout.pages.flatMap(p => p.issues.map(code => ({page: p.index + 1, code})));

  return (
    <div className="rc-pdf">
      <header className="rc-topbar rc-pdf-bar">
        <NavTrigger />
        <div className="rc-studio-identity rc-pdf-identity">
          <BookOpen aria-hidden="true" />
          <Link href="/workspace?studio=pdf" className="rc-crumb">PDF Studio</Link>
          <ChevronRight className="rc-crumb-sep" aria-hidden="true" />
          <span className="rc-crumb-current" title={book.spec.title}>{book.spec.title || 'Sin título'}</span>
          <span className="rc-pdf-source">{sourceLabel}</span>
        </div>
        <span className={'rc-pdf-save' + (saveState === 'error' ? ' is-error' : '')} role="status">{saveLabel}</span>
        <div className="rc-topbar-actions">
          <Tip label="Deshacer" shortcut="⌘Z"><button type="button" className="rc-icon-btn" aria-label="Deshacer" disabled={!past.current.length} onClick={undo}><Undo2 /></button></Tip>
          <Tip label="Rehacer" shortcut="⇧⌘Z"><button type="button" className="rc-icon-btn" aria-label="Rehacer" disabled={!future.current.length} onClick={redo}><Redo2 /></button></Tip>
          <div className="rc-segmented rc-segmented--compact rc-pdf-zoom" role="radiogroup" aria-label="Zoom">
            {([['fit', 'Ajustar'], [1, '100%']] as const).map(([v, label]) => (
              <label key={String(v)}><input type="radio" name="zoom" checked={zoom === v} onChange={() => setZoom(v)} /><strong>{label}</strong></label>
            ))}
          </div>
          <Tip label="Se abre el diálogo de impresión: elegí «Guardar como PDF».">
            <button type="button" className="rc-btn rc-btn--primary rc-btn--sm rc-pdf-export" aria-label="Exportar PDF" disabled={layout.status !== 'ready'} onClick={exportPdf}><Download aria-hidden="true" /><span>Exportar PDF</span></button>
          </Tip>
          <Menu>
            <MenuTrigger asChild><button type="button" className="rc-icon-btn" aria-label="Más opciones del libro"><MoreHorizontal /></button></MenuTrigger>
            <MenuContent>
              <MenuItem onSelect={download}>Descargar editable (.json)</MenuItem>
              {source.kind !== 'local' ? <MenuItem onSelect={() => void duplicateAsLocal()}>Duplicar como libro propio</MenuItem> : null}
              {source.kind === 'server' ? (
                <>
                  <MenuSeparator />
                  <MenuItem disabled={!canSubmit || busy} onSelect={() => void submit('render')}>{canSubmit ? 'Componer PDF en el servidor' : 'Compositor no disponible'}</MenuItem>
                  {pdf ? <MenuLink href={`/api/books/${source.id}/artifacts/${pdf.id}`} external>Abrir el último PDF compuesto</MenuLink> : null}
                </>
              ) : null}
              {source.kind === 'demo' ? <MenuLink href="/demo/ruskicode-sample.pdf" external>Abrir el PDF de muestra</MenuLink> : null}
              {source.kind === 'local' ? <><MenuSeparator /><MenuItem danger onSelect={() => setDeleteConfirm(true)}>Borrar este libro</MenuItem></> : null}
            </MenuContent>
          </Menu>
        </div>
      </header>

      <div className="rc-pdf-layout">
        <PageRail
          pages={layout.pages}
          css={layout.css}
          pageSize={layout.pageSize}
          chapters={book.chapters.map(c => c.title)}
          activePage={visiblePage}
          onPick={pickPage}
          onAddChapter={() => api.addChapter('unit')}
          canAddChapter={book.chapters.length < MAX_CHAPTERS}
        />

        <section className="rc-pdf-center" aria-label="Lienzo">
          {layout.status === 'error' ? (
            <div className="rc-notice rc-pdf-notice" role="alert">
              <span className="rc-dot rc-dot--danger" aria-hidden="true" />
              <span>{layout.error?.code === 'UNSPLITTABLE_BLOCK' ? 'Un bloque no entra en una página, ni siquiera solo.' : layout.error?.code === 'PAGE_LIMIT' ? 'El libro supera las 120 páginas.' : 'No pude armar las páginas.'}</span>
              {layout.error?.blockId ? <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => { const id = layout.error!.blockId!.replace(/(-continued)+$/, ''); const at = locate(id); if (at) { setSelection({chapter: at.c, blockId: id}); setTab('block'); } }}>Ver el bloque</button> : null}
            </div>
          ) : issues.length ? (
            <p className="rc-pdf-issues-line">{issues.length === 1 ? 'Página ' + issues[0].page + ': ' + (issueText[issues[0].code] || issues[0].code) : issues.length + ' avisos de maquetación (marcados en las miniaturas)'}</p>
          ) : null}
          <PageCanvas
            ref={canvas}
            book={book}
            selectedBlockId={selection.blockId}
            notedBlockIds={noted}
            zoom={zoom}
            onSelect={onCanvasSelect}
            onLayout={onLayout}
            onVisiblePage={setVisiblePage}
          />
          <p className="rc-pdf-foot">{layout.status === 'working' ? 'Armando páginas…' : layout.pages.length + ' páginas · ' + book.spec.pageFormat + ' · la misma maquetación que el PDF'}</p>
        </section>

        <Tabs.Root className="rc-pdf-inspector" value={tab} onValueChange={v => setTab(v as Tab)}>
          <Tabs.List className="rc-pdf-tabs" aria-label="Inspector">
            {([['block', 'Bloque'], ['chapter', 'Capítulo'], ['book', 'Libro'], ['assistant', 'Asistente'], ['notes', 'Notas']] as const).map(([id, label]) => (
              <Tabs.Trigger key={id} value={id} className="rc-tab">{label}</Tabs.Trigger>
            ))}
          </Tabs.List>
          <Tabs.Content value="block" className="rc-pdf-panel">
            {selectedBlock ? <BlockForm key={selectedBlock.id} api={api} block={selectedBlock} /> : (
              <div className="rc-pdf-form">
                <p className="rc-hint rc-pdf-empty">Tocá un bloque en la página para editarlo, o insertá uno nuevo al final del capítulo.</p>
                <InsertMenu api={api} />
              </div>
            )}
          </Tabs.Content>
          <Tabs.Content value="chapter" className="rc-pdf-panel"><ChapterPanel api={api} /></Tabs.Content>
          <Tabs.Content value="book" className="rc-pdf-panel"><BookPanel api={api} /></Tabs.Content>
          <Tabs.Content value="assistant" className="rc-pdf-panel"><AssistantPanel api={api} bookKey={bookKey} onGoToBlock={id => api.select(locate(id)?.c ?? selection.chapter, id)} /></Tabs.Content>
          <Tabs.Content value="notes" className="rc-pdf-panel"><NotesPanel api={api} bookKey={bookKey} onGoToBlock={id => api.select(locate(id)?.c ?? selection.chapter, id)} /></Tabs.Content>
        </Tabs.Root>
      </div>

      <ConfirmDialog
        open={exportConfirm}
        onClose={() => setExportConfirm(false)}
        onConfirm={() => { setExportConfirm(false); canvas.current?.print(); }}
        title="Hay imágenes sin archivo"
        description={`${layout.missingImages} ${layout.missingImages === 1 ? 'imagen se exporta' : 'imágenes se exportan'} como un recuadro con su descripción. Podés subirlas o generarlas antes.`}
        confirmLabel="Exportar igual"
      />
      <ConfirmDialog
        open={deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        onConfirm={async () => { setDeleteConfirm(false); if (source.kind === 'local') { await deleteLocalBook(source.id).catch(() => undefined); router.push('/workspace?studio=pdf'); } }}
        title="¿Borrar este libro?"
        description="Se borra de este navegador. Si querés conservarlo, descargá antes el editable (.json)."
        confirmLabel="Borrar libro"
        tone="danger"
      />
    </div>
  );
}
