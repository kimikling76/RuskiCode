'use client';
import {useEffect, useRef, useState, type PointerEvent as ReactPointerEvent} from 'react';
import type {PDFDocumentProxy} from 'pdfjs-dist';
import {drawPage} from '@/lib/pdf/viewer';
import type {ElementBox, Overflow} from '@/lib/manual/render';
import type {Block, Page, Template} from '@/lib/manual/model';
import type {Box} from '@/lib/manual/elements';

// The page being edited: the exported PDF drawn by pdf.js (what you see is what the PDF has), and on top of it the
// boxes of blocks and elements to select, move and resize. A click selects a block; another click inside it
// selects one element. Drag moves what is selected; the corners resize a picture or a line of text.

export type Selection = {block: string | null; element: string | null};
export type Zoom = 'fit' | number;
export type CompareMode = 'off' | 'side' | 'diff';

type Drag = {
  kind: 'move' | 'resize'; corner?: 'nw' | 'ne' | 'sw' | 'se'; start: [number, number]; box: Box; moved: boolean; dx: number; dy: number;
  guides: {x?: number; y?: number};
  /** What a click without moving selects. */
  pending?: Selection;
};

const SNAP = 4;

export function ManualPage({doc, page, boxes, overflows, selection, onSelect, onMove, onResize, zoom, template, original, sourceIndex, compare, editable, onDiffScore}: {
  doc: PDFDocumentProxy | null;
  page: Page;
  boxes: ElementBox[];
  overflows: Overflow[];
  selection: Selection;
  onSelect: (s: Selection) => void;
  onMove: (dx: number, dy: number) => void;
  onResize: (to: Box) => void;
  zoom: Zoom;
  template: Template;
  original: PDFDocumentProxy | null;
  sourceIndex: number | undefined;
  compare: CompareMode;
  editable: (blockId: string) => boolean;
  onDiffScore: (score: number | null) => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const origCanvas = useRef<HTMLCanvasElement>(null);
  const diffCanvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [scale, setScale] = useState(1);
  const [drawn, setDrawn] = useState(0);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const side = compare === 'side' && original && sourceIndex !== undefined;
  const cssWidth = !width ? 0 : zoom === 'fit'
    ? Math.max(240, Math.min((side ? (width - 72) / 2 : width - 48), 1400))
    : page.width * 96 / 72 * zoom;

  // The current page, drawn from the exported PDF.
  useEffect(() => {
    const c = canvas.current;
    if (!c || !doc || !cssWidth) return;
    let cancelled = false;
    let task: {cancel: () => void} | null = null;
    void doc.getPage(1).then(async p => {
      if (cancelled) return;
      const r = drawPage(p, c, cssWidth);
      task = r.task;
      await r.task.promise;
      if (!cancelled) { setScale(r.scale); setDrawn(n => n + 1); }
    }).catch(() => {});
    return () => { cancelled = true; task?.cancel(); };
  }, [doc, cssWidth]);

  // The same page of the original PDF, to compare.
  useEffect(() => {
    const c = origCanvas.current;
    if (!c || !original || sourceIndex === undefined || compare === 'off' || !cssWidth) return;
    let cancelled = false;
    let task: {cancel: () => void} | null = null;
    void original.getPage(sourceIndex + 1).then(async p => {
      if (cancelled) return;
      const r = drawPage(p, c, cssWidth);
      task = r.task;
      await r.task.promise;
      if (!cancelled) setDrawn(n => n + 1);
    }).catch(() => {});
    return () => { cancelled = true; task?.cancel(); };
  }, [original, sourceIndex, compare, cssWidth]);

  // Differences in red, and the share of the page that is the same.
  useEffect(() => {
    const a = canvas.current, b = origCanvas.current, d = diffCanvas.current;
    if (compare !== 'diff' || !a || !b || !d || !a.width || a.width !== b.width || a.height !== b.height) { onDiffScore(null); return; }
    const ca = a.getContext('2d', {willReadFrequently: true}), cb = b.getContext('2d', {willReadFrequently: true}), cd = d.getContext('2d');
    if (!ca || !cb || !cd) return;
    d.width = a.width; d.height = a.height;
    d.style.width = a.style.width; d.style.height = a.style.height;
    const pa = ca.getImageData(0, 0, a.width, a.height).data, pb = cb.getImageData(0, 0, b.width, b.height).data;
    const out = cd.createImageData(a.width, a.height);
    let differ = 0;
    for (let i = 0; i < pa.length; i += 4) {
      const delta = Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2]));
      if (delta > 24) { differ++; out.data[i] = 230; out.data[i + 1] = 40; out.data[i + 2] = 40; out.data[i + 3] = 200; }
    }
    cd.putImageData(out, 0, 0);
    onDiffScore(1 - differ / (pa.length / 4));
  }, [compare, drawn]); // eslint-disable-line react-hooks/exhaustive-deps

  const H = page.height;
  const toCss = (b: Box) => ({left: b[0] * scale, top: (H - b[3]) * scale, width: Math.max(2, (b[2] - b[0]) * scale), height: Math.max(2, (b[3] - b[1]) * scale)});
  const blockOf = new Map<string, string>(boxes.map(b => [b.element, b.block]));
  const blockBoxes = new Map<string, Box>();
  for (const b of boxes) {
    const prev = blockBoxes.get(b.block);
    blockBoxes.set(b.block, prev ? [Math.min(prev[0], b.box[0]), Math.min(prev[1], b.box[1]), Math.max(prev[2], b.box[2]), Math.max(prev[3], b.box[3])] : b.box);
  }
  const selectedBox: Box | null = selection.element ? boxes.find(b => b.element === selection.element)?.box ?? null : selection.block ? blockBoxes.get(selection.block) ?? null : null;
  const overflowIds = new Set(overflows.map(o => o.element));
  const blocks = new Map(page.blocks.map(b => [b.id, b] as [string, Block]));
  const selectedBlock = selection.block ? blocks.get(selection.block) : undefined;
  const selectedEl = selection.element ? selectedBlock?.elements.find(e => e.id === selection.element) : undefined;
  const resizable = selectedEl && (selectedEl.kind === 'image' || selectedEl.kind === 'text') && selection.block && editable(selection.block);

  const pointAt = (e: {clientX: number; clientY: number}): [number, number] => {
    const r = (canvas.current as HTMLCanvasElement).getBoundingClientRect();
    return [(e.clientX - r.left) / scale, H - (e.clientY - r.top) / scale];
  };

  /** What is under the point: the topmost element (painted last). */
  function hit(x: number, y: number, inBlock?: string) {
    const found = boxes.filter(b => x >= b.box[0] - 1 && x <= b.box[2] + 1 && y >= b.box[1] - 1 && y <= b.box[3] + 1 && (!inBlock || b.block === inBlock));
    // A small element on top of a large one (a word over a band) is the one meant.
    found.sort((a, b) => (a.box[2] - a.box[0]) * (a.box[3] - a.box[1]) - (b.box[2] - b.box[0]) * (b.box[3] - b.box[1]));
    return found[0];
  }

  function down(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const [x, y] = pointAt(e);
    const corner = (e.target as HTMLElement).dataset.corner as Drag['corner'] | undefined;
    if (corner && selectedBox) {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({kind: 'resize', corner, start: [x, y], box: selectedBox, moved: false, dx: 0, dy: 0, guides: {}});
      return;
    }
    const inSelected = selection.block ? hit(x, y, selection.block) : undefined;
    const startDrag = (block: string, box: Box | undefined, pending?: Selection) => {
      if (!box || !editable(block)) { if (pending) onSelect(pending); return; }
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({kind: 'move', start: [x, y], box, moved: false, dx: 0, dy: 0, guides: {}, pending});
    };
    if (inSelected && selection.block) {
      if (selection.element && inSelected.element !== selection.element) onSelect({block: selection.block, element: inSelected.element});
      if (selection.element || e.detail >= 2) {
        if (!selection.element) onSelect({block: selection.block, element: inSelected.element});
        startDrag(selection.block, inSelected.box);
      } else {
        // The block is selected: dragging moves it, a click without moving selects the element under the pointer.
        startDrag(selection.block, blockBoxes.get(selection.block), {block: selection.block, element: inSelected.element});
      }
      return;
    }
    const any = hit(x, y);
    if (!any) { onSelect({block: null, element: null}); return; }
    const next = {block: any.block, element: e.detail >= 2 ? any.element : null};
    onSelect(next);
    startDrag(any.block, next.element ? any.box : blockBoxes.get(any.block));
  }

  function moveTo(e: ReactPointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d) return;
    const [x, y] = pointAt(e);
    let dx = x - d.start[0], dy = y - d.start[1];
    if (!d.moved && Math.hypot(dx * scale, dy * scale) < 3) return;
    const guides: Drag['guides'] = {};
    if (d.kind === 'move') {
      // Snap the left edge to the margin, the right edge to the right margin, the centre to the page centre.
      const left = template.margins.left, right = page.width - template.margins.right, middle = page.width / 2;
      const [x0, , x1] = d.box;
      const candidates: [number, number][] = [[left - (x0 + dx), left], [right - (x1 + dx), right], [middle - ((x0 + x1) / 2 + dx), middle]];
      for (const [shift, at] of candidates) if (Math.abs(shift) < SNAP && !e.altKey) { dx += shift; guides.x = at; break; }
      const top = page.height - template.margins.top;
      const shiftY = top - (d.box[3] + dy);
      if (Math.abs(shiftY) < SNAP && !e.altKey) { dy += shiftY; guides.y = top; }
    }
    setDrag({...d, moved: true, dx, dy, guides});
  }

  function up() {
    const d = dragRef.current;
    setDrag(null);
    if (d && !d.moved && d.pending) { onSelect(d.pending); return; }
    if (!d || !d.moved) return;
    if (d.kind === 'move') { onMove(d.dx, d.dy); return; }
    // Resizing keeps the proportions, from the opposite corner.
    const [x0, y0, x1, y1] = d.box;
    const w = x1 - x0, h = y1 - y0;
    const signX = d.corner === 'ne' || d.corner === 'se' ? 1 : -1;
    const k = Math.max(0.05, (w + signX * d.dx) / w);
    const nw = w * k, nh = h * k;
    const nx0 = signX > 0 ? x0 : x1 - nw;
    const top = d.corner === 'nw' || d.corner === 'ne';
    const ny0 = top ? y0 : y1 - nh;
    onResize([nx0, ny0, nx0 + nw, ny0 + nh]);
  }

  function ghost(): Box | null {
    if (!drag || !drag.moved || !selectedBox) return null;
    const [x0, y0, x1, y1] = drag.box;
    if (drag.kind === 'move') return [x0 + drag.dx, y0 + drag.dy, x1 + drag.dx, y1 + drag.dy];
    const w = x1 - x0, h = y1 - y0;
    const signX = drag.corner === 'ne' || drag.corner === 'se' ? 1 : -1;
    const k = Math.max(0.05, (w + signX * drag.dx) / w);
    const nx0 = signX > 0 ? x0 : x1 - w * k;
    const ny0 = drag.corner === 'nw' || drag.corner === 'ne' ? y0 : y1 - h * k;
    return [nx0, ny0, nx0 + w * k, ny0 + h * k];
  }
  const g = ghost();

  return (
    <div ref={stage} className="rc-doc-stage rc-man-stage" data-compare={side ? 'side' : undefined} tabIndex={0} role="region" aria-label="Página de la unidad (desplazable). Las flechas mueven lo elegido.">
      {side ? (
        <figure className="rc-man-figure">
          <figcaption>Original</figcaption>
          <div className="rc-doc-paper"><canvas ref={origCanvas} aria-label="Página del PDF original" /></div>
        </figure>
      ) : compare === 'diff' ? <canvas ref={origCanvas} hidden /> : null}
      <figure className="rc-man-figure">
        {side ? <figcaption>Ahora</figcaption> : null}
        <div className="rc-doc-paper rc-man-paper">
          <canvas ref={canvas} aria-hidden="true" />
          {compare === 'diff' ? <canvas ref={diffCanvas} className="rc-man-diff" aria-hidden="true" /> : null}
          <div
            className="rc-man-overlay"
            data-dragging={drag?.moved ? 'true' : undefined}
            onPointerDown={down}
            onPointerMove={moveTo}
            onPointerUp={up}
            onPointerCancel={() => setDrag(null)}
            aria-hidden="true"
          >
            {[...blockBoxes].map(([id, b]) => (
              <div key={id} className="rc-man-block" data-selected={selection.block === id ? 'true' : undefined} data-locked={blocks.get(id)?.locked ? 'true' : undefined} style={toCss(b)} />
            ))}
            {selection.block ? boxes.filter(b => b.block === selection.block).map(b => (
              <div key={b.element} className="rc-man-el" data-selected={selection.element === b.element ? 'true' : undefined} data-overflow={overflowIds.has(b.element) ? 'true' : undefined} style={toCss(b.box)} />
            )) : null}
            {boxes.filter(b => overflowIds.has(b.element) && blockOf.get(b.element) !== selection.block).map(b => <div key={'o' + b.element} className="rc-man-el" data-overflow="true" style={toCss(b.box)} />)}
            {selectedBox && !g ? (
              <div className="rc-man-selection" style={toCss(selectedBox)}>
                {resizable ? (['nw', 'ne', 'sw', 'se'] as const).map(c => <span key={c} className="rc-man-handle" data-corner={c} />) : null}
              </div>
            ) : null}
            {g ? <div className="rc-man-ghost" style={toCss(g)} /> : null}
            {drag?.guides.x !== undefined ? <div className="rc-man-guide rc-man-guide--v" style={{left: drag.guides.x * scale}} /> : null}
            {drag?.guides.y !== undefined ? <div className="rc-man-guide rc-man-guide--h" style={{top: (H - drag.guides.y) * scale}} /> : null}
          </div>
        </div>
      </figure>
    </div>
  );
}
