'use client';
import {forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState} from 'react';
import type {EditableBook} from '@/lib/books/editable';
import {blockHtml, bookFontCss, coverHtml, paginateBook, renderHtml, type PaginateResult} from '@/lib/books/layout-html';

export type PageInfo = {index: number; chapter: number; html: string; issues: string[]};
export type LayoutState = {
  status: 'working' | 'ready' | 'error';
  pages: PageInfo[];
  css: string;
  pageSize: {w: number; h: number};
  missingImages: number;
  error?: {code: string; blockId?: string};
};
export type CanvasHandle = {scrollToPage: (index: number) => void; scrollToBlock: (id: string) => void; print: () => void};

type Props = {
  book: EditableBook;
  selectedBlockId: string | null;
  notedBlockIds: Set<string>;
  zoom: 'fit' | number;
  onSelect: (blockId: string | null, chapter: number) => void;
  onLayout: (layout: LayoutState) => void;
  onVisiblePage: (index: number) => void;
};

const GUTTER = 28;
// Screen-only look of the paper on the desk; print output is exactly the composer's page.
const screenCss = `@media screen{html,body{background:transparent}body{padding:${GUTTER}px 0}.page{margin:0 auto ${GUTTER}px;box-shadow:0 1px 2px rgba(0,0,0,.35),0 18px 40px -18px rgba(0,0,0,.75)}[data-source]{cursor:pointer;border-radius:2px;transition:outline-color .12s}[data-source]:hover{outline:1px solid rgba(110,143,31,.45);outline-offset:1.2mm}.rc-selected,.rc-selected:hover{outline:2px solid #6E8F1F;outline-offset:1.2mm}.rc-noted{position:relative}.rc-noted::after{content:'';position:absolute;right:-6mm;top:.5mm;width:2.4mm;height:2.4mm;border-radius:50%;background:#DDB05A}.page:first-child{cursor:pointer}}@media print{body{padding:0}.page{margin:0;box-shadow:none}}`;

function bookStyle(html: string) {
  return html.slice(html.indexOf('<style>') + 7, html.indexOf('</style>'));
}

