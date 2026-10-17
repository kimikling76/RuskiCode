'use client';
import {useEffect} from 'react';
import Link from 'next/link';
import {BrandMark} from '@/components/studio/brand';

export default function ErrorPage({error, retry}: {error: Error & {digest?: string}; retry: () => void}) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="rc-site rc-status-page">
      <BrandMark size={40} />
      <main className="rc-status-body">
        <h1>No se pudo abrir esta página</h1>
        <p>Tus chats, libros e imágenes guardados en este navegador no se tocaron. Probá de nuevo; si sigue fallando, recargá la página.</p>
        <div className="rc-status-actions">
          <button type="button" className="rc-btn rc-btn--primary" onClick={() => retry()}>Reintentar</button>
          <Link href="/workspace" className="rc-btn rc-btn--ghost">Ir al estudio</Link>
        </div>
        {error.digest ? <p className="rc-hint">Código para soporte: <span translate="no">{error.digest}</span></p> : null}
      </main>
    </div>
  );
}
