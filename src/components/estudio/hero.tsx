'use client';
import {useEffect, useMemo, useState} from 'react';
import {ChevronLeft, ChevronRight, Clapperboard} from 'lucide-react';
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
  const [paused, setPaused] = useState(false);
  const n = shots.length;
  const i = n ? at % n : 0;

  // It moves on by itself every few seconds, unless the person asked for less motion or is looking at it.
  useEffect(() => {
    if (n < 2 || paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setAt(x => x + 1), 6000);
    return () => clearInterval(t);
  }, [n, paused]);

  if (!n) {
    return (
      <div className="rc-es-hero rc-es-hero--empty" aria-hidden="true">
        <span className="rc-es-poster" data-pos="left" />
        <span className="rc-es-poster" data-pos="right" />
        <span className="rc-es-poster" data-pos="center"><Clapperboard /><small>Tus imágenes y videos aparecen acá</small></span>
      </div>
    );
  }

  const place = (k: number): Place => {
    const d = (k - i + n) % n;
    return d === 0 ? 'center' : d === 1 ? 'right' : d === n - 1 ? 'left' : 'off';
  };
  return (
    <div className="rc-es-hero" role="group" aria-roledescription="carrusel" aria-label="Tus últimos resultados" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
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
      {n > 1 ? <button type="button" className="rc-es-hero-nav" data-side="prev" aria-label="Anterior" onClick={() => setAt(x => x - 1 + n)}><ChevronLeft /></button> : null}
      {n > 1 ? <button type="button" className="rc-es-hero-nav" data-side="next" aria-label="Siguiente" onClick={() => setAt(x => x + 1)}><ChevronRight /></button> : null}
      <p className="sr-only" aria-live="polite">{i + 1} de {n}</p>
    </div>
  );
}
