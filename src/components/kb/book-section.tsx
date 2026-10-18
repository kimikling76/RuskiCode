'use client';
import Link from 'next/link';
import {BookMarked, ChevronRight} from 'lucide-react';
import {useKbProjects} from './use-kb';

/** PDF Studio home: the book projects with their context, or how to start one. */
export function BookSection() {
  const projects = useKbProjects();
  return (
    <section className="rc-page-section">
      <h2>Contexto del libro</h2>
      <p className="rc-hint rc-pdf-home-note">El canon de personajes, las unidades, las reglas y las decisiones del libro, con su fuente y su estado. Lo usan solo las unidades de ese libro y los asistentes que elijas.</p>
      {projects === null ? null : projects.length ? (
        <ul className="rc-project-list">
          {projects.map(p => (
            <li key={p.id}>
              <Link href={'/workspace/libro?p=' + p.id} className="rc-project-row">
                <span className="rc-project-name">{p.name}</span>
                <span className="rc-project-type">{Object.keys(p.units).length} {Object.keys(p.units).length === 1 ? 'unidad vinculada' : 'unidades vinculadas'}</span>
                <ChevronRight aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rc-pdf-home-actions"><Link href="/workspace/libro" className="rc-btn rc-btn--secondary"><BookMarked aria-hidden="true" />Crear el contexto del libro</Link></div>
      )}
    </section>
  );
}
