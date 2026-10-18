'use client';
import {useEffect, useState} from 'react';
import {toast} from 'sonner';
import {listUnits} from '@/lib/manual/store';
import type {Unit} from '@/lib/manual/model';
import {saveProject} from '@/lib/kb/store';
import type {KbProject} from '@/lib/kb/model';
import {useAssistants} from '@/store/assistants';
import {libraryEvents} from '@/lib/books/library';
import {useKbProjects} from './use-kb';

const guessNumber = (u: Unit) => Number(u.number) || Number(u.title.match(/(?:урок|unidad|unit)\D{0,3}(\d{1,2})/i)?.[1]) || 0;

/** Which manual units belong to this book and which assistants bring its context. Nothing else receives it. */
export function ProjectSettings({project}: {project: KbProject}) {
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [name, setName] = useState(project.name);
  const assistants = useAssistants(s => s.assistants);
  const hydrate = useAssistants(s => s.hydrate);
  useEffect(() => { hydrate(); }, [hydrate]);
  useEffect(() => setName(project.name), [project.name]);
  useEffect(() => {
    const load = () => { listUnits().then(setUnits).catch(() => setUnits([])); };
    load();
    libraryEvents?.addEventListener('synced', load);
    return () => libraryEvents?.removeEventListener('synced', load);
  }, []);

  const save = (patch: Partial<KbProject>, done: string) => saveProject({...project, ...patch}).then(() => toast(done), () => toast('No se pudo guardar.'));
  // A unit belongs to one book at most, so its context is never mixed.
  const projects = useKbProjects();
  const owner = (unitId: string) => projects?.find(p => p.id !== project.id && unitId in p.units) || null;

  return (
    <div className="rc-kb-settings">
      <section className="rc-kb-block">
        <h3>Nombre</h3>
        <form className="rc-kb-inline" onSubmit={e => { e.preventDefault(); if (name.trim() && name.trim() !== project.name) void save({name: name.trim()}, 'Nombre guardado.'); }}>
          <label className="rc-field"><span className="sr-only">Nombre del libro</span><input className="rc-input" maxLength={200} value={name} onChange={e => setName(e.target.value)} /></label>
          <button type="submit" className="rc-btn rc-btn--secondary rc-btn--sm" disabled={!name.trim() || name.trim() === project.name}>Guardar</button>
        </form>
      </section>

      <section className="rc-kb-block">
        <h3>Unidades del manual de este libro</h3>
        <p className="rc-hint">Al abrir estas unidades en PDF Studio → Manual, el editor muestra el contexto del libro y el asistente lo usa. Las demás unidades y los otros proyectos no lo reciben.</p>
        {units === null ? <p className="rc-hint">Cargando…</p> : !units.length ? <p className="rc-hint">No hay unidades del manual en tu cuenta todavía.</p> : (
          <ul className="rc-kb-links">
            {units.map(u => {
              const linked = u.id in project.units;
              return (
                <li key={u.id}>
                  <label className="rc-kb-check">
                    <input type="checkbox" checked={linked} disabled={Boolean(owner(u.id))} onChange={e => {
                      const next = {...project.units};
                      if (e.target.checked) next[u.id] = guessNumber(u); else delete next[u.id];
                      void save({units: next}, e.target.checked ? '«' + u.title + '» usa el contexto del libro.' : '«' + u.title + '» ya no usa el contexto del libro.');
                    }} />
                    {u.title}{owner(u.id) ? <span className="rc-hint"> · es de «{owner(u.id)!.name}»</span> : null}
                  </label>
                  {linked ? (
                    <label className="rc-kb-unit-number"><span>Unidad n.º</span>
                      <input className="rc-input" type="number" min={0} max={99} value={project.units[u.id]} onChange={e => void save({units: {...project.units, [u.id]: Math.max(0, Math.min(99, Number(e.target.value) || 0))}}, 'Número de unidad guardado.')} />
                    </label>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rc-kb-block">
        <h3>Asistentes que traen este contexto</h3>
        <p className="rc-hint">Cuando elegís uno de estos asistentes a propósito (en el Chat o en PDF Studio), cada pregunta lleva los datos del libro que correspondan. El Chat sin asistente sigue neutro.</p>
        <ul className="rc-kb-links">
          {assistants.filter(a => a.scope !== 'cinema').map(a => (
            <li key={a.id}>
              <label className="rc-kb-check">
                <input type="checkbox" checked={project.assistants.includes(a.id)} onChange={e => {
                  const next = e.target.checked ? [...project.assistants, a.id] : project.assistants.filter(x => x !== a.id);
                  void save({assistants: next}, e.target.checked ? '«' + a.name + '» trae el contexto del libro.' : '«' + a.name + '» ya no trae el contexto del libro.');
                }} />
                {a.name}
              </label>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
