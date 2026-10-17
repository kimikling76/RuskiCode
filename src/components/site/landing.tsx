import Link from 'next/link';
import {ArrowUpRight} from 'lucide-react';
import {BrandMark, Wordmark} from '@/components/studio/brand';

// What each studio does today. Keep this in step with the product: nothing listed here may be a plan.
const studios = [
  {
    id: 'chat',
    name: 'Chat',
    today: 'Conversaciones con los modelos de Kie, con historial, Markdown y la opción de detener o regenerar. Una conversación se puede convertir en proyecto.',
    notYet: 'Los chats viven en el navegador donde los escribiste.',
  },
  {
    id: 'pdf',
    name: 'PDF Studio',
    today: 'Libros por bloques con páginas reales: plantillas de unidad, vocabulario, diálogo, ejercicios y caligrafía, un asistente editorial y exportación a PDF.',
    notYet: 'Mover bloques a mano sobre la hoja y exportar a Word.',
  },
  {
    id: 'cinema',
    name: 'Cinema Studio',
    today: 'Imágenes con Kie: crear, editar con antes y después, planificar planos y guardar todo en una galería.',
    notYet: 'El video todavía no está conectado.',
  },
] as const;

export function Landing() {
  return (
    <div className="rc-site rc-landing">
      <a href="#inicio" className="rc-skip-link">Saltar al contenido</a>
      <header className="rc-site-nav">
        <Link href="/" className="rc-site-brand" aria-label="Russian Code, inicio"><Wordmark /></Link>
        <nav className="rc-site-links" aria-label="Principal">
          <a href="/demo/ruskicode-sample.pdf" className="rc-btn rc-btn--ghost rc-hide-xs" target="_blank" rel="noreferrer">Ver la muestra</a>
          <Link href="/login" className="rc-btn rc-btn--secondary">Entrar</Link>
        </nav>
      </header>

      <main id="inicio" tabIndex={-1}>
        <section className="rc-hero" aria-labelledby="hero-title">
          <div className="rc-hero-text">
            <h1 id="hero-title">Conversar, escribir un libro y crear sus imágenes, en el mismo estudio.</h1>
            <p className="rc-hero-lead">
              Russian Code es un estudio creativo con IA. Las ideas empiezan en el Chat y se convierten en libros con páginas reales o en imágenes, sin cambiar de herramienta.
            </p>
            <p className="rc-hero-lead">
              Su primer proyecto es <span lang="ru">«Русский код»</span>, un libro de ruso A1 para clases individuales.
            </p>
            <div className="rc-hero-actions">
              <Link href="/login" className="rc-btn rc-btn--primary rc-btn--lg">Entrar al estudio</Link>
              <a href="/demo/ruskicode-sample.pdf" className="rc-btn rc-btn--ghost rc-btn--lg" target="_blank" rel="noreferrer">Ver la muestra en PDF</a>
            </div>
            <p className="rc-hint">Acceso solo para el equipo. El registro está cerrado.</p>
          </div>

          <figure className="rc-hero-desk">
            <BrandMark size={640} className="rc-hero-glyph" />
            <div className="rc-hero-page">
              {/* A real page rendered by the PDF Studio composer from the sample project. */}
              <img src="/demo/page-3.jpg" width={786} height={1111} alt="Página «Давай знакомиться.» del libro: una nota, un ejercicio de cuatro frases, una tabla y un texto para leer." />
              <span className="rc-hero-block" aria-hidden="true"><span>Ejercicio</span></span>
            </div>
            <figcaption>Una página de la muestra <span lang="ru">«Русский код · A1»</span>, compuesta por PDF Studio. Cada bloque se toca y se edita.</figcaption>
          </figure>
        </section>

        <section className="rc-site-section" aria-labelledby="estudios">
          <h2 id="estudios">Tres espacios, una cuenta</h2>
          <ul className="rc-studio-list">
            {studios.map(s => (
              <li key={s.id} data-studio={s.id}>
                <h3>{s.name}</h3>
                <p>{s.today}</p>
                <p className="rc-studio-list-next"><span>Todavía no:</span> {s.notYet}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="rc-site-section rc-site-costs" aria-labelledby="costos">
          <h2 id="costos">Lo que cuesta</h2>
          <div className="rc-site-prose">
            <p>Todo el consumo de IA es de Kie.ai y se mide en sus créditos. No hay una suscripción propia.</p>
            <p>Con «Preguntar antes» activado, el estudio muestra qué vas a pedir antes de enviarlo. El costo real aparece cuando Kie lo informa, y en Ajustes se ve el saldo de la cuenta. No hay saldos ni precios inventados.</p>
            <p>Kie conserva las imágenes generadas 14 días; las que quieras guardar, descargalas.</p>
            <a className="rc-site-link" href="https://kie.ai/logs" target="_blank" rel="noreferrer">Registro de consumo en Kie<ArrowUpRight aria-hidden="true" /></a>
          </div>
        </section>
      </main>

      <footer className="rc-site-foot">
        <Wordmark sub />
        <div className="rc-site-foot-links">
          <Link href="/login">Entrar</Link>
          <a href="/demo/ruskicode-sample.pdf" target="_blank" rel="noreferrer">Muestra del libro (PDF)</a>
        </div>
      </footer>
    </div>
  );
}
