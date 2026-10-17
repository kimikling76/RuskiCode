'use client';
import {useEffect, useState} from 'react';
import {useRouter} from 'next/navigation';
import dynamic from 'next/dynamic';
import {ChevronRight, Trash2} from 'lucide-react';
import {StudioSidebar, NavTrigger, studios, type StudioView} from '@/components/studio/sidebar';
import {PersonalChatPanel} from '@/components/studio/personal-chat';
import {ChatDialogs} from '@/components/studio/chat-dialogs';
import {ConfirmDialog} from '@/components/ui/dialog';
import {Tip} from '@/components/ui/tooltip';
import {CinemaStudio} from '@/components/cinema/cinema-studio';
import {PdfHome, NewBookDialog} from '@/components/pdf/pdf-home';
import {editorHref} from '@/lib/books/library';
import {CinemaJobRunner} from '@/components/cinema/job-runner';
import {usePersonal, type StudioProject} from '@/store/personal-chat';
import {useProjects} from '@/store/projects';

const ProjectWorkspace = dynamic(() => import('@/components/project-workspace').then(m => m.ProjectWorkspace), {
  loading: () => <Loading label="Abriendo las herramientas…" />,
});

const typeNames: Record<string, string> = {libro: 'Libro', documento: 'Documento', presentacion: 'Presentación', imagen: 'Imagen', video: 'Video'};

