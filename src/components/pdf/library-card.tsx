'use client';
import {useEffect, useRef, useState, type ReactNode} from 'react';
import Link from 'next/link';
import {FileText, MoreHorizontal} from 'lucide-react';
import {drawPage, openPdf} from '@/lib/pdf/viewer';
import {Menu, MenuContent, MenuItem, MenuTrigger} from '@/components/ui/menu';

// The cards of PDF Studio's library: what each thing looks like (the real first page of a PDF or a unit, a cover
// drawn from a book's own title and level) and what can be done with it.

/** First pages already drawn, by file and version: going back to the library does not draw them again. */
const drawn = new Map<string, string>();

/**
 * The real first page of a PDF, drawn when the card scrolls into view. `load` gives the file's bytes from this
 * browser (or the account); without them the card says so instead of guessing.
 */
export function FirstPage({cacheKey, load, missing}: {cacheKey: string; load: () => Promise<ArrayBuffer | Uint8Array | null | undefined>; missing?: string}) {
  const [url, setUrl] = useState(() => drawn.get(cacheKey) || null);
  const [failed, setFailed] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const loader = useRef(load);
  loader.current = load;
  useEffect(() => {
    if (url || missing) return;
    const el = box.current;
    if (!el) return;
    let cancelled = false;
    const io = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) return;
      io.disconnect();
      void (async () => {
        const bytes = await loader.current();
        if (!bytes) throw Error('NO_FILE');
        const doc = await openPdf(bytes instanceof Uint8Array ? bytes.slice().buffer : bytes);
        try {
          const canvas = document.createElement('canvas');
          await drawPage(await doc.getPage(1), canvas, 240).task.promise;
          const blob = await new Promise<Blob | null>(done => canvas.toBlob(done, 'image/webp', 0.86));
          if (!blob) throw Error('NO_IMAGE');
          const made = URL.createObjectURL(blob);
          drawn.set(cacheKey, made);
          if (!cancelled) setUrl(made);
        } finally { void doc.loadingTask.destroy(); }
      })().catch(() => { if (!cancelled) setFailed(true); });
    }, {rootMargin: '240px'});
    io.observe(el);
    return () => { cancelled = true; io.disconnect(); };
  }, [cacheKey, url, missing]);
  return (
    <span ref={box} className="rc-lib-page" data-state={url ? 'ready' : missing || failed ? 'none' : 'loading'}>
      {url ? <img src={url} alt="" /> : missing || failed ? <span className="rc-lib-page-none"><FileText aria-hidden="true" />{missing || 'Sin vista previa'}</span> : null}
    </span>
  );
}

const languages = {ru: 'Ruso', es: 'Español', en: 'Inglés'} as const;

/** A book's cover, drawn from its own data: title, level and language. It is not a picture of a page. */
export function BookCover({title, level, language, author}: {title: string; level?: string; language?: keyof typeof languages; author?: string}) {
  return (
    <span className="rc-lib-page rc-lib-cover" data-state="ready">
      {level ? <span className="rc-lib-cover-level">{level}</span> : null}
      <span className="rc-lib-cover-title" lang={language}>{title || 'Sin título'}</span>
      <span className="rc-lib-cover-foot">{[author, language ? languages[language] : ''].filter(Boolean).join(' · ')}</span>
    </span>
  );
}

export type CardKind = 'book' | 'pdf' | 'unit' | 'sample';
const kindName: Record<CardKind, string> = {book: 'Libro', pdf: 'PDF', unit: 'Manual', sample: 'Muestra'};

/** One thing of the library. The whole card opens it; «⋯» holds what else can be done (only what exists). */
export function LibraryCard({kind, title, meta, href, picture, onDelete, deleteLabel = 'Borrar'}: {
  kind: CardKind; title: string; meta: string; href?: string; picture: ReactNode; onDelete?: () => void; deleteLabel?: string;
}) {
  const body = (
    <>
      {/* The picture is seen, not read: the card is read as «Libro: title, details». */}
      <span className="rc-lib-thumb" aria-hidden="true">
        {picture}
        <span className="rc-lib-kind" data-kind={kind}>{kindName[kind]}</span>
      </span>
      <span className="rc-lib-text">
        <strong><span className="sr-only">{kindName[kind]}: </span>{title}</strong>
        <span>{meta}</span>
      </span>
    </>
  );
  return (
    <li className="rc-lib-card">
      {href ? <Link href={href} className="rc-lib-open">{body}</Link> : <span className="rc-lib-open" aria-disabled="true">{body}</span>}
      {onDelete ? (
        <Menu>
          <MenuTrigger asChild>
            <button type="button" className="rc-icon-btn rc-lib-more" aria-label={'Más opciones de «' + title + '»'}><MoreHorizontal /></button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem danger onSelect={onDelete}>{deleteLabel}</MenuItem>
          </MenuContent>
        </Menu>
      ) : null}
    </li>
  );
}
