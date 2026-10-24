'use client';
import {useCallback, useEffect, useMemo, useState} from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import {ChevronRight, MoreHorizontal, PanelLeftOpen} from 'lucide-react';
import {useCinema, type CinemaJob} from '@/store/cinema';
import {useCinemaUi} from '@/store/cinema-ui';
import {useStudioItems, type StudioItem} from '@/store/cinema-projects';
import {NavTrigger} from '@/components/studio/sidebar';
import {ImageViewer} from '@/components/cinema/image-viewer';
import {Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger} from '@/components/ui/menu';
import {EstudioSidebar, type View} from './sidebar';
import {EstudioHero} from './hero';
import {EstudioComposer} from './composer';
import {ProjectGrid, jobsOf, useProjectDialogs, type ProjectActions} from './projects';
import {ResultGrid} from './results';
import {ElementsView} from './elements';

const views: View['v'][] = ['home', 'gen', 'el', 'fav', 'all', 'project', 'folder'];
const COLLAPSED = 'rc-estudio-collapsed';

function readView(): View {
  const p = new URLSearchParams(window.location.search);
  const v = p.get('v') as View['v'] | null;
  return v && views.includes(v) ? {v, ...(p.get('id') ? {id: p.get('id')!} : {})} : {v: 'home'};
}

