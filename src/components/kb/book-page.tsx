'use client';
import {useEffect, useMemo, useState} from 'react';
import {useRouter, useSearchParams} from 'next/navigation';
import {toast} from 'sonner';
import {ArrowLeft, BookMarked, Download, Plus, Search} from 'lucide-react';
import {NavTrigger} from '@/components/studio/sidebar';
import {Dialog} from '@/components/ui/dialog';
import {addEntry, createProject} from '@/lib/kb/store';
import {emptyData, KB_FORMAT, kbKinds, kbStatuses, kindName, statusName, type KbEntry, type KbKind, type KbProject, type KbStatus} from '@/lib/kb/model';
import {slug} from '@/lib/kb/import';
import {defaultAliases, fold} from '@/lib/kb/names';
import {useKbEntries, useKbProjects} from './use-kb';
import {ImportButton} from './import-dialog';
import {EntryDetail, StatusBadge, type Names} from './entry-detail';
import {KnownPanel} from './known-panel';
import {ProjectSettings} from './project-settings';

type Tab = 'data' | 'known' | 'settings';
const prefix: Record<KbKind, string> = {identity: 'identity', character: 'char', story: 'story', unit: 'unit', page: 'page', rule: 'rule', decision: 'decision', note: 'note'};
const order: KbKind[] = ['decision', 'identity', 'character', 'story', 'unit', 'page', 'rule', 'note'];

const searchText = (e: KbEntry) => fold([e.title, e.body, e.kind === 'character' ? e.data.aliases.join(' ') : '', e.kind === 'page' ? e.data.text : '', e.kind === 'decision' ? e.data.question : ''].join(' '));
const rank = (e: KbEntry, q: string) => { const t = fold(e.title); return t === q ? 0 : t.startsWith(q) ? 1 : t.includes(q) ? 2 : 3; };
const sortKey = (e: KbEntry) => e.kind === 'page' ? e.data.number : e.kind === 'unit' ? e.data.number : 0;

