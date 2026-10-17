'use client';
import {memo, useEffect, useRef, useState, type KeyboardEvent} from 'react';
import type {PDFDocumentProxy} from 'pdfjs-dist';
import {drawPage, drawTextLayer, joinStress} from '@/lib/pdf/viewer';

// The two views of an imported PDF: the thumbnails (left) and the active page (center).

const Thumb = memo(function Thumb({doc, index, width}: {doc: PDFDocumentProxy; index: number; width: number}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'idle' | 'ready' | 'error'>('idle');
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let cancelled = false;
    let task: {cancel: () => void} | null = null;
    // Drawn when it scrolls into view, so a long PDF does not draw every page at once.
    const io = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) return;
      io.disconnect();
      void doc.getPage(index + 1).then(page => {
        if (cancelled) return;
        const r = drawPage(page, el, width);
        task = r.task;
        return r.task.promise.then(() => { if (!cancelled) setState('ready'); });
      }).catch(() => { if (!cancelled) setState('error'); });
    }, {rootMargin: '300px'});
    io.observe(el);
    return () => { cancelled = true; io.disconnect(); task?.cancel(); };
  }, [doc, index, width]);
  return <canvas ref={canvas} className="rc-doc-thumb-canvas" data-state={state} aria-hidden="true" />;
});

/**
 * Page list. Click (or Enter) opens a page; Ctrl/⌘-click or Space adds it to the selection the tools use.
 * Keyboard: ↑/↓ move between pages, Shift+↑/↓ extend the selection, Home/End jump.
 */
export function DocThumbs({doc, count, active, selected, onActivate, onSelect}: {
  doc: PDFDocumentProxy | null; count: number; active: number; selected: Set<number>;
  onActivate: (index: number) => void; onSelect: (pages: Set<number>) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({block: 'nearest'});
  }, [active]);

  function key(e: KeyboardEvent<HTMLDivElement>) {
    const move = (to: number) => {
      const next = Math.max(0, Math.min(count - 1, to));
      e.preventDefault();
      if (e.shiftKey) onSelect(new Set([...selected, active, next]));
      onActivate(next);
      list.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.focus();
    };
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') move(active + 1);
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') move(active - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(count - 1);
    else if (e.key === ' ') {
      e.preventDefault();
      const next = new Set(selected);
      if (next.has(active)) next.delete(active); else next.add(active);
      onSelect(next);
    }
  }

  return (
    <nav className="rc-doc-thumbs" aria-label="Páginas">
      <div ref={list} className="rc-doc-thumb-list" role="listbox" aria-label="Páginas del documento" aria-multiselectable="true" onKeyDown={key}>
        {doc ? Array.from({length: count}, (_, i) => (
          <div
            key={i}
            role="option"
            data-index={i}
            tabIndex={i === active ? 0 : -1}
            aria-selected={selected.has(i)}
            aria-current={i === active ? 'page' : undefined}
            aria-label={'Página ' + (i + 1) + (selected.has(i) ? ', elegida' : '')}
            className="rc-doc-thumb"
            onClick={e => {
              if (e.metaKey || e.ctrlKey) { const next = new Set(selected); if (next.has(i)) next.delete(i); else next.add(i); onSelect(next); return; }
              if (e.shiftKey) { const [a, b] = [Math.min(active, i), Math.max(active, i)]; onSelect(new Set(Array.from({length: b - a + 1}, (_, k) => a + k))); onActivate(i); return; }
              onSelect(new Set([i]));
              onActivate(i);
            }}
          >
            <Thumb doc={doc} index={i} width={112} />
            <span className="rc-doc-thumb-num">{i + 1}</span>
          </div>
        )) : null}
      </div>
      <p className="rc-doc-thumbs-foot">{selected.size > 1 ? selected.size + ' páginas elegidas' : count ? count + (count === 1 ? ' página' : ' páginas') : ''}</p>
    </nav>
  );
}

export type Zoom = 'fit' | number;

/** The active page, drawn with its text layer so text can be selected (the assistant uses the selection). */
export function DocPage({doc, index, zoom, onSelectText}: {doc: PDFDocumentProxy; index: number; zoom: Zoom; onSelectText: (text: string) => void}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current, l = layer.current;
    if (!c || !l || !width) return;
    let cancelled = false;
    let task: {cancel: () => void} | null = null;
    setFailed(false);
    void doc.getPage(index + 1).then(async page => {
      if (cancelled) return;
      const natural = page.getViewport({scale: 1}).width * 96 / 72;
      const target = zoom === 'fit' ? Math.max(200, Math.min(width - 48, 1400)) : natural * zoom;
      const r = drawPage(page, c, target);
      task = r.task;
      await r.task.promise;
      if (cancelled) return;
      l.style.width = c.style.width;
      l.style.height = c.style.height;
      await drawTextLayer(page, l, r.scale);
    }).catch(e => { if (!cancelled && (e as {name?: string})?.name !== 'RenderingCancelledException') setFailed(true); });
    return () => { cancelled = true; task?.cancel(); };
  }, [doc, index, zoom, width]);

  function readSelection() {
    const s = window.getSelection();
    if (!s || !layer.current || !s.anchorNode || !layer.current.contains(s.anchorNode)) return;
    onSelectText(joinStress(s.toString().replace(/\s+/g, ' ').trim()).slice(0, 2000));
  }

  return (
    <div ref={box} className="rc-doc-stage" tabIndex={0} aria-label="Página del documento (desplazable)" onMouseUp={readSelection} onKeyUp={readSelection}>
      {failed ? <p className="rc-form-error" role="alert">No se pudo dibujar esta página.</p> : null}
      <div className="rc-doc-paper">
        <canvas ref={canvas} aria-hidden="true" />
        <div ref={layer} className="textLayer" />
      </div>
    </div>
  );
}

/** «1, 3-5» → [1, 3, 4, 5] within the document; null when it does not read as pages. */
export function parsePages(text: string, count: number): number[] | null {
  const out = new Set<number>();
  for (const part of text.split(/[,;\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:\s*[-–]\s*(\d+))?$/);
    if (!m) return null;
    const a = Number(m[1]), b = Number(m[2] || m[1]);
    if (a < 1 || b > count || b < a) return null;
    for (let n = a; n <= b; n++) out.add(n);
  }
  return out.size ? [...out].sort((x, y) => x - y) : null;
}
