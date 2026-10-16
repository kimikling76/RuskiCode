'use client';
import {useEffect, useState} from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {ArrowUpRight, ChevronRight, Trash2} from 'lucide-react';
import {StudioSidebar, NavTrigger, studios, type StudioView} from '@/components/studio/sidebar';
import {PersonalChatPanel} from '@/components/studio/personal-chat';
import {ChatDialogs} from '@/components/studio/chat-dialogs';
import {ConfirmDialog} from '@/components/ui/dialog';
import {Tip} from '@/components/ui/tooltip';
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
                    <Link href="/workspace/editor" className="rc-btn rc-btn--primary rc-page-action">Abrir el editor<ArrowUpRight /></Link>
                  ) : null}
                </article>
              ) : (
                <section className="rc-studio-page">
                  <h1 className="rc-page-title"><studio.icon className="rc-page-icon" aria-hidden="true" />{studio.name}</h1>
                  <p className="rc-page-lead">{view === 'pdf' ? 'Libros, documentos y materiales.' : 'Imagen y video.'}</p>
                  {projectId ? <p className="rc-form-error" role="alert">Ese proyecto no está en este navegador o ya se borró.</p> : null}

                  {own.length ? (
                    <ul className="rc-project-list" aria-label="Proyectos">
                      {own.map(p => (
                        <li key={p.id}>
                          <button type="button" className="rc-project-row" onClick={() => navigate(view, p.id)}>
                            <span className="rc-project-name">{p.name}</span>
                            <span className="rc-project-type">{typeNames[p.projectType] || p.projectType}</span>
                            <ChevronRight aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="rc-empty">
                      <p className="rc-empty-title">Todavía no hay proyectos.</p>
                      <p className="rc-hint">Se crean desde el Chat con «Convertir en proyecto».</p>
                    </div>
                  )}

                  {view === 'pdf' ? (
                    <Link href="/workspace/editor" className="rc-btn rc-btn--secondary rc-page-action">Abrir el editor de libros<ArrowUpRight /></Link>
                  ) : (
                    <p className="rc-hint rc-page-note">La generación de imagen y video llega en la próxima etapa, con Kie.</p>
                  )}

                  {previous.length ? (
                    <section className="rc-page-section">
                      <h2>Proyectos anteriores</h2>
                      <ul className="rc-project-list">
                        {previous.map(p => (
                          <li key={p.id}>
                            <button type="button" className="rc-project-row" onClick={() => { selectOld(p.id); setLegacy(true); }}>
                              <span className="rc-project-name">{p.brief}</span>
                              <span className="rc-project-type">Herramientas anteriores</span>
                              <ChevronRight aria-hidden="true" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                </section>
              )}
            </main>
          </>
        )}
      </div>

      <ChatDialogs onChat={() => navigate('chat')} />
      <ConfirmDialog
        open={removeProject}
        onClose={() => setRemoveProject(false)}
        onConfirm={() => { if (project && deleteProject(project.id)) { setRemoveProject(false); navigate(view); } }}
        title="¿Borrar este proyecto?"
        description="Se borran su brief y la copia de mensajes de este navegador. El chat original no se toca."
        confirmLabel="Borrar proyecto"
        tone="danger"
      />
    </div>
  );
}
