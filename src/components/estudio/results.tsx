'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {FolderInput, Heart} from 'lucide-react';
import {toast} from 'sonner';
import {useCinema, type CinemaJob} from '@/store/cinema';
import {useCinemaUi} from '@/store/cinema-ui';
import {useStudioItems} from '@/store/cinema-projects';
import {JobCard} from '@/components/cinema/job-card';
import {Tip} from '@/components/ui/tooltip';
import {Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger} from '@/components/ui/menu';
import {useEstudioDraft} from './data';

/** The Estudio's two marks on a result: favorite, and the project it belongs to. */
function Marks({job}: {job: CinemaJob}) {
  const update = useCinema(s => s.updateJob);
  const projects = useStudioItems(s => s.items).filter(i => i.type === 'project');
  const fav = Boolean(job.favorite?.on);
  const current = job.studio?.project || null;
  return (
    <>
      <Tip label={fav ? 'Quitar de favoritos' : 'Agregar a favoritos'}>
        <button type="button" className="rc-icon-btn rc-icon-btn--sm rc-es-fav" aria-label={fav ? 'Quitar de favoritos' : 'Agregar a favoritos'} aria-pressed={fav} onClick={() => update(job.id, {favorite: {on: !fav, at: Date.now()}})}><Heart /></button>
      </Tip>
      <Menu>
        <Tip label="Mover a un proyecto">
          <MenuTrigger asChild><button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label="Mover a un proyecto"><FolderInput /></button></MenuTrigger>
        </Tip>
        <MenuContent align="end">
          <MenuLabel>Proyecto</MenuLabel>
          <MenuItem onSelect={() => update(job.id, {studio: {project: null, at: Date.now()}})}><span className="rc-menu-check" aria-hidden="true">{!current ? '✓' : ''}</span>Sin proyecto</MenuItem>
          {projects.length ? <MenuSeparator /> : null}
          {projects.map(p => <MenuItem key={p.id} onSelect={() => update(job.id, {studio: {project: p.id, at: Date.now()}})}><span className="rc-menu-check" aria-hidden="true">{current === p.id ? '✓' : ''}</span>{p.name}</MenuItem>)}
        </MenuContent>
      </Menu>
    </>
  );
}

type Kind = 'all' | 'image' | 'video';

/** In the Estudio a result becomes a reference of its own composer; editing still happens in Cinema's «Editar». */
function useEstudioUses() {
  const router = useRouter();
  return {
    addReference: (url: string) => {
      const d = useEstudioDraft.getState();
      if (!d.references.includes(url)) d.patch({references: [...d.references, url]});
      toast('Agregada a las referencias del Estudio.');
      document.getElementById('estudio-prompt')?.focus();
    },
    editImage: (url: string) => {
      useCinemaUi.getState().editImage(url);
      router.push('/workspace?studio=cinema&tab=edit');
    },
  };
}

/** Results as cards, with an «all · images · videos» filter. Cards keep their real state while Kie works. */
export function ResultGrid({jobs, onOpen, empty, filter = true}: {jobs: CinemaJob[]; onOpen: (job: CinemaJob) => void; empty: string; filter?: boolean}) {
  const [kind, setKind] = useState<Kind>('all');
  const uses = useEstudioUses();
  const shown = jobs.filter(j => kind === 'all' || (kind === 'video') === (j.mode === 'video'));
  return (
    <div className="rc-es-results">
      {filter && jobs.length ? (
        <div className="rc-es-filters" role="group" aria-label="Mostrar">
          {([['all', 'Todo'], ['image', 'Imágenes'], ['video', 'Videos']] as [Kind, string][]).map(([id, name]) => (
            <button key={id} type="button" className="rc-chip" aria-pressed={kind === id} onClick={() => setKind(id)}>{name}</button>
          ))}
        </div>
      ) : null}
      {shown.length ? (
        <div className="rc-job-grid rc-job-grid--large rc-es-jobs">
          {shown.map(j => <JobCard key={j.id} job={j} onOpen={onOpen} extra={<Marks job={j} />} uses={uses} />)}
        </div>
      ) : <p className="rc-es-none" role="status">{jobs.length ? 'Nada de ese tipo todavía.' : empty}</p>}
    </div>
  );
}
