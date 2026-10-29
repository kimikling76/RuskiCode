'use client';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import * as Tabs from '@radix-ui/react-tabs';
import type {PDFDocumentProxy} from 'pdfjs-dist';
import {toast} from 'sonner';
import {BookOpen, ChevronLeft, ChevronRight, Columns2, Download, MoreHorizontal, Redo2, ScanSearch, Undo2} from 'lucide-react';
import {fetchEditorFonts, type EditorFonts} from '@/lib/manual/fonts';
import {renderUnit, type RenderResult} from '@/lib/manual/render';
import {getAsset, getUnit, listVersions, markUnitOpen, saveUnit, saveVersion, type ManualVersion} from '@/lib/manual/store';
import {deleteBlock, deleteElement, editable, moveBlock, moveElement, resizeElement, touch} from '@/lib/manual/edit';
import type {Unit} from '@/lib/manual/model';
import {download} from '@/lib/manual/browser';
import {openPdf} from '@/lib/pdf/viewer';
import {libraryEvents} from '@/lib/books/library';
import {useSync, applyHeld} from '@/lib/sync/engine';
import {NavTrigger} from '@/components/studio/sidebar';
import {Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger} from '@/components/ui/menu';
import {Tip} from '@/components/ui/tooltip';
import {DocThumbs} from '@/components/pdf/doc-view';
import {ManualPage, type CompareMode, type ReviewMark, type Selection, type Zoom} from './manual-page';
import type {ReviewFinding} from '@/lib/manual/review';
import {InspectorTabs, SaveStatus, ZoomControl} from '@/components/pdf/editor-parts';
import {AddPanel, PagesPanel, SelectionPanel, VersionsPanel, type ManualApi} from './manual-inspector';
import {EditorBookPanel} from '@/components/kb/editor-book-panel';
import {ManualAiPanel} from './manual-ai';
import {useManualReview} from '@/store/manual-review';

/** Pending findings grouped by the line (or the block, for editor content) they are about. */
function reviewMarks(findings: ReviewFinding[] | undefined, done: Record<string, string>): ReviewMark[] {
  const by = new Map<string, ReviewMark>();
  for (const f of findings || []) {
    const t = f.text?.target;
    if (!t || done[f.key]) continue;
    const element = t.kind === 'element' ? t.elementId : null;
    const key = t.blockId + ':' + (element || '');
    const m = by.get(key);
    if (m) m.count++; else by.set(key, {block: t.blockId, element, count: 1});
  }
  return [...by.values()];
}

type Tab = 'selection' | 'add' | 'ai' | 'pages' | 'versions' | 'book';
const none: Selection = {block: null, element: null};
const MAX_UNDO = 100;

/**
 * A manual unit, edited block by block: the pages on the left (drawn from the exported PDF), the page in the middle
 * with its blocks to select and move, and on the right the selection, new content from the template, pages and
 * versions. Every change is saved here at once and travels to the account; the PDF is made the same way on export.
 */
