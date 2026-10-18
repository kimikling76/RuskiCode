'use client';
import {memo, useEffect, useRef} from 'react';
import {Plus} from 'lucide-react';
import type {PageInfo} from './page-canvas';
import {Tip} from '@/components/ui/tooltip';

const THUMB = 116;
export const issueText: Record<string, string> = {
  OVERFLOW: 'El contenido no entra en esta página.',
  SPARSE_PAGE: 'Página casi vacía.',
  ORPHAN_HEADING: 'Un título quedó solo al final de la página.',
};

/** Real page, drawn small inside a shadow root so the book's styles never touch the app (and vice versa). */
const Thumb = memo(function Thumb({html, css, scale, width, height}: {html: string; css: string; scale: number; width: number; height: number}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const root = el.shadowRoot || el.attachShadow({mode: 'open'});
    root.innerHTML = `<style>${css}:host{display:block;overflow:hidden}.rc-thumb-scale{transform:scale(${scale});transform-origin:0 0;width:${width}px;height:${height}px;pointer-events:none}</style><div class="rc-thumb-scale">${html}</div>`;
  }, [html, css, scale, width, height]);
  return <div ref={host} className="rc-pdf-thumb-host" style={{width: Math.round(width * scale), height: Math.round(height * scale)}} aria-hidden="true" />;
});

export function PageRail({pages, css, pageSize, chapters, activePage, onPick, onAddChapter, canAddChapter}: {
  pages: PageInfo[];
  css: string;
  pageSize: {w: number; h: number};
  chapters: string[];
  activePage: number;
  onPick: (page: PageInfo) => void;
  onAddChapter: () => void;
  canAddChapter: boolean;
}) {
  const list = useRef<HTMLDivElement>(null);
  const scale = THUMB / Math.max(1, pageSize.w);

  // Keep the page that is on screen visible in the rail.
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>(`[data-page="${activePage}"]`);
    el?.scrollIntoView({block: 'nearest'});
  }, [activePage]);

  return (
    <nav className="rc-pdf-rail" aria-label="Páginas">
      <div ref={list} className="rc-pdf-rail-list">
        {pages.map((page, i) => {
          const group = page.index === 0 ? 'Portada' : page.index === 1 ? 'Contenido' : pages[i - 1]?.chapter !== page.chapter ? chapters[page.chapter] : null;
          return (
            <div key={page.index} className="rc-pdf-rail-item">
              {group ? <p className="rc-pdf-rail-group">{group}</p> : null}
              <button
                type="button"
                data-page={page.index}
                className="rc-pdf-thumb"
                aria-current={activePage === page.index ? 'page' : undefined}
                onClick={() => onPick(page)}
              >
                {/* The name comes from the text, not aria-label: the miniature's own text would not match it. */}
                <Thumb html={page.html} css={css} scale={scale} width={pageSize.w} height={pageSize.h} />
                <span className="sr-only">Página </span><span className="rc-pdf-thumb-num">{page.index + 1}</span>
                {page.issues.length ? <span className="sr-only">{': ' + page.issues.map(c => issueText[c] || c).join(' ')}</span> : null}
                {page.issues.length ? (
                  <Tip label={page.issues.map(c => issueText[c] || c).join(' ')} side="right">
                    <span className="rc-pdf-thumb-issue" aria-hidden="true" />
                  </Tip>
                ) : null}
              </button>
            </div>
          );
        })}
      </div>
      <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm rc-pdf-rail-add" onClick={onAddChapter} disabled={!canAddChapter}>
        <Plus aria-hidden="true" />Capítulo
      </button>
    </nav>
  );
}