function Loading({label}: {label: string}) {
  return (
    <div className="rc-loading" role="status">
      <span className="rc-skeleton" /><span className="rc-skeleton" /><span className="rc-skeleton" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function Workspace() {
  const [view, setView] = useState<StudioView>('chat');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [legacy, setLegacy] = useState(false);
  const [removeProject, setRemoveProject] = useState(false);
  const [bookFrom, setBookFrom] = useState<{id: string; name: string; brief: string} | null>(null);
  const router = useRouter();
  const data = usePersonal(s => s.data);
  const hydrate = usePersonal(s => s.hydrate);
  const hydrated = usePersonal(s => s.hydrated);
  const selectChat = usePersonal(s => s.select);
  const deleteProject = usePersonal(s => s.removeProject);
  const oldProjects = useProjects(s => s.projects);
  const hydrateOld = useProjects(s => s.hydrate);
  const selectOld = useProjects(s => s.select);

  useEffect(() => { hydrate(); hydrateOld(); }, [hydrate, hydrateOld]);
  useEffect(() => {
    function restore() {
      const q = new URLSearchParams(window.location.search);
      const target = q.get('studio');
      setView(target === 'pdf' || target === 'cinema' ? target : 'chat');
      setProjectId(q.get('project'));
      setLegacy(false);
    }
    restore();
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);

  function navigate(next: StudioView, id: string | null = null) {
    setView(next); setProjectId(id); setLegacy(false);
    const url = new URL(window.location.href);
    url.searchParams.set('studio', next);
    if (id) url.searchParams.set('project', id); else url.searchParams.delete('project');
    window.history.pushState(null, '', url);
  }

  function newChat() {
    selectChat(null);
    setNonce(n => n + 1);
    navigate('chat');
  }

  const studio = studios.find(s => s.id === view)!;
  const project = data.projects.find(p => p.id === projectId && p.destination === view);
  const own = data.projects.filter(p => p.destination === view);
  const previous = oldProjects.filter(p => view === 'pdf' ? [0, 3].includes(p.category) : [1, 2].includes(p.category));

  return (
    <div className="rc-app" data-studio={view}>
      <a href="#studio-main" className="rc-skip-link">Saltar al contenido</a>
      <StudioSidebar view={view} onNavigate={v => navigate(v)} onNew={newChat} />
      <div className="rc-main">
        {view === 'chat' ? (
          <main id="studio-main" className="rc-main-body" tabIndex={-1}>
            <PersonalChatPanel key={nonce} onCreated={(p: StudioProject) => navigate(p.destination, p.id)} />
          </main>
        ) : view === 'cinema' && hydrated && !project && !legacy ? (
          <main id="studio-main" className="rc-main-body" tabIndex={-1}>
            <CinemaStudio
              projects={own.map(p => ({id: p.id, name: p.name, brief: p.brief}))}
              legacy={previous.map(p => ({id: p.id, brief: p.brief}))}
              onOpenLegacy={id => { selectOld(id); setLegacy(true); }}
            />
          </main>
        ) : (
          <>
            <header className={'rc-topbar' + (project || legacy ? '' : ' rc-topbar--mobile-only')}>
              <NavTrigger />
              {project || legacy ? (
                <div className="rc-studio-identity">
                  <studio.icon aria-hidden="true" />
                  <button type="button" className="rc-crumb" onClick={() => navigate(view)}>{studio.name}</button>
                  <ChevronRight className="rc-crumb-sep" aria-hidden="true" />
                  <span className="rc-crumb-current">{project ? project.name : 'Herramientas anteriores'}</span>
                </div>
              ) : null}
              <div className="rc-topbar-actions">
                {project ? (
                  <Tip label="Borrar proyecto">
                    <button type="button" className="rc-icon-btn" aria-label="Borrar proyecto" onClick={() => setRemoveProject(true)}><Trash2 /></button>
                  </Tip>
                ) : null}
              </div>
            </header>
            <main id="studio-main" className="rc-main-body rc-main-scroll" tabIndex={-1}>
              {!hydrated ? <Loading label="Cargando proyectos…" /> : legacy ? (
                <div className="rc-legacy">
                  <ProjectWorkspace />
                </div>
              ) : project ? (
                <article className="rc-studio-page">
                  <p className="rc-eyebrow">{typeNames[project.projectType] || project.projectType}</p>
                  <h1 className="rc-page-title">{project.name}</h1>
                  <section className="rc-page-section">
                    <h2>Brief</h2>
                    <p className="rc-prose">{project.brief}</p>
                  </section>
                  <section className="rc-page-section">
                    <h2>{project.source.summary ? 'Resumen traído del chat' : 'Mensajes traídos del chat'}</h2>
                    {project.source.summary ? <p className="rc-prose">{project.source.summary}</p> : (
                      <ol className="rc-source-list">
                        {project.source.messages?.map(m => (
                          <li key={m.id}>
                            <span>{m.role === 'user' ? 'Vos' : 'Respuesta'}</span>
                            <p className="rc-prose">{m.content}</p>
                          </li>
                        ))}
                      </ol>
                    )}
                  </section>
                  <p className="rc-hint">Es una copia independiente: borrar el chat no borra este proyecto.</p>
                  {view === 'pdf' ? (
                    <button type="button" className="rc-btn rc-btn--primary rc-page-action" onClick={() => setBookFrom({id: project.id, name: project.name, brief: project.brief})}>Crear un libro con este brief</button>
                  ) : null}
                </article>
              ) : (
                <>
                  {projectId ? <p className="rc-form-error rc-pdf-home-error" role="alert">Ese proyecto no está en este navegador o ya se borró.</p> : null}
                  <PdfHome
                    projects={own.map(p => ({id: p.id, name: p.name, brief: p.brief}))}
                    legacy={previous.map(p => ({id: p.id, brief: p.brief}))}
                    onOpenProject={id => navigate(view, id)}
                    onOpenLegacy={id => { selectOld(id); setLegacy(true); }}
                  />
                </>
              )}
            </main>
          </>
        )}
      </div>

      <ChatDialogs onChat={() => navigate('chat')} />
      <NewBookDialog open={Boolean(bookFrom)} from={bookFrom || undefined} onClose={() => setBookFrom(null)} onCreate={id => router.push(editorHref({kind: 'local', id}))} />
      <CinemaJobRunner />
      <ConfirmDialog
        open={removeProject}
        onClose={() => setRemoveProject(false)}
        onConfirm={() => { if (project && deleteProject(project.id)) { setRemoveProject(false); navigate(view); } }}
        title="¿Borrar este proyecto?"
        description="Se borran su brief y la copia de mensajes, también en tus otras computadoras. El chat original no se toca."
        confirmLabel="Borrar proyecto"
        tone="danger"
      />
    </div>
  );
}