/** Its own URL for each page of the Estudio, so the browser's back button and a shared link work. */
function useView() {
  const [view, setView] = useState<View>({v: 'home'});
  useEffect(() => {
    setView(readView());
    const back = () => setView(readView());
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);
  const go = useCallback((next: View) => {
    const url = new URL(window.location.href);
    url.search = '';
    if (next.v !== 'home') url.searchParams.set('v', next.v);
    if (next.id) url.searchParams.set('id', next.id);
    window.history.pushState(null, '', url);
    setView(next);
    document.getElementById('estudio-main')?.scrollTo({top: 0});
  }, []);
  return [view, go] as const;
}

function ItemMenu({item, actions}: {item: StudioItem; actions: ProjectActions}) {
  return (
    <Menu>
      <MenuTrigger asChild><button type="button" className="rc-icon-btn" aria-label={'Más opciones de «' + item.name + '»'}><MoreHorizontal /></button></MenuTrigger>
      <MenuContent align="end">
        <MenuItem onSelect={() => actions.rename(item)}>Renombrar</MenuItem>
        {item.type === 'project' ? <MenuItem onSelect={() => actions.move(item)}>Mover a una carpeta…</MenuItem> : null}
        <MenuSeparator />
        <MenuItem danger onSelect={() => actions.remove(item)}>Borrar</MenuItem>
      </MenuContent>
    </Menu>
  );
}

function Missing({go}: {go: (v: View) => void}) {
  return (
    <div className="rc-es-page">
      <h1 className="rc-es-h1">No se encontró</h1>
      <p className="rc-es-none">Este proyecto o carpeta ya no existe en tu cuenta.</p>
      <button type="button" className="rc-btn rc-btn--secondary" onClick={() => go({v: 'home'})}>Volver al inicio</button>
    </div>
  );
}

/** Cinema Studio's Estudio: one place to write a scene, call the cast with «@» and keep the results by project. */
export function Estudio() {
  const [view, go] = useView();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [viewing, setViewing] = useState<CinemaJob | null>(null);
  const jobs = useCinema(s => s.data.jobs);
  const storageError = useCinema(s => s.error);
  const items = useStudioItems(s => s.items);
  const hydrated = useStudioItems(s => s.hydrated);
  const actions = useProjectDialogs(go);

  useEffect(() => {
    useStudioItems.getState().hydrate();
    useCinemaUi.getState().restoreAskFirst();
    try { setCollapsed(localStorage.getItem(COLLAPSED) === '1'); } catch {}
  }, []);
  // The drawer only exists on a phone: it closes when the window grows.
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 768px)');
    const close = () => { if (wide.matches) setDrawer(false); };
    wide.addEventListener('change', close);
    return () => wide.removeEventListener('change', close);
  }, []);
  const collapse = () => setCollapsed(c => { try { localStorage.setItem(COLLAPSED, c ? '0' : '1'); } catch {} return !c; });

  const projects = useMemo(() => items.filter(i => i.type === 'project').sort((a, b) => b.updatedAt - a.updatedAt), [items]);
  const folders = useMemo(() => items.filter(i => i.type === 'folder').sort((a, b) => b.updatedAt - a.updatedAt), [items]);
  const item = view.id ? items.find(i => i.id === view.id && i.type === view.v) : undefined;

  const side = (drawerMode: boolean) => (
    <EstudioSidebar view={view} go={go} collapsed={drawerMode ? false : collapsed} onCollapse={drawerMode ? () => setDrawer(false) : collapse} onNew={type => { setDrawer(false); actions.newItem(type); }} onClose={drawerMode ? () => setDrawer(false) : undefined} />
  );

  let page: React.ReactNode;
  if (view.v === 'home') {
    page = (
      <div className="rc-es-page rc-es-page--home">
        <EstudioHero onOpen={setViewing} />
        <h1 className="rc-es-title">Dale vida a tus historias</h1>
        <EstudioComposer />
        {jobs.length ? (
          <section className="rc-es-section rc-es-latest" aria-labelledby="es-latest">
            <div className="rc-es-section-row">
              <h2 id="es-latest">Lo último</h2>
              <button type="button" className="rc-es-more" onClick={() => go({v: 'gen'})}>Mis generaciones<ChevronRight aria-hidden="true" /></button>
            </div>
            <ResultGrid jobs={jobs.slice(0, 4)} onOpen={setViewing} empty="" filter={false} />
          </section>
        ) : null}
        <section className="rc-es-section" aria-labelledby="es-mine">
          <div className="rc-es-section-row">
            <h2 id="es-mine"><button type="button" className="rc-es-more rc-es-more--title" onClick={() => go({v: 'all'})}>Mis proyectos<ChevronRight aria-hidden="true" /></button></h2>
          </div>
          <ProjectGrid items={[...folders.slice(0, 2), ...projects.filter(p => !p.folder).slice(0, 6)]} go={go} actions={actions} />
        </section>
      </div>
    );
  } else if (view.v === 'gen' || view.v === 'fav') {
    const fav = view.v === 'fav';
    page = (
      <div className="rc-es-page">
        <h1 className="rc-es-h1">{fav ? 'Mis favoritos' : 'Mis generaciones'}</h1>
        <p className="rc-es-lead">{fav ? 'Lo que marcaste con el corazón.' : 'Todo lo que generaste en Cinema Studio, en el Estudio y en las pestañas.'}</p>
        <ResultGrid jobs={fav ? jobs.filter(j => j.favorite?.on) : jobs} onOpen={setViewing} empty={fav ? 'Todavía no marcaste nada. Tocá el corazón de una imagen o un video.' : 'Todavía no hay nada. Escribí una escena en Inicio.'} />
      </div>
    );
  } else if (view.v === 'el') {
    page = (
      <div className="rc-es-page">
        <h1 className="rc-es-h1">Mis elementos</h1>
        <p className="rc-es-lead">Personajes y lugares que llamás con @ en el prompt.</p>
        <ElementsView />
      </div>
    );
  } else if (view.v === 'all') {
    page = (
      <div className="rc-es-page">
        <h1 className="rc-es-h1">Todos los proyectos</h1>
        <section className="rc-es-section rc-es-section--first" aria-labelledby="es-projects">
          <div className="rc-es-section-row"><h2 id="es-projects">Proyectos</h2></div>
          <ProjectGrid items={projects} go={go} actions={actions} />
        </section>
        <section className="rc-es-section" aria-labelledby="es-folders">
          <div className="rc-es-section-row"><h2 id="es-folders">Carpetas</h2></div>
          <ProjectGrid items={folders} go={go} actions={actions} make="folder" />
        </section>
      </div>
    );
  } else if (!item) {
    page = hydrated ? <Missing go={go} /> : null;
  } else if (item.type === 'project') {
    const folder = item.folder ? folders.find(f => f.id === item.folder) : undefined;
    page = (
      <div className="rc-es-page">
        <nav className="rc-es-crumbs" aria-label="Dónde estás">
          <button type="button" onClick={() => go({v: 'all'})}>Proyectos</button>
          {folder ? <><ChevronRight aria-hidden="true" /><button type="button" onClick={() => go({v: 'folder', id: folder.id})}>{folder.name}</button></> : null}
        </nav>
        <div className="rc-es-head">
          <h1 className="rc-es-h1">{item.name}</h1>
          <ItemMenu item={item} actions={actions} />
        </div>
        <EstudioComposer project={item.id} />
        <section className="rc-es-section" aria-labelledby="es-project-results">
          <div className="rc-es-section-row"><h2 id="es-project-results">Resultados</h2></div>
          <ResultGrid jobs={jobsOf(jobs, items, item)} onOpen={setViewing} empty="Este proyecto todavía no tiene resultados. Lo que generes acá queda guardado en él." />
        </section>
      </div>
    );
  } else {
    page = (
      <div className="rc-es-page">
        <nav className="rc-es-crumbs" aria-label="Dónde estás"><button type="button" onClick={() => go({v: 'all'})}>Proyectos</button></nav>
        <div className="rc-es-head">
          <h1 className="rc-es-h1">{item.name}</h1>
          <ItemMenu item={item} actions={actions} />
        </div>
        <ProjectGrid items={projects.filter(p => p.folder === item.id)} go={go} actions={actions} folder={item.id} />
      </div>
    );
  }

  return (
    <div className="rc-es" data-collapsed={collapsed ? 'true' : undefined}>
      {side(false)}
      <RadixDialog.Root open={drawer} onOpenChange={setDrawer}>
        <RadixDialog.Portal>
          <RadixDialog.Overlay className="rc-overlay rc-layer rc-drawer-overlay" />
          <RadixDialog.Content className="rc-drawer rc-layer rc-es-drawer" aria-describedby={undefined}>
            <RadixDialog.Title className="sr-only">Menú del Estudio</RadixDialog.Title>
            {side(true)}
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>
      <div className="rc-es-main" id="estudio-main">
        <header className="rc-es-topbar">
          <NavTrigger />
          <button type="button" className="rc-es-open-side" onClick={() => setDrawer(true)}><PanelLeftOpen aria-hidden="true" />Estudio</button>
        </header>
        {storageError ? <p className="rc-cinema-warning" role="alert">{storageError}</p> : null}
        {page}
      </div>
      <ImageViewer job={viewing} onClose={() => setViewing(null)} />
      {actions.dialogs}
    </div>
  );
}
