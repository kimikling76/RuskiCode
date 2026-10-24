'use client';
import {useEffect, useState} from 'react';
import {Clapperboard, Folder, FolderPlus, Lock, MoreHorizontal, Plus} from 'lucide-react';
import {useCinema, type CinemaJob} from '@/store/cinema';
import {useStudioItems, type StudioItem} from '@/store/cinema-projects';
import {savedUrl} from '@/lib/cinema/keep';
import {KieImage} from '@/components/cinema/job-card';
import {ConfirmDialog, Dialog} from '@/components/ui/dialog';
import {Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger} from '@/components/ui/menu';
import {jobPicture} from './data';
import type {View} from './sidebar';

/** The jobs of a project (or of the projects of a folder), newest first. */
export function jobsOf(jobs: CinemaJob[], items: StudioItem[], item: StudioItem) {
  const ids = item.type === 'folder' ? items.filter(i => i.type === 'project' && i.folder === item.id).map(i => i.id) : [item.id];
  return jobs.filter(j => j.studio?.project && ids.includes(j.studio.project));
}

function Thumb({job}: {job?: CinemaJob}) {
  const url = job ? jobPicture(job) : null;
  if (!job || !url) return <span className="rc-es-collage-cell" data-empty="true" />;
  return <span className="rc-es-collage-cell">{job.mode === 'video' ? <video src={url} muted playsInline preload="metadata" /> : <KieImage src={url} alt="" fallback={savedUrl(job)} />}</span>;
}

/** Create, rename, move and delete projects and folders: the dialogs, shared by the sidebar and the grids. */
export function useProjectDialogs(go: (v: View) => void) {
  const create = useStudioItems(s => s.create);
  const update = useStudioItems(s => s.update);
  const remove = useStudioItems(s => s.remove);
  const items = useStudioItems(s => s.items);
  const [naming, setNaming] = useState<{type: 'project' | 'folder'; item?: StudioItem; folder?: string} | null>(null);
  const [name, setName] = useState('');
  const [moving, setMoving] = useState<StudioItem | null>(null);
  const [removing, setRemoving] = useState<StudioItem | null>(null);
  useEffect(() => { setName(naming?.item?.name || ''); }, [naming]);
  const folders = items.filter(i => i.type === 'folder');

  function save() {
    if (!naming) return;
    if (naming.item) update(naming.item.id, {name});
    else {
      const made = create(naming.type, name, naming.folder ? {folder: naming.folder} : {});
      go({v: naming.type, id: made.id});
    }
    setNaming(null);
  }

  const dialogs = (
    <>
      <Dialog open={Boolean(naming)} onClose={() => setNaming(null)} title={naming?.item ? 'Renombrar' : naming?.type === 'folder' ? 'Nueva carpeta' : 'Nuevo proyecto'} description={naming?.item ? undefined : naming?.type === 'folder' ? 'Agrupa proyectos.' : 'Agrupa las imágenes y videos de una misma historia.'}>
        <form className="rc-dialog-body" onSubmit={e => { e.preventDefault(); save(); }}>
          <label className="rc-field"><span>Nombre</span><input className="rc-input" autoFocus maxLength={120} value={name} onChange={e => setName(e.target.value)} placeholder={naming?.type === 'folder' ? 'Carpeta nueva' : 'Proyecto sin título'} /></label>
          <div className="rc-dialog-footer rc-dialog-footer--end">
            <button type="button" className="rc-btn rc-btn--ghost" onClick={() => setNaming(null)}>Cancelar</button>
            <button type="submit" className="rc-btn rc-btn--primary">{naming?.item ? 'Guardar' : 'Crear'}</button>
          </div>
        </form>
      </Dialog>
      <Dialog open={Boolean(moving)} onClose={() => setMoving(null)} title={'Mover «' + (moving?.name || '') + '»'}>
        <div className="rc-dialog-body">
          <div className="rc-es-move" role="group" aria-label="Carpetas">
            <button type="button" className="rc-es-move-option" aria-pressed={!moving?.folder} onClick={() => { if (moving) update(moving.id, {folder: undefined}); setMoving(null); }}><Clapperboard aria-hidden="true" />Sin carpeta</button>
            {folders.map(f => <button key={f.id} type="button" className="rc-es-move-option" aria-pressed={moving?.folder === f.id} onClick={() => { if (moving) update(moving.id, {folder: f.id}); setMoving(null); }}><Folder aria-hidden="true" />{f.name}</button>)}
          </div>
          {!folders.length ? <p className="rc-hint">Todavía no hay carpetas: creá una con «Nueva carpeta».</p> : null}
        </div>
      </Dialog>
      <ConfirmDialog
        open={Boolean(removing)} onClose={() => setRemoving(null)} tone="danger" confirmLabel="Borrar"
        title={'¿Borrar «' + (removing?.name || '') + '»?'}
        description={removing?.type === 'folder' ? 'Se borra la carpeta. Sus proyectos quedan, sin carpeta.' : 'Se borra el proyecto. Sus imágenes y videos quedan en «Mis generaciones».'}
        onConfirm={() => { const r = removing; setRemoving(null); if (r) { remove(r.id); go({v: 'home'}); } }}
      />
    </>
  );
  return {
    dialogs,
    newItem: (type: 'project' | 'folder', folder?: string) => setNaming({type, folder}),
    rename: (item: StudioItem) => setNaming({type: item.type === 'folder' ? 'folder' : 'project', item}),
    move: setMoving,
    remove: setRemoving,
  };
}

