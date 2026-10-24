'use client';
import Link from 'next/link';
import {BookMarked, ChevronRight, Plus} from 'lucide-react';
import {useKbProjects} from './use-kb';

/** PDF Studio's library: one line with each book's context (characters, units, rules), or how to start one. */
export function BookStrip() {
  const projects = useKbProjects();
  if (projects === null) return null;
  return (
    <section className="rc-lib-context" aria-labelledby="lib-context-title">
      <BookMarked className="rc-lib-context-icon" aria-hidden="true" />
      <div className="rc-lib-context-text">
        <h2 id="lib-context-title">Contexto del libro</h2>
        <p className="rc-hint">Personajes, unidades y reglas que usan el asistente y las ilustraciones.</p>
      </div>
      <div className="rc-lib-context-links">
        {projects.length ? projects.map(p => {
          const units = Object.keys(p.units).length;
          return (
            <Link key={p.id} href={'/workspace/libro?p=' + p.id} className="rc-btn rc-btn--secondary rc-btn--sm">
              <span>{p.name}</span>
              <span className="rc-lib-context-count">{units} {units === 1 ? 'unidad' : 'unidades'}</span>
              <ChevronRight aria-hidden="true" />
            </Link>
          );
        }) : (
          <Link href="/workspace/libro" className="rc-btn rc-btn--secondary rc-btn--sm"><Plus aria-hidden="true" />Crear el contexto</Link>
        )}
      </div>
    </section>
  );
}
