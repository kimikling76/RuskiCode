import Link from 'next/link';
import {BrandMark} from '@/components/studio/brand';

export const metadata = {title: 'Página no encontrada · Russian Code'};

export default function NotFound() {
  return (
    <div className="rc-site rc-status-page">
      <BrandMark size={40} />
      <main className="rc-status-body">
        <h1>Esta página no existe</h1>
        <p>Puede que la dirección esté mal escrita o que la página se haya movido.</p>
        <div className="rc-status-actions">
          <Link href="/workspace" className="rc-btn rc-btn--primary">Ir al estudio</Link>
          <Link href="/" className="rc-btn rc-btn--ghost">Volver a la portada</Link>
        </div>
      </main>
    </div>
  );
}
