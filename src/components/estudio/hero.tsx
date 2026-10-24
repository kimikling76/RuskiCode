'use client';
import {useEffect, useMemo, useState} from 'react';
import {ChevronLeft, ChevronRight, Clapperboard, Pause, Play} from 'lucide-react';
import {useCinema, isDone, type CinemaJob} from '@/store/cinema';
import {savedUrl} from '@/lib/cinema/keep';
import {KieImage} from '@/components/cinema/job-card';

// The Estudio's first view: the author's own latest results as posters, three in sight and the middle one larger.
// Every poster keeps its element while the row turns, so each one slides to its new place instead of jumping.
// Nothing stands in for them: with no results yet, three empty frames say where they will appear.

type Place = 'left' | 'center' | 'right' | 'off';

function Frame({job}: {job: CinemaJob}) {
  const url = job.urls[0];
  return job.mode === 'video'
    ? <video src={url} muted playsInline preload="metadata" aria-hidden="true" />
    : <KieImage src={url} alt="" fallback={savedUrl(job)} />;
}

export function EstudioHero({onOpen}: {onOpen: (job: CinemaJob) => void}) {
  const all = useCinema(s => s.data.jobs);
  const shots = useMemo(() => all.filter(isDone).slice(0, 7), [all]);
  const [at, setAt] = useState(0);
  // Looking at it (hover or focus) holds it for a moment; the pause button holds it until it is resumed.
  const [held, setHeld] = useState(false);
  const [stopped, setStopped] = useState(false);
  // Until the browser says otherwise, assume less motion: nothing turns by itself before that is known.
  const [still, setStill] = useState(true);
  const n = shots.length;
  const i = n ? at % n : 0;

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const read = () => setStill(query.matches);
    read();
    query.addEventListener('change', read);
    return () => query.removeEventListener('change', read);
  }, []);

  useEffect(() => {
    if (n < 2 || held || stopped || still) return;
    const t = setInterval(() => setAt(x => x + 1), 6000);
    return () => clearInterval(t);
  }, [n, held, stopped, still]);

  if (!n) {
    return (
      <div className="rc-es-hero rc-es-hero--empty" aria-hidden="true">
        <div className="rc-es-hero-stage">
          <span className="rc-es-poster" data-pos="left" />
          <span className="rc-es-poster" data-pos="right" />
          <span className="rc-es-poster" data-pos="center"><Clapperboard /><small>Tus imágenes y videos aparecen acá</small></span>
        </div>
      </div>
    );
  }

  const place = (k: number): Place => {
    const d = (k - i + n) % n;
    return d === 0 ? 'center' : d === 1 ? 'right' : d === n - 1 ? 'left' : 'off';
  };
  return (
    <div className="rc-es-hero" role="group" aria-roledescription="carrusel" aria-label="Tus últimos resultados" onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)} onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}>
      <div className="rc-es-hero-stage">
        {shots.map((job, k) => {
          const pos = place(k);
          return (
            <button
              key={job.id}
              type="button"
              className="rc-es-poster"
              data-pos={pos}
              inert={pos === 'off'}
              aria-label={(pos === 'center' ? 'Ver en grande: ' : 'Mostrar: ') + job.prompt.slice(0, 80)}
              onClick={() => pos === 'center' ? onOpen(job) : setAt(x => x + (pos === 'left' ? n - 1 : 1))}
            >
              <Frame job={job} />
            </button>
          );
        })}
      </div>
      {n > 1 ? (
        <div className="rc-es-hero-controls">
          <button type="button" className="rc-es-hero-btn" aria-label="Anterior" onClick={() => setAt(x => x - 1 + n)}><ChevronLeft /></button>
          <span className="rc-es-hero-dots" aria-hidden="true">{shots.map((s, k) => <span key={s.id} data-on={k === i || undefined} />)}</span>
          {still ? null : (
            <button type="button" className="rc-es-hero-btn" aria-label="Pausar el carrusel" aria-pressed={stopped} onClick={() => setStopped(v => !v)}>
              {stopped ? <Play /> : <Pause />}
            </button>
          )}
          <button type="button" className="rc-es-hero-btn" aria-label="Siguiente" onClick={() => setAt(x => x + 1)}><ChevronRight /></button>
        </div>
      ) : null}
      {/* While it turns by itself it stays quiet; when the person moves it, the new place is announced. */}
      <p className="sr-only" aria-live={held || stopped || still ? 'polite' : 'off'}>{i + 1} de {n}</p>
    </div>
  );
}