export type ProjectActions = ReturnType<typeof useProjectDialogs>;

/** A grid of projects and folders: «Crear proyecto» (or «Crear carpeta») first, then each one with a collage of its latest results. */
export function ProjectGrid({items: shown, go, actions, folder, make = 'project'}: {items: StudioItem[]; go: (v: View) => void; actions: ProjectActions; folder?: string; make?: 'project' | 'folder'}) {
  const jobs = useCinema(s => s.data.jobs);
  const items = useStudioItems(s => s.items);
  return (
    <ul className="rc-es-grid" aria-label="Proyectos">
      <li className="rc-es-card rc-es-card--new">
        <button type="button" className="rc-es-card-open" onClick={() => actions.newItem(make, make === 'project' ? folder : undefined)}>
          <span className="rc-es-collage rc-es-collage--new"><span className="rc-es-new-circle" aria-hidden="true">{make === 'project' ? <Plus /> : <FolderPlus />}</span></span>
          <span className="rc-es-card-text"><strong>{make === 'project' ? 'Crear proyecto nuevo' : 'Crear carpeta nueva'}</strong></span>
        </button>
      </li>
      {shown.map(item => {
        const own = jobsOf(jobs, items, item).filter(jobPicture);
        const count = item.type === 'folder' ? items.filter(i => i.type === 'project' && i.folder === item.id).length : jobsOf(jobs, items, item).length;
        return (
          <li key={item.id} className="rc-es-card">
            <button type="button" className="rc-es-card-open" onClick={() => go({v: item.type === 'folder' ? 'folder' : 'project', id: item.id})}>
              <span className="rc-es-collage" aria-hidden="true">
                <Thumb job={own[0]} />
                <span className="rc-es-collage-side"><Thumb job={own[1]} /><Thumb job={own[2]} /></span>
                {item.type === 'folder' ? <span className="rc-es-collage-badge"><Folder /></span> : null}
              </span>
              <span className="rc-es-card-text">
                <span className="rc-es-card-row"><strong>{item.name}</strong><span className="rc-es-private"><Lock aria-hidden="true" />Privado</span></span>
                <span className="rc-es-card-count">{item.type === 'folder' ? count + (count === 1 ? ' proyecto' : ' proyectos') : count + (count === 1 ? ' resultado' : ' resultados')}</span>
              </span>
            </button>
            <Menu>
              <MenuTrigger asChild><button type="button" className="rc-icon-btn rc-es-card-more" aria-label={'Más opciones de «' + item.name + '»'}><MoreHorizontal /></button></MenuTrigger>
              <MenuContent align="end">
                <MenuItem onSelect={() => actions.rename(item)}>Renombrar</MenuItem>
                {item.type === 'project' ? <MenuItem onSelect={() => actions.move(item)}>Mover a una carpeta…</MenuItem> : null}
                <MenuSeparator />
                <MenuItem danger onSelect={() => actions.remove(item)}>Borrar</MenuItem>
              </MenuContent>
            </Menu>
          </li>
        );
      })}
    </ul>
  );
}
