'use client';
import {useEffect, useState} from 'react';
import {toast} from 'sonner';
import {listUnits} from '@/lib/manual/store';
import type {Unit} from '@/lib/manual/model';
import {previewUndo, saveProject, undoImport} from '@/lib/kb/store';
import type {KbProject} from '@/lib/kb/model';
import type {UndoStep} from '@/lib/kb/versions';
import {ConfirmDialog} from '@/components/ui/dialog';
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
      <Imports project={project} />
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

const day = new Intl.DateTimeFormat('es-AR', {day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'});

/** The files imported into this book, each of which can be undone: what it added goes away, what it changed goes back. */
function Imports({project}: {project: KbProject}) {
  const [undo, setUndo] = useState<{files: string[]; steps: UndoStep[]} | null>(null);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const files = [...new Map(project.imports.map(i => [i.file, i])).values()];
  const times = (file: string) => project.imports.filter(i => i.file === file);
  // Several files are undone together, back to before the first of them: undoing them one by one could bring back
  // what an earlier one of them wrote.
  async function ask(chosen: string[]) {
    try { setUndo({files: chosen, steps: await previewUndo(project, chosen)}); } catch { toast('No se pudo leer el contexto de este navegador.'); }
  }
  async function run() {
    if (!undo) return;
    setBusy(true);
    try {
      const r = await undoImport(project, undo.files);
      toast('Importación deshecha: ' + r.restored + (r.restored === 1 ? ' dato volvió' : ' datos volvieron') + ' a como estaban y se ' + (r.removed === 1 ? 'quitó 1 dato' : 'quitaron ' + r.removed + ' datos') + ' que había agregado.' + (r.missing ? ' ' + r.missing + ' no se pudieron volver atrás: su versión anterior ya no está en el historial.' : ''), {duration: 10000});
      setUndo(null); setPicked([]);
    } catch { toast('No se pudo deshacer la importación.'); }
    finally { setBusy(false); }
  }
  const remove = undo?.steps.filter(s => s.action === 'remove') || [];
  const restore = undo?.steps.filter(s => s.action === 'restore') || [];
  const missing = undo?.steps.filter(s => s.action === 'missing') || [];
  const later = undo?.steps.filter(s => s.later > 0) || [];
  return (
    <section className="rc-kb-block">
      <h3>Archivos importados</h3>
      <p className="rc-hint">Si importaste archivos en el libro equivocado, elegilos y deshacelos juntos: lo que agregó se quita y lo que cambió vuelve a como estaba. Antes te muestra qué va a pasar.</p>
      {!files.length ? <p className="rc-hint">Todavía no se importó ningún archivo en este libro.</p> : (
        <ul className="rc-kb-links rc-kb-imports">
          {files.map(f => (
            <li key={f.file}>
              <label className="rc-kb-check"><input type="checkbox" checked={picked.includes(f.file)} onChange={e => setPicked(p => e.target.checked ? [...p, f.file] : p.filter(x => x !== f.file))} />
              <span><strong>{f.file}</strong><span className="rc-hint"> · {times(f.file).length === 1 ? day.format(new Date(f.at)) : times(f.file).length + ' veces, la última ' + day.format(new Date(times(f.file).at(-1)!.at))}</span></span></label>
            </li>
          ))}
        </ul>
      )}
      {files.length ? <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" disabled={!picked.length} onClick={() => void ask(picked)}>{picked.length > 1 ? 'Deshacer los ' + picked.length + ' archivos elegidos…' : 'Deshacer el archivo elegido…'}</button> : null}
      <ConfirmDialog open={Boolean(undo)} onClose={() => setUndo(null)} onConfirm={() => void run()} confirmLabel={busy ? 'Deshaciendo…' : 'Deshacer la importación'}
        title={undo && undo.files.length > 1 ? '¿Deshacer estos ' + undo.files.length + ' archivos?' : '¿Deshacer «' + (undo?.files[0] || '') + '»?'}
        description={undo && !undo.steps.length ? (undo.files.length > 1 ? 'Estos archivos ya no tienen' : 'Este archivo ya no tiene') + ' cambios en el libro: no hay nada que deshacer.' : 'Cada cambio queda en el historial de su dato, así que esto también se puede volver atrás desde ahí.'}>
        {undo && undo.steps.length ? (
          <div className="rc-kb-undo">
            {restore.length ? <><p><strong>Vuelven a como estaban ({restore.length}):</strong></p><p className="rc-hint">{restore.map(s => s.title).join(', ')}</p></> : null}
            {remove.length ? <><p><strong>Se quitan, porque los {undo.files.length > 1 ? 'agregaron estos archivos' : 'agregó este archivo'} ({remove.length}):</strong></p><p className="rc-hint">{remove.map(s => s.title).join(', ')}</p></> : null}
            {missing.length ? <p className="rc-kb-warning">Quedan como están, porque su versión anterior ya no está en el historial: {missing.map(s => s.title).join(', ')}.</p> : null}
            {later.length ? <p className="rc-kb-warning">Después de importarlo cambiaste o aprobaste {later.length === 1 ? 'este dato' : 'estos datos'}, y ese cambio también se deshace: {later.map(s => s.title).join(', ')}.</p> : null}
          </div>
        ) : null}
      </ConfirmDialog>
    </section>
  );
}
