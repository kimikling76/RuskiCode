'use client';
import {useCallback, useEffect, useRef, useState} from 'react';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {toast} from 'sonner';
import {AlertTriangle, BookOpen, ChevronRight, Download, PenLine, Save} from 'lucide-react';
import type {Instance, ToolbarItem} from '@nutrient-sdk/viewer';
import {fileSize, getOriginal, loadOriginalData, markOriginalOpen, saveOriginalData, type OriginalPdf} from '@/lib/books/originals';
import {libraryEvents} from '@/lib/books/library';
import {NavTrigger} from '@/components/studio/sidebar';

// The PDF is edited exactly as it is, with Nutrient Web SDK: texts and images change in place, the rest of the
// page (fonts, layout, images, other pages) is untouched. Nutrient runs in this browser; its files are served
// from /vendor/nutrient (copied by scripts/copy-vendor-assets.mjs).

// A license key or a publishable key from the Nutrient dashboard. Both are meant for the browser.
const KEY = (process.env.NEXT_PUBLIC_NUTRIENT_KEY || '').trim();
const TRIAL = !KEY;

type Status = 'loading' | 'ready' | 'saving' | 'error';

function download(bytes: ArrayBuffer, name: string) {
  const url = URL.createObjectURL(new Blob([bytes], {type: 'application/pdf'}));
  const a = document.createElement('a');
  a.href = url;
  a.download = name.replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.pdf';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function OriginalEditor() {
  const id = useSearchParams().get('id') || '';
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<Instance | null>(null);
  const [meta, setMeta] = useState<OriginalPdf | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const editDirty = useRef(false);

  useEffect(() => markOriginalOpen(id), [id]);

  useEffect(() => {
    let cancelled = false;
    let viewer: typeof import('@nutrient-sdk/viewer').default | null = null;
    const target = container.current;
    (async () => {
      try {
        const record = await getOriginal(id);
        if (!record) throw Error('NOT_FOUND');
        if (cancelled) return;
        setMeta(record);
        const bytes = await loadOriginalData(id);
        if (!bytes) throw Error(record.missing ? 'MISSING' : 'NOT_FOUND');
        viewer = (await import('@nutrient-sdk/viewer')).default;
        if (cancelled || !target) return;
        // Nutrient's own download button is replaced by ours (it names the file and knows about trial mode).
        const toolbarItems: ToolbarItem[] = viewer.defaultToolbarItems.filter(item => !['export-pdf', 'debug'].includes(item.type));
        toolbarItems.splice(toolbarItems.findIndex(item => item.type === 'spacer') + 1, 0, {type: 'content-editor'});
        const loaded = await viewer.load({
          container: target,
          // A copy: Nutrient takes ownership of the buffer it receives.
          document: bytes.slice(0),
          baseUrl: window.location.origin + '/vendor/nutrient/',
          locale: 'es',
          theme: viewer.Theme.DARK,
          toolbarItems,
          ...(KEY ? (KEY.startsWith('pdf_pub') ? {session: KEY} : {licenseKey: KEY}) : {}),
        });
        if (cancelled) { viewer.unload(target); return; }
        instance.current = loaded;
        // Development only: lets the browser tests drive the editor.
        if (process.env.NODE_ENV !== 'production') (window as unknown as {__nutrient?: Instance}).__nutrient = loaded;
        loaded.addEventListener('annotations.change', () => setDirty(true));
        loaded.addEventListener('document.change', () => setDirty(true));
        loaded.addEventListener('contentEditor.stateChange', state => {
          setEditing(state.isActive);
          // A text edit becomes part of the document when the editing session is saved.
          if (!state.isActive && editDirty.current) setDirty(true);
          editDirty.current = state.isActive && state.isDirty;
        });
        setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        const code = e instanceof Error ? e.message : '';
        setError(code === 'NOT_FOUND' ? 'Este PDF no está en este navegador. Si lo importaste en otra computadora, esperá a que diga «Guardado» y recargá.'
          : code === 'MISSING' ? 'Este PDF pesa más de 4 MB, así que quedó solo en la computadora donde lo importaste. Abrilo allá o importalo de nuevo acá.'
            : 'No se pudo abrir el editor de PDF. ' + (TRIAL ? 'Si el período de prueba de Nutrient terminó, hace falta cargar una clave de Nutrient en el servidor.' : 'Revisá que la clave de Nutrient sea válida para este dominio.'));
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      instance.current = null;
      if (viewer && target) { try { viewer.unload(target); } catch {} }
    };
  }, [id]);

  // Reload the record's details when another computer renamed or replaced it.
  useEffect(() => {
    const reload = () => { void getOriginal(id).then(m => { if (m) setMeta(m); }); };
    libraryEvents?.addEventListener('synced', reload);
    return () => libraryEvents?.removeEventListener('synced', reload);
  }, [id]);

  useEffect(() => {
    if (!dirty || TRIAL) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  /** The document as it is now, with an open text edit saved first. */
  const exportNow = useCallback(async () => {
    const inst = instance.current;
    if (!inst) throw Error('NOT_READY');
    if (editing) {
      const result = await inst.saveContentEditingSession();
      // Characters the PDF's fonts cannot draw are lost: say which ones and where, so they can be retyped.
      if (result.status === 'reported' && result.uncoveredCodepoints.length) {
        const chars = [...new Set(result.uncoveredCodepoints.flatMap(u => u.characters))].join(' ');
        const pages = [...new Set(result.uncoveredCodepoints.map(u => u.pageIndex + 1))].join(', ');
        toast('Algunos caracteres no existen en las fuentes de este PDF y no se escribieron' + (chars ? ' (' + chars + ')' : '') + '. Revisá la página ' + pages + '.', {duration: 12000});
      }
    }
    return inst.exportPDF();
  }, [editing]);

  const save = useCallback(async () => {
    if (TRIAL || status !== 'ready' || !meta) return;
    setStatus('saving');
    try {
      await saveOriginalData(meta.id, await exportNow());
      setDirty(false);
      setMeta(await getOriginal(meta.id) || meta);
      toast('PDF guardado en tu cuenta.');
    } catch {
      toast('No se pudo guardar el PDF. Probá de nuevo.');
    } finally {
      setStatus('ready');
    }
  }, [status, meta, exportNow]);

  async function downloadNow() {
    if (status !== 'ready' || !meta) return;
    try {
      download(await exportNow(), TRIAL ? meta.name + ' (prueba Nutrient)' : meta.name);
    } catch {
      toast('No se pudo preparar el PDF para descargar.');
    }
  }

  function toggleEditing() {
    const inst = instance.current;
    if (!inst) return;
    void import('@nutrient-sdk/viewer').then(({default: NV}) => {
      inst.setViewState(vs => vs.set('interactionMode', editing ? null : NV.InteractionMode.CONTENT_EDITOR));
    });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  const busy = status !== 'ready';
  const sizeLabel = meta ? fileSize(meta.size) : '';

  return (
    <div className="rc-original">
      <header className="rc-topbar rc-pdf-bar">
        <NavTrigger />
        <div className="rc-studio-identity rc-pdf-identity">
          <BookOpen aria-hidden="true" />
          <Link href="/workspace?studio=pdf" className="rc-crumb">PDF Studio</Link>
          <ChevronRight className="rc-crumb-sep" aria-hidden="true" />
          <span className="rc-crumb-current" title={meta?.name}>{meta?.name || 'PDF'}</span>
          <span className="rc-pdf-source">PDF original{sizeLabel ? ' · ' + sizeLabel : ''}</span>
        </div>
        <span className="rc-pdf-save" role="status" aria-live="polite">
          {status === 'loading' ? 'Abriendo…' : status === 'saving' ? 'Guardando…' : status === 'error' || TRIAL ? '' : dirty ? 'Cambios sin guardar' : 'Guardado'}
        </span>
        <div className="rc-topbar-actions rc-original-actions">
          <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" disabled={busy} aria-pressed={editing} onClick={toggleEditing} aria-label={editing ? 'Terminar edición' : 'Editar textos e imágenes'}>
            <PenLine aria-hidden="true" /><span>{editing ? 'Terminar edición' : 'Editar textos e imágenes'}</span>
          </button>
          <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" disabled={busy} onClick={() => void downloadNow()} aria-label={TRIAL ? 'Descargar copia de prueba' : 'Descargar PDF'}>
            <Download aria-hidden="true" /><span>{TRIAL ? 'Descargar copia de prueba' : 'Descargar PDF'}</span>
          </button>
          {TRIAL ? null : (
            <button type="button" className="rc-btn rc-btn--primary rc-btn--sm" disabled={busy || !dirty} onClick={() => void save()} aria-label="Guardar">
              <Save aria-hidden="true" /><span>Guardar</span>
            </button>
          )}
        </div>
      </header>
      {TRIAL && status !== 'error' ? (
        <p className="rc-original-trial" role="note">
          <AlertTriangle aria-hidden="true" />
          <span>
            <strong>Modo de prueba de Nutrient.</strong> Podés editar, pero lo que descargues lleva la marca «For Evaluation Purposes Only», así que tu PDF guardado no se modifica. Para guardar sin marca hace falta una clave de Nutrient en el servidor.
          </span>
        </p>
      ) : null}
      {status === 'error' ? (
        <div className="rc-original-error" role="alert"><p>{error}</p><Link href="/workspace?studio=pdf" className="rc-btn rc-btn--secondary">Volver a PDF Studio</Link></div>
      ) : null}
      <div ref={container} className="rc-original-viewer" data-ready={status === 'ready' ? 'true' : undefined} aria-busy={status === 'loading'} />
    </div>
  );
}