export function ManualEditor() {
  const params = useSearchParams();
  const id = params.get('id') || '';
  // ?page=N opens that page (links from /pdf-generator and /revisar-ruso).
  const startPage = Number(params.get('page')) || 0;
  const [unit, setUnit] = useState<Unit | null>(null);
  const [fonts, setFonts] = useState<EditorFonts | null>(null);
  const [error, setError] = useState('');
  const [active, setActive] = useState(0);
  const [selection, setSelection] = useState<Selection>(none);
  const [tab, setTab] = useState<Tab>('selection');
  const [zoom, setZoom] = useState<Zoom>('fit');
  const [pageRender, setPageRender] = useState<{index: number; result: RenderResult; doc: PDFDocumentProxy} | null>(null);
  const [thumbs, setThumbs] = useState<PDFDocumentProxy | null>(null);
  const [original, setOriginal] = useState<PDFDocumentProxy | null>(null);
  const [compare, setCompare] = useState<CompareMode>('off');
  const [score, setScore] = useState<number | null>(null);
  const [save, setSave] = useState<'saved' | 'saving' | 'error'>('saved');
  const [versions, setVersions] = useState<ManualVersion[]>([]);
  const [exporting, setExporting] = useState(false);
  const [renderError, setRenderError] = useState('');
  const [reloads, setReloads] = useState(0);
  const history = useRef<{past: Unit[]; future: Unit[]; mergeKey: string | null; mergeAt: number}>({past: [], future: [], mergeKey: null, mergeAt: 0});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Unit | null>(null);
  const [, bump] = useState(0);

  useEffect(() => markUnitOpen(id), [id]);
  useEffect(() => { fetchEditorFonts().then(setFonts).catch(() => setError('No se pudo cargar la fuente del manual (DejaVu Sans). Revisá la conexión y recargá.')); }, []);

  useEffect(() => {
    let alive = true;
    setError('');
    getUnit(id).then(u => {
      if (!alive) return;
      if (!u) { setError('Esta unidad no está en este navegador. Si la importaste en otra computadora, esperá a que diga «Guardado» y recargá.'); return; }
      setUnit(u); latest.current = u;
      history.current = {past: [], future: [], mergeKey: null, mergeAt: 0};
      setActive(a => Math.min(reloads === 0 && startPage > 0 ? startPage - 1 : a, u.pages.length - 1));
    }).catch(() => setError('Este navegador no permite leer la unidad (almacenamiento bloqueado o modo privado).'));
    void listVersions(id).then(v => { if (alive) setVersions(v); });
    return () => { alive = false; };
  }, [id, reloads]);

  // The original PDF, to compare and for pages kept as they are.
  useEffect(() => {
    const hash = unit?.source?.asset;
    if (!hash) return;
    let alive = true;
    let opened: PDFDocumentProxy | null = null;
    void getAsset(hash).then(bytes => bytes && openPdf(bytes.slice().buffer)).then(doc => { if (doc && alive) { opened = doc; setOriginal(doc); } }).catch(() => {});
    return () => { alive = false; void opened?.loadingTask.destroy(); };
  }, [unit?.source?.asset]);

  // Another computer changed this unit: its version waits until the author loads it.
  const waiting = useSync(s => s.waiting.includes('manual-unit/' + id));
  useEffect(() => {
    const onApplied = (e: Event) => {
      const d = (e as CustomEvent<{kind: string; key: string}>).detail;
      if (d?.kind === 'manual-unit' && d.key === id) { setReloads(n => n + 1); toast('Se cargó la versión de la otra computadora.'); }
    };
    const onSynced = () => { void listVersions(id).then(setVersions); };
    window.addEventListener('rc-sync-applied', onApplied);
    libraryEvents?.addEventListener('synced', onSynced);
    return () => { window.removeEventListener('rc-sync-applied', onApplied); libraryEvents?.removeEventListener('synced', onSynced); };
  }, [id]);

  const persist = useCallback((next: Unit) => {
    setSave('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveUnit(next).then(() => setSave('saved')).catch(() => { setSave('error'); toast('No se pudo guardar el cambio en este navegador.'); });
    }, 500);
  }, []);
  // Leaving the page saves what is pending.
  useEffect(() => () => { if (saveTimer.current && latest.current) { clearTimeout(saveTimer.current); void saveUnit(latest.current); } }, []);

  /** A change: one undo step (typing in the same field within a moment is one step). */
  const change = useCallback((next: Unit, opts: {merge?: string} = {}) => {
    const prev = latest.current;
    if (!prev) return;
    const h = history.current;
    const now = Date.now();
    if (!(opts.merge && opts.merge === h.mergeKey && now - h.mergeAt < 1500)) {
      h.past.push(prev);
      if (h.past.length > MAX_UNDO) h.past.shift();
    }
    h.future = [];
    h.mergeKey = opts.merge ?? null;
    h.mergeAt = now;
    const stamped = touch(next);
    latest.current = stamped;
    setUnit(stamped);
    persist(stamped);
  }, [persist]);

  const undo = useCallback(() => {
    const h = history.current;
    const prev = h.past.pop();
    if (!prev || !latest.current) return;
    h.future.push(latest.current);
    h.mergeKey = null;
    const stamped = touch(prev);
    latest.current = stamped; setUnit(stamped); persist(stamped); bump(n => n + 1);
  }, [persist]);
  const redo = useCallback(() => {
    const h = history.current;
    const next = h.future.pop();
    if (!next || !latest.current) return;
    h.past.push(latest.current);
    h.mergeKey = null;
    const stamped = touch(next);
    latest.current = stamped; setUnit(stamped); persist(stamped); bump(n => n + 1);
  }, [persist]);

  const page = unit?.pages[Math.min(active, (unit?.pages.length || 1) - 1)];

  // The page as the PDF will have it, made again after each change.
  useEffect(() => {
    if (!unit || !fonts || !page) return;
    let alive = true;
    const index = unit.pages.indexOf(page);
    const timer = setTimeout(() => {
      renderUnit(unit, {fonts, asset: getAsset, pages: [index]})
        .then(async result => {
          const doc = await openPdf(result.bytes.slice().buffer);
          if (!alive) { void doc.loadingTask.destroy(); return; }
          setRenderError('');
          setPageRender(old => { if (old) void old.doc.loadingTask.destroy(); return {index, result, doc}; });
        })
        .catch(() => { if (alive) setRenderError('No se pudo dibujar esta página.'); });
    }, 60);
    return () => { alive = false; clearTimeout(timer); };
  }, [unit, fonts, page]);

  // Thumbnails: the whole unit, a moment after the last change.
  useEffect(() => {
    if (!unit || !fonts) return;
    let alive = true;
    const timer = setTimeout(() => {
      renderUnit(unit, {fonts, asset: getAsset}).then(r => openPdf(r.bytes.slice().buffer)).then(doc => {
        if (!alive) { void doc.loadingTask.destroy(); return; }
        setThumbs(old => { if (old) void old.loadingTask.destroy(); return doc; });
      }).catch(() => {});
    }, 900);
    return () => { alive = false; clearTimeout(timer); };
  }, [unit, fonts]);

  useEffect(() => { setSelection(none); setScore(null); }, [active]);

  const isEditable = useCallback((blockId: string) => {
    const b = page?.blocks.find(x => x.id === blockId);
    return Boolean(page && b && editable(page, b));
  }, [page]);

  // Keyboard: undo/redo, arrows move the selection, Delete removes it, Esc goes up a level.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing = target?.closest('input, textarea, select, [contenteditable="true"]');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); return; }
      if (typing || !unit || !page) return;
      if (e.key === 'Escape') { setSelection(s => s.element ? {block: s.block, element: null} : none); return; }
      if (e.key === 'PageDown') { e.preventDefault(); setActive(a => Math.min(unit.pages.length - 1, a + 1)); return; }
      if (e.key === 'PageUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); return; }
      if (!selection.block || !isEditable(selection.block)) return;
      const step = e.shiftKey ? 10 : 1;
      const moves: Record<string, [number, number]> = {ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step]};
      if (moves[e.key]) {
        e.preventDefault();
        const [dx, dy] = moves[e.key];
        change(selection.element ? moveElement(unit, page.id, selection.element, dx, dy) : moveBlock(unit, page.id, selection.block, dx, dy), {merge: 'nudge:' + (selection.element || selection.block)});
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        change(selection.element ? deleteElement(unit, page.id, selection.element) : deleteBlock(unit, page.id, selection.block));
        setSelection(s => s.element ? {block: s.block, element: null} : none);
        toast('Borrado', {action: {label: 'Deshacer', onClick: undo}});
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function exportPdf() {
    if (!unit || !fonts) return;
    setExporting(true);
    try {
      const out = await renderUnit(unit, {fonts, asset: getAsset});
      download(out.bytes, unit.title + '.pdf');
      const notes: string[] = [];
      if (out.overflows.length) notes.push(out.overflows.length + (out.overflows.length === 1 ? ' texto no entra en su lugar' : ' textos no entran en su lugar') + ' (marcados en rojo).');
      if (out.missing.length) notes.push(out.missing.length + (out.missing.length === 1 ? ' imagen todavía no llegó' : ' imágenes todavía no llegaron') + ' de la otra computadora y faltan en el PDF.');
      toast('PDF exportado' + (notes.length ? ' con avisos: ' + notes.join(' ') : '.'), {duration: notes.length ? 10000 : 4000});
    } catch {
      toast('No se pudo exportar el PDF.');
    } finally { setExporting(false); }
  }

  async function keepVersion(label: string) {
    if (!latest.current) return;
    await saveUnit(latest.current);
    await saveVersion(latest.current, label);
    setVersions(await listVersions(id));
  }
  async function newVersion(label: string) {
    await keepVersion(label);
    toast('Versión guardada: «' + label + '»');
  }

  async function restore(v: ManualVersion) {
    if (!latest.current) return;
    await saveVersion(latest.current, 'Antes de volver a «' + v.label + '»');
    change({...v.unit, id: latest.current.id, title: latest.current.title});
    setVersions(await listVersions(id));
    toast('Volviste a «' + v.label + '». La anterior quedó guardada como versión.');
  }

  const review = useManualReview();
  const api: ManualApi | null = useMemo(() => unit && fonts && page ? {
    unit, fonts, page, pageIndex: unit.pages.indexOf(page), selection, overflows: pageRender?.result.overflows ?? [],
    change, select: s => { setSelection(s); if (s.block) setTab('selection'); }, reveal: setSelection, goToPage: setActive,
  } : null, [unit, fonts, page, selection, pageRender, change]);

  if (error) {
    return (
      <div className="rc-cine-empty rc-cine-empty--page">
        <h2>{error}</h2>
        <Link href="/workspace?studio=pdf" className="rc-btn rc-btn--secondary">Volver a PDF Studio</Link>
      </div>
    );
  }

  const count = unit?.pages.length || 0;
  const marks = reviewMarks(review.pages[(unit?.id || '') + ':' + (page?.id || '')]?.findings, review.done);
  const shown = pageRender && page && pageRender.index === unit?.pages.indexOf(page) ? pageRender : null;
  const canCompare = Boolean(original && page?.sourcePage !== undefined);
  const h = history.current;

  return (
    <div className="rc-pdf rc-doc rc-man">
      <header className="rc-topbar rc-pdf-bar">
        <NavTrigger />
        <div className="rc-studio-identity rc-pdf-identity">
          <BookOpen aria-hidden="true" />
          <Link href="/workspace?studio=pdf" className="rc-crumb">PDF Studio</Link>
          <ChevronRight className="rc-crumb-sep" aria-hidden="true" />
          <span className="rc-crumb-current" title={unit?.title}>{unit?.title || 'Unidad'}</span>
          <span className="rc-pdf-source">Manual{unit?.number ? ' · unidad ' + unit.number : ''}</span>
        </div>
        <SaveStatus state={!unit ? 'opening' : save === 'saving' ? 'saving' : save === 'error' ? 'error' : 'saved'} />
        <div className="rc-topbar-actions">
          <Tip label="Deshacer" shortcut="⌘Z"><button type="button" className="rc-icon-btn" aria-label="Deshacer" disabled={!h.past.length} onClick={undo}><Undo2 /></button></Tip>
          <Tip label="Rehacer" shortcut="⇧⌘Z"><button type="button" className="rc-icon-btn" aria-label="Rehacer" disabled={!h.future.length} onClick={redo}><Redo2 /></button></Tip>
          <ZoomControl zoom={zoom} onChange={setZoom} />
          <Menu>
            <MenuTrigger asChild>
              <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" aria-pressed={compare !== 'off'} disabled={!canCompare} aria-label="Comparar con el original"><Columns2 aria-hidden="true" /><span>Comparar</span></button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem onSelect={() => setCompare('side')}>Original al lado</MenuItem>
              <MenuItem onSelect={() => setCompare('diff')}>Marcar diferencias en rojo</MenuItem>
              <MenuSeparator />
              <MenuItem onSelect={() => setCompare('off')}>Dejar de comparar</MenuItem>
            </MenuContent>
          </Menu>
          <button type="button" className="rc-btn rc-btn--primary rc-btn--sm" disabled={!unit || !fonts || exporting} onClick={() => void exportPdf()} aria-label="Exportar PDF"><Download aria-hidden="true" /><span>{exporting ? 'Exportando…' : 'Exportar PDF'}</span></button>
          <Menu>
            <MenuTrigger asChild><button type="button" className="rc-icon-btn" aria-label="Más opciones de la unidad"><MoreHorizontal /></button></MenuTrigger>
            <MenuContent>
              <MenuItem onSelect={() => setTab('versions')}>Versiones ({versions.length})</MenuItem>
              <MenuItem disabled={!unit?.source} onSelect={() => { const s = unit?.source; if (s) void getAsset(s.asset).then(b => { if (b) download(b, s.name); else toast('El PDF original no está en esta computadora.'); }); }}>Descargar el PDF original</MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </header>

      <div className="rc-pdf-layout rc-doc-layout">
        <DocThumbs doc={thumbs && thumbs.numPages === count ? thumbs : null} count={count} active={active} selected={new Set([active])} onActivate={setActive} onSelect={() => {}} />

        <section className="rc-pdf-center rc-doc-center" aria-label={'Página ' + (active + 1) + ' de ' + count}>
          {waiting ? (
            <div className="rc-notice rc-pdf-notice" role="status">
              <span className="rc-dot" aria-hidden="true" />
              <span>Esta unidad cambió en otra computadora. Nada se reemplaza sin que lo pidas.</span>
              <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => void applyHeld('manual-unit', id)}>Cargar esos cambios</button>
            </div>
          ) : null}
          {compare !== 'off' && canCompare ? (
            <div className="rc-notice rc-pdf-notice" role="status">
              <ScanSearch aria-hidden="true" />
              <span>{compare === 'diff' ? (score === null ? 'Comparando con la página ' + ((page?.sourcePage ?? 0) + 1) + ' del original…' : 'Igual al original: ' + (score * 100).toLocaleString('es-AR', {maximumFractionDigits: 2}) + ' % de la página. En rojo, lo que cambió.') : 'A la izquierda, la página ' + ((page?.sourcePage ?? 0) + 1) + ' del PDF original.'}</span>
              <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => setCompare('off')}>Dejar de comparar</button>
            </div>
          ) : null}
          {renderError ? <p className="rc-form-error" role="alert">{renderError}</p> : null}
          {unit && page && shown ? (
            <ManualPage
              doc={shown.doc} page={page} boxes={shown.result.boxes} overflows={shown.result.overflows} selection={selection}
              onSelect={s => { setSelection(s); if (s.block) setTab('selection'); }}
              onMove={(dx, dy) => { if (!selection.block) return; change(selection.element ? moveElement(unit, page.id, selection.element, dx, dy) : moveBlock(unit, page.id, selection.block, dx, dy)); }}
              onResize={to => { if (selection.element && fonts) change(resizeElement(fonts, unit, page.id, selection.element, to)); }}
              zoom={zoom} template={unit.template} original={original} sourceIndex={page.sourcePage} compare={canCompare ? compare : 'off'}
              editable={isEditable} onDiffScore={setScore} marks={marks}
            />
          ) : <div className="rc-loading" role="status"><span className="rc-skeleton" /><span className="sr-only">Dibujando la página…</span></div>}
          <div className="rc-doc-pager">
            <button type="button" className="rc-icon-btn" aria-label="Página anterior" disabled={active <= 0} onClick={() => setActive(a => a - 1)}><ChevronLeft /></button>
            <span>Página {active + 1} de {count || '…'}</span>
            <button type="button" className="rc-icon-btn" aria-label="Página siguiente" disabled={active >= count - 1} onClick={() => setActive(a => a + 1)}><ChevronRight /></button>
          </div>
        </section>

        <Tabs.Root className="rc-pdf-inspector" value={tab} onValueChange={v => setTab(v as Tab)}>
          <InspectorTabs<Tab> label="Inspector" value={tab} onChange={setTab}
            tabs={[['selection', 'Selección'], ['add', 'Agregar'], ['ai', 'IA'], ['pages', 'Páginas']]}
            more={[['book', 'Libro'], ['versions', 'Versiones']]} />
          <Tabs.Content value="selection" className="rc-pdf-panel">{api ? <SelectionPanel key={page?.id + ':' + (selection.block || '') + ':' + (selection.element || '')} api={api} /> : null}</Tabs.Content>
          <Tabs.Content value="add" className="rc-pdf-panel">{api ? <AddPanel api={api} /> : null}</Tabs.Content>
          <Tabs.Content value="ai" className="rc-pdf-panel">{api ? <ManualAiPanel api={api} onVersion={keepVersion} /> : null}</Tabs.Content>
          <Tabs.Content value="pages" className="rc-pdf-panel">{api ? <PagesPanel api={api} /> : null}</Tabs.Content>
          <Tabs.Content value="versions" className="rc-pdf-panel"><VersionsPanel versions={versions} onSave={l => void newVersion(l)} onRestore={v => void restore(v)} /></Tabs.Content>
          <Tabs.Content value="book" className="rc-pdf-panel">{api ? <EditorBookPanel api={api} onVersion={keepVersion} /> : null}</Tabs.Content>
        </Tabs.Root>
      </div>
    </div>
  );
}