export const PageCanvas = forwardRef<CanvasHandle, Props>(function PageCanvas({book, selectedBlockId, notedBlockIds, zoom, onSelect, onLayout, onVisiblePage}, ref) {
  const frame = useRef<HTMLIFrameElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [size, setSize] = useState({w: 860, h: 1200});
  const [scale, setScale] = useState(1);
  const version = useRef(0);
  const chapterOf = useRef(new Map<string, number>());
  const handlers = useRef({onSelect, onLayout, onVisiblePage});
  handlers.current = {onSelect, onLayout, onVisiblePage};

  const doc = () => frame.current?.contentDocument || null;

  // Base document, created once. Content and the book stylesheet are replaced on every change.
  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><title></title><style>${bookFontCss(f => '/book-fonts/' + f)}</style><style id="book"></style><style>${screenCss}</style></head><body></body></html>`;

  const wired = useRef(false);
  const onLoad = useCallback(() => {
    const d = doc();
    if (!d || wired.current || !d.getElementById('book')) return;
    wired.current = true;
    d.addEventListener('click', e => {
      const target = e.target as Element | null;
      const piece = target?.closest('[data-source]');
      if (piece) {
        const id = piece.getAttribute('data-source')!;
        handlers.current.onSelect(id, chapterOf.current.get(id) ?? -1);
        return;
      }
      const page = target?.closest('.page');
      if (page && page === d.body.firstElementChild) handlers.current.onSelect(null, -1);
    });
    setReady(true);
  }, []);

  // The frame may finish loading before React attaches onLoad.
  useEffect(() => { onLoad(); }, [onLoad]);

  // Paginate with the composer's own algorithm (debounced while typing).
  useEffect(() => {
    if (!ready) return;
    const run = ++version.current;
    handlers.current.onLayout({status: 'working', pages: [], css: '', pageSize: size, missingImages: 0});
    const timer = setTimeout(async () => {
      const d = doc();
      if (!d) return;
      const {spec, chapters, assets} = book;
      const css = bookStyle(renderHtml(spec));
      const map = new Map<string, number>();
      chapters.forEach((ch, i) => ch.blocks.forEach(b => map.set(b.id, i)));
      chapterOf.current = map;
      const missingImages = chapters.flatMap(c => c.blocks).filter(b => b.type === 'image' && !(b.assetId && assets[b.assetId])).length;
      try {
        await Promise.all([d.fonts.load('400 16px BookSans', 'Аа Ññ'), d.fonts.load('700 16px BookSans', 'Аа Ññ')]);
        // Decoded images lay out at their real size the moment they are inserted.
        await Promise.all(Object.values(assets).map(src => { const img = d.createElement('img'); img.src = src; return img.decode().catch(() => undefined); }));
        if (run !== version.current) return;
        d.getElementById('book')!.textContent = css;
        d.title = spec.title;
        d.body.replaceChildren();
        const input = chapters.map(ch => ({title: ch.title, blocks: ch.blocks.map(block => ({block, html: blockHtml(block, assets, 'placeholder')}))}));
        let result: PaginateResult | undefined;
        let error: LayoutState['error'];
        try {
          result = paginateBook({input, footerTitle: spec.title + ' · ' + spec.level, coverHtml: coverHtml(spec), level: spec.level, language: spec.language}, d.body);
        } catch (e) {
          error = {code: e instanceof Error ? e.message : 'LAYOUT_FAILED', blockId: (e as {blockId?: string}).blockId};
        }
        const sheets = Array.from(d.body.querySelectorAll<HTMLElement>('.page'));
        let last = -1;
        const pages: PageInfo[] = sheets.map((sheet, index) => {
          if (index > 1) {
            const first = sheet.querySelector('[data-source]')?.getAttribute('data-source');
            if (first && map.has(first)) last = map.get(first)!;
          }
          const issues = (result?.issues || []).filter(i => i.page === index + 1).map(i => i.code);
          return {index, chapter: index > 1 ? last : -1, html: sheet.outerHTML, issues};
        });
        const first = sheets[0];
        const pageSize = first ? {w: first.offsetWidth, h: first.offsetHeight} : size;
        setSize({w: pageSize.w + GUTTER * 2, h: d.documentElement.scrollHeight});
        const thumbCss = css.replace(/@page\{[^}]*\}/, '') + '.page{margin:0!important;box-shadow:none!important}';
        handlers.current.onLayout({status: error ? 'error' : 'ready', pages, css: thumbCss, pageSize, missingImages, error});
      } catch {
        if (run === version.current) handlers.current.onLayout({status: 'error', pages: [], css: '', pageSize: size, missingImages, error: {code: 'LAYOUT_FAILED'}});
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [book, ready]); // size only feeds the placeholder state

  // Selection and note markers only touch classes; no new layout.
  useEffect(() => {
    const d = doc();
    if (!d) return;
    d.querySelectorAll('.rc-selected').forEach(el => el.classList.remove('rc-selected'));
    d.querySelectorAll('.rc-noted').forEach(el => el.classList.remove('rc-noted'));
    if (selectedBlockId) d.querySelectorAll(`[data-source="${CSS.escape(selectedBlockId)}"]`).forEach(el => el.classList.add('rc-selected'));
    notedBlockIds.forEach(id => d.querySelectorAll(`[data-source="${CSS.escape(id)}"]`).forEach(el => el.classList.add('rc-noted')));
  });

  // Fit the paper to the available width, or use a fixed zoom.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () => setScale(zoom === 'fit' ? Math.min(1.25, Math.max(0.3, (el.clientWidth - 24) / size.w)) : zoom);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [zoom, size.w]);

  function pageTop(index: number) {
    const page = doc()?.body.children[index] as HTMLElement | undefined;
    return page ? page.offsetTop * scale : null;
  }

  useImperativeHandle(ref, () => ({
    scrollToPage: index => { const top = pageTop(index); if (top !== null) scroller.current?.scrollTo({top: top - 12, behavior: 'smooth'}); },
    scrollToBlock: id => {
      const d = doc();
      const el = d?.querySelector<HTMLElement>(`[data-source="${CSS.escape(id)}"]`);
      if (!el || !d) return;
      const top = (el.getBoundingClientRect().top + (d.defaultView?.scrollY || 0)) * scale;
      scroller.current?.scrollTo({top: Math.max(0, top - 80), behavior: 'smooth'});
    },
    print: () => frame.current?.contentWindow?.print(),
  }), [scale]);

  function onScroll() {
    const el = scroller.current;
    const d = doc();
    if (!el || !d) return;
    const middle = el.scrollTop + el.clientHeight / 3;
    const sheets = Array.from(d.body.children) as HTMLElement[];
    let index = 0;
    sheets.forEach((s, i) => { if (s.offsetTop * scale <= middle) index = i; });
    handlers.current.onVisiblePage(index);
  }

  return (
    <div ref={scroller} className="rc-pdf-desk" onScroll={onScroll} tabIndex={0} aria-label="Páginas del libro">
      <div className="rc-pdf-paper" style={{width: size.w * scale, height: size.h * scale}}>
        <iframe
          ref={frame}
          title="Páginas del libro"
          srcDoc={srcDoc}
          onLoad={onLoad}
          style={{width: size.w, height: size.h, transform: `scale(${scale})`}}
        />
      </div>
    </div>
  );
});