/** PDF Studio → Libro: the knowledge base of a book project, its import, review, versions and what the student knows. */
export function BookKnowledgePage() {
  const router = useRouter();
  const params = useSearchParams();
  const projects = useKbProjects();
  const project = projects?.find(p => p.id === params.get('p')) || projects?.[0] || null;
  const entries = useKbEntries(project?.id || null);
  const [tab, setTab] = useState<Tab>('data');
  const [kind, setKind] = useState<KbKind | 'all'>('all');
  const [status, setStatus] = useState<KbStatus | 'all'>('all');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const selectedId = params.get('e');

  const go = (patch: {p?: string; e?: string | null}) => {
    const next = new URLSearchParams(params.toString());
    if (patch.p) next.set('p', patch.p);
    if (patch.e === null) next.delete('e'); else if (patch.e) next.set('e', patch.e);
    router.replace('/workspace/libro?' + next.toString(), {scroll: false});
  };

  const names: Names = useMemo(() => new Map((entries || []).flatMap(e => e.kind === 'character' ? [[e.id.replace(/^char\./, ''), e.title] as [string, string]] : [])), [entries]);
  const filtered = useMemo(() => {
    const q = fold(query.trim());
    return (entries || [])
      .filter(e => (kind === 'all' || e.kind === kind) && (status === 'all' || e.status === status) && (!q || searchText(e).includes(q)))
      // What the search names comes first: the entry with that exact title, then titles that start or contain it.
      .sort((a, b) => (q ? rank(a, q) - rank(b, q) : 0) || order.indexOf(a.kind) - order.indexOf(b.kind) || sortKey(a) - sortKey(b) || a.title.localeCompare(b.title));
  }, [entries, kind, status, query]);
  const selected = entries?.find(e => e.id === selectedId) || null;
  const counts = useMemo(() => kbStatuses.map(s => [s, (entries || []).filter(e => e.status === s).length] as const), [entries]);
  const pendingDecisions = (entries || []).filter(e => e.kind === 'decision' && e.status === 'pending').length;
  const noApprovedPicture = (entries || []).filter(e => e.kind === 'character' && !e.data.missing && !e.data.mainRef).length;

  function exportBase() {
    if (!project || !entries) return;
    const body = {format: KB_FORMAT, project: project.name, exported: new Date().toISOString().slice(0, 10), entries: entries.map(e => ({id: e.id, kind: e.kind, title: e.title, body: e.body, status: e.status, data: e.data, sources: e.sources, tags: e.tags}))};
    const url = URL.createObjectURL(new Blob([JSON.stringify(body, null, 1)], {type: 'application/json'}));
    const a = document.createElement('a');
    a.href = url; a.download = 'contexto-' + slug(project.name) + '.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return (
    <div className="rc-settings">
      <header className="rc-topbar rc-topbar--mobile-only">
        <NavTrigger />
        <div className="rc-studio-identity"><BookMarked aria-hidden="true" />Contexto del libro</div>
      </header>
      <div className="rc-main-scroll rc-settings-scroll">
        <div className="rc-settings-page rc-kb">
          <div className="rc-kb-head">
            <div>
              <h1 className="rc-page-title rc-settings-title">Contexto del libro</h1>
              <p className="rc-page-lead">Canon, unidades, reglas y decisiones de un libro, con su fuente y su estado. Se guarda en tu cuenta. Solo lo usan las unidades de este libro y los asistentes que elijas; el Chat normal sigue neutro.</p>
            </div>
          </div>

          {projects === null ? <div className="rc-history-loading" role="status" aria-label="Cargando"><span className="rc-skeleton" /></div>
            : !project ? <NewProject onCreated={p => go({p: p.id})} />
            : (
              <>
                <div className="rc-kb-bar">
                  {projects.length > 1 ? (
                    <label className="rc-kb-project"><span className="sr-only">Libro</span>
                      <select className="rc-input" value={project.id} onChange={e => go({p: e.target.value, e: null})}>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                    </label>
                  ) : <strong className="rc-kb-project-name">{project.name}</strong>}
                  <ImportButton project={project} />
                  <button type="button" className="rc-btn rc-btn--ghost" onClick={() => setAdding(true)}><Plus aria-hidden="true" />Agregar dato</button>
                  <button type="button" className="rc-btn rc-btn--ghost" disabled={!entries?.length} onClick={exportBase}><Download aria-hidden="true" />Exportar</button>
                </div>

                <p className="rc-kb-counts">
                  {counts.map(([s, n]) => <button key={s} type="button" className="rc-chip" aria-pressed={status === s} onClick={() => { setTab('data'); setStatus(status === s ? 'all' : s); }}><StatusBadge status={s} /> {n}</button>)}
                </p>
                {pendingDecisions || noApprovedPicture ? (
                  <p className="rc-hint">
                    {pendingDecisions ? <button type="button" className="rc-kb-link" onClick={() => { setTab('data'); setKind('decision'); setStatus('pending'); }}>{pendingDecisions} {pendingDecisions === 1 ? 'decisión pendiente' : 'decisiones pendientes'}</button> : null}
                    {pendingDecisions && noApprovedPicture ? ' · ' : null}
                    {noApprovedPicture ? <button type="button" className="rc-kb-link" onClick={() => { setTab('data'); setKind('character'); setStatus('all'); }}>{noApprovedPicture} {noApprovedPicture === 1 ? 'personaje sin referencia principal' : 'personajes sin referencia principal'}</button> : null}
                  </p>
                ) : null}

                <div className="rc-kb-tabs" role="tablist" aria-label="Secciones">
                  {([['data', 'Datos'], ['known', '¿Qué sabe el alumno?'], ['settings', 'Unidades y asistentes']] as [Tab, string][]).map(([t, label]) => (
                    <button key={t} type="button" role="tab" id={'kb-tab-' + t} aria-controls={'kb-panel-' + t} aria-selected={tab === t} className="rc-kb-tab" onClick={() => setTab(t)}>{label}</button>
                  ))}
                </div>

                {tab === 'data' ? (
                  <div role="tabpanel" id="kb-panel-data" aria-labelledby="kb-tab-data" className="rc-kb-grid" data-open={selected ? '' : undefined}>
                    <div className="rc-kb-list-col">
                      <div className="rc-kb-filters">
                        <label className="rc-kb-search"><Search aria-hidden="true" /><span className="sr-only">Buscar en el contexto</span>
                          <input className="rc-input" type="search" placeholder="Buscar (nombre, palabra, regla…)" value={query} onChange={e => setQuery(e.target.value)} />
                        </label>
                        <label><span className="sr-only">Tipo</span>
                          <select className="rc-input" value={kind} onChange={e => setKind(e.target.value as KbKind | 'all')}>
                            <option value="all">Todo</option>{order.map(k => <option key={k} value={k}>{kindName[k]}</option>)}
                          </select>
                        </label>
                        <label><span className="sr-only">Estado</span>
                          <select className="rc-input" value={status} onChange={e => setStatus(e.target.value as KbStatus | 'all')}>
                            <option value="all">Cualquier estado</option>{kbStatuses.map(s => <option key={s} value={s}>{statusName[s]}</option>)}
                          </select>
                        </label>
                      </div>
                      {entries === null ? <div className="rc-history-loading" role="status" aria-label="Cargando datos"><span className="rc-skeleton" /></div>
                        : !entries.length ? (
                          <div className="rc-empty">
                            <p className="rc-empty-title">Todavía no hay datos de este libro.</p>
                            <p className="rc-hint">Importá juntos los archivos del paquete (CONTEXTO_DEL_LIBRO.md, personajes.json, fuentes-documentales.json, las reglas y los textos de las unidades). Todo entra como observado o pendiente hasta que lo apruebes.</p>
                          </div>
                        ) : !filtered.length ? <p className="rc-set-quiet" role="status">Nada coincide con el filtro.</p> : (
                          <ul className="rc-kb-list" aria-label={filtered.length + ' datos'}>
                            {filtered.map(e => (
                              <li key={e.id}>
                                <button type="button" className="rc-kb-row" aria-current={e.id === selectedId || undefined} onClick={() => go({e: e.id})}>
                                  <span className="rc-kb-row-title">{e.title}</span>
                                  <span className="rc-kb-row-meta"><span className="rc-hint">{kindName[e.kind]}</span><StatusBadge status={e.status} /></span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                    </div>
                    <div className="rc-kb-detail-col">
                      {selected ? (
                        <>
                          <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm rc-kb-back" onClick={() => go({e: null})}><ArrowLeft aria-hidden="true" />Volver a la lista</button>
                          <EntryDetail entry={selected} names={names} all={entries || []} project={project} onOpen={id => go({e: id})} />
                        </>
                      ) : entries?.length ? <p className="rc-hint rc-kb-pick">Elegí un dato para ver su fuente, su historial y lo que decidas sobre él.</p> : null}
                    </div>
                  </div>
                ) : tab === 'known' ? (
                  <div role="tabpanel" id="kb-panel-known" aria-labelledby="kb-tab-known"><KnownPanel entries={entries || []} onOpen={id => { setTab('data'); go({e: id}); }} /></div>
                ) : (
                  <div role="tabpanel" id="kb-panel-settings" aria-labelledby="kb-tab-settings"><ProjectSettings project={project} /></div>
                )}
                <NewEntry open={adding} project={project} onClose={() => setAdding(false)} onCreated={id => { setAdding(false); setTab('data'); setQuery(''); setKind('all'); setStatus('all'); go({e: id}); }} />
              </>
            )}
        </div>
      </div>
    </div>
  );
}

function NewProject({onCreated}: {onCreated: (p: KbProject) => void}) {
  const [name, setName] = useState('Русский код');
  return (
    <form className="rc-kb-new" onSubmit={e => { e.preventDefault(); createProject(name).then(onCreated, () => toast('No se pudo crear el proyecto en este navegador.')); }}>
      <p>Creá el proyecto del libro para guardar su contexto. Después importás los archivos del paquete y elegís qué unidades del manual y qué asistentes lo usan.</p>
      <label className="rc-field"><span>Nombre del libro</span><input className="rc-input" required maxLength={200} value={name} onChange={e => setName(e.target.value)} /></label>
      <button type="submit" className="rc-btn rc-btn--primary" disabled={!name.trim()}><Plus aria-hidden="true" />Crear el proyecto del libro</button>
    </form>
  );
}

function NewEntry({open, project, onClose, onCreated}: {open: boolean; project: KbProject; onClose: () => void; onCreated: (id: string) => void}) {
  const [kind, setKind] = useState<KbKind>('note');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  useEffect(() => { if (open) { setTitle(''); setBody(''); } }, [open]);
  async function create() {
    const now = Date.now();
    const id = prefix[kind] + '.' + slug(title, 40) + '-' + Math.random().toString(36).slice(2, 6);
    const data = kind === 'character' ? {...emptyData('character'), nameRu: title.trim(), aliases: defaultAliases(title)} : emptyData(kind);
    const entry = {schema: 1, project: project.id, id, kind, title: title.trim(), body, status: 'proposed', data, sources: [{kind: 'author', label: 'Escrito en el estudio', date: new Date(now).toISOString().slice(0, 10)}], tags: [], version: 1, createdAt: now, updatedAt: now, note: 'Creado en el estudio', history: []} as KbEntry;
    try { await addEntry(entry); onCreated(id); } catch { toast('No se pudo guardar el dato.'); }
  }
  return (
    <Dialog open={open} onClose={onClose} title="Agregar un dato" description="Entra como propuesta. Lo aprobás cuando esté listo; hasta entonces el asistente no lo trata como un hecho.">
      <form className="rc-dialog-body" onSubmit={e => { e.preventDefault(); if (title.trim()) void create(); }}>
        <label className="rc-field"><span>Tipo</span>
          <select className="rc-input" value={kind} onChange={e => setKind(e.target.value as KbKind)}>{kbKinds.filter(k => k !== 'page').map(k => <option key={k} value={k}>{kindName[k]}</option>)}</select>
        </label>
        <label className="rc-field"><span>{kind === 'character' ? 'Nombre ruso' : 'Título'}</span><input className="rc-input" required maxLength={300} value={title} onChange={e => setTitle(e.target.value)} autoFocus /></label>
        <label className="rc-field"><span>Texto</span><textarea className="rc-textarea" rows={4} maxLength={60000} value={body} onChange={e => setBody(e.target.value)} /></label>
        <div className="rc-dialog-footer rc-dialog-footer--end">
          <button type="button" className="rc-btn rc-btn--ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="rc-btn rc-btn--primary" disabled={!title.trim()}>Agregar</button>
        </div>
      </form>
    </Dialog>
  );
}
