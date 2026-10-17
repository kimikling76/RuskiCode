'use client';
import {useEffect, useMemo, useState} from 'react';
import {useRouter, useSearchParams} from 'next/navigation';
import {useQuery} from '@tanstack/react-query';
import {toast} from 'sonner';
import {Bot, MoreHorizontal, Plus, Search} from 'lucide-react';
import {useAssistants, MAX_INSTRUCTIONS, type Assistant, type AssistantScope} from '@/store/assistants';
import {NavTrigger} from '@/components/studio/sidebar';
import {ChatModelPicker, type ChatModel} from '@/components/studio/chat-model-picker';
import {AssistantPreview, preferredModel, scopeNames} from '@/components/studio/assistant-chooser';
import {Dialog, ConfirmDialog} from '@/components/ui/dialog';
import {Menu, MenuTrigger, MenuContent, MenuItem, MenuSeparator} from '@/components/ui/menu';
import {Segmented} from '@/components/cinema/controls';
import {Switch} from '@/components/ui/switch';

type Draft = Omit<Assistant, 'id' | 'createdAt' | 'updatedAt'>;
const blank: Draft = {name: '', description: '', instructions: '', model: 'auto', scope: 'chat', mediaCatalog: false};

function useTextModels() {
  return useQuery<{models: ChatModel[]}>({
    queryKey: ['personal-kie-models'],
    queryFn: async () => { const r = await fetch('/api/personal-chat'); if (!r.ok) throw Error(); return r.json(); },
    staleTime: 60000,
  });
}

function Editor({open, initial, models, onClose, onSave}: {open: boolean; initial: Draft; models: ChatModel[]; onClose: () => void; onSave: (d: Draft) => void}) {
  const [d, setD] = useState(initial);
  useEffect(() => { if (open) setD(initial); }, [open, initial]);
  const set = (patch: Partial<Draft>) => setD(prev => ({...prev, ...patch}));
  const pref = preferredModel({...d, id: '', createdAt: '', updatedAt: ''}, models);
  const valid = d.name.trim() && d.instructions.trim() && d.instructions.length <= MAX_INSTRUCTIONS;
  return (
    <Dialog open={open} onClose={onClose} title={initial.name ? 'Editar asistente' : 'Nuevo asistente'} description="Las instrucciones se usan solo cuando elegís este asistente. El Chat normal sigue neutro." wide>
      <form className="rc-dialog-body rc-assistant-form" onSubmit={e => { e.preventDefault(); if (valid) onSave({...d, name: d.name.trim(), description: d.description.trim(), instructions: d.instructions.trim()}); }}>
        <label className="rc-field"><span>Nombre</span><input className="rc-input" required maxLength={80} value={d.name} onChange={e => set({name: e.target.value})} autoFocus /></label>
        <label className="rc-field"><span>Descripción (opcional)</span><input className="rc-input" maxLength={200} value={d.description} onChange={e => set({description: e.target.value})} /></label>
        <div className="rc-field"><span>Ámbito</span>
          <Segmented name="assistant-scope" label="Ámbito" value={d.scope} onChange={v => set({scope: v as AssistantScope})} options={[{value: 'chat', label: 'Chat'}, {value: 'cinema', label: 'Cinema'}, {value: 'pdf', label: 'PDF'}]} />
        </div>
        <div className="rc-field"><span>Modelo preferido</span>
          <div className="rc-assistant-model"><ChatModelPicker models={models} value={d.model} onChange={id => set({model: id})} title="Modelo preferido" /></div>
          {pref.state === 'missing' ? <p className="rc-form-error" role="status">«{pref.label}» ya no está disponible. Elegí otro; las instrucciones no se pierden.</p> : null}
        </div>
        <label className="rc-field">
          <span>Instrucciones</span>
          <textarea className="rc-textarea rc-assistant-textarea" required rows={10} maxLength={MAX_INSTRUCTIONS} value={d.instructions} onChange={e => set({instructions: e.target.value})} />
          <span className="rc-hint rc-assistant-count">{d.instructions.length.toLocaleString('es-AR')} / {MAX_INSTRUCTIONS.toLocaleString('es-AR')}</span>
        </label>
        <label className="rc-setting-row rc-assistant-media" htmlFor="assistant-media">
          <span>
            <strong>Incluir las opciones verificadas de imagen y video</strong>
            <span className="rc-hint">Le pasa al asistente la lista real de proporciones, resoluciones y duraciones de los modelos habilitados.</span>
          </span>
          <Switch id="assistant-media" checked={Boolean(d.mediaCatalog)} onCheckedChange={v => set({mediaCatalog: v})} />
        </label>
        <div className="rc-dialog-footer rc-dialog-footer--end">
          <button type="button" className="rc-btn rc-btn--ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="rc-btn rc-btn--primary" disabled={!valid}>Guardar</button>
        </div>
      </form>
    </Dialog>
  );
}

export function AssistantsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const hydrate = useAssistants(s => s.hydrate);
  const hydrated = useAssistants(s => s.hydrated);
  const assistants = useAssistants(s => s.assistants);
  const error = useAssistants(s => s.error);
  const {create, update, duplicate, remove, restore} = useAssistants.getState();
  const {data} = useTextModels();
  const models = data?.models || [];
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{id: string | null; draft: Draft} | null>(null);
  const [deleting, setDeleting] = useState<Assistant | null>(null);
  const [viewing, setViewing] = useState<Assistant | null>(null);

  useEffect(() => { hydrate(); }, [hydrate]);
  // ?editar=<id> comes from «Editar» in the Chat's preview.
  useEffect(() => {
    const id = params.get('editar');
    if (!id || !hydrated) return;
    const a = useAssistants.getState().assistants.find(x => x.id === id);
    if (a) setEditing({id: a.id, draft: {name: a.name, description: a.description, instructions: a.instructions, model: a.model, scope: a.scope, mediaCatalog: a.mediaCatalog, seed: a.seed}});
    router.replace('/workspace/asistentes', {scroll: false});
  }, [params, hydrated, router]);

  const needle = query.trim().toLocaleLowerCase('es');
  const groups = useMemo(() => (['chat', 'pdf', 'cinema'] as AssistantScope[]).map(scope => ({
    scope,
    items: assistants.filter(a => a.scope === scope && (!needle || (a.name + ' ' + a.description + ' ' + a.instructions).toLocaleLowerCase('es').includes(needle))),
  })).filter(g => g.items.length), [assistants, needle]);

  function save(draft: Draft) {
    if (!editing) return;
    if (editing.id) update(editing.id, draft); else create(draft);
    setEditing(null);
    toast(editing.id ? 'Asistente guardado' : 'Asistente creado');
  }

  function confirmDelete() {
    if (!deleting) return;
    const removed = remove(deleting.id);
    setDeleting(null);
    if (removed) toast('Asistente borrado', {action: {label: 'Deshacer', onClick: () => restore(removed)}, duration: 8000});
  }

  return (
    <div className="rc-settings">
      <header className="rc-topbar rc-topbar--mobile-only">
        <NavTrigger />
        <div className="rc-studio-identity"><Bot aria-hidden="true" />Asistentes</div>
      </header>
      <div className="rc-main-scroll rc-settings-scroll">
        <div className="rc-settings-page rc-assistants">
          <div className="rc-assistants-head">
            <div>
              <h1 className="rc-page-title rc-settings-title">Asistentes</h1>
              <p className="rc-page-lead">Instrucciones guardadas que elegís a propósito. Se sincronizan con tu cuenta. El Chat normal nunca las usa por su cuenta.</p>
            </div>
            <button type="button" className="rc-btn rc-btn--primary" onClick={() => setEditing({id: null, draft: blank})}><Plus aria-hidden="true" />Nuevo asistente</button>
          </div>
          {error ? <p className="rc-form-error" role="alert">{error}</p> : null}
          <label className="rc-assistants-search">
            <Search aria-hidden="true" />
            <span className="sr-only">Buscar asistentes</span>
            <input className="rc-input" type="search" placeholder="Buscar por nombre o instrucciones" value={query} onChange={e => setQuery(e.target.value)} />
          </label>

          {!hydrated ? (
            <div className="rc-history-loading" role="status" aria-label="Cargando asistentes"><span className="rc-skeleton" /><span className="rc-skeleton" /></div>
          ) : !assistants.length ? (
            <div className="rc-empty">
              <p className="rc-empty-title">No hay asistentes guardados.</p>
              <p className="rc-hint">Creá uno con las instrucciones que repetís seguido.</p>
            </div>
          ) : !groups.length ? (
            <p className="rc-set-quiet" role="status">Ningún asistente coincide con «{query}».</p>
          ) : groups.map(g => (
            <section key={g.scope} className="rc-set-group">
              <div className="rc-set-group-head"><h2>{scopeNames[g.scope]}</h2></div>
              <ul className="rc-assistant-list">
                {g.items.map(a => {
                  const pref = preferredModel(a, models);
                  return (
                    <li key={a.id} className="rc-assistant-row">
                      <button type="button" className="rc-assistant-open" onClick={() => setViewing(a)}>
                        <strong>{a.name}</strong>
                        {a.description ? <span className="rc-hint">{a.description}</span> : null}
                        <span className="rc-assistant-meta">
                          Modelo: {pref.label}{pref.state === 'missing' ? ' · no disponible, elegí otro' : ''}
                        </span>
                      </button>
                      <div className="rc-assistant-actions">
                        <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => router.push('/workspace?studio=chat&asistente=' + encodeURIComponent(a.id))}>Usar en el Chat</button>
                        <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" onClick={() => setEditing({id: a.id, draft: {name: a.name, description: a.description, instructions: a.instructions, model: a.model, scope: a.scope, mediaCatalog: a.mediaCatalog, seed: a.seed}})}>Editar</button>
                        <Menu>
                          <MenuTrigger asChild>
                            <button type="button" className="rc-icon-btn" aria-label={'Más acciones de ' + a.name}><MoreHorizontal /></button>
                          </MenuTrigger>
                          <MenuContent align="end">
                            <MenuItem onSelect={() => { duplicate(a.id); toast('Asistente duplicado'); }}>Duplicar</MenuItem>
                            <MenuSeparator />
                            <MenuItem danger onSelect={() => setDeleting(a)}>Borrar</MenuItem>
                          </MenuContent>
                        </Menu>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>

      <Editor open={Boolean(editing)} initial={editing?.draft || blank} models={models} onClose={() => setEditing(null)} onSave={save} />
      <AssistantPreview assistant={viewing} models={models} onClose={() => setViewing(null)} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title={'¿Borrar «' + (deleting?.name || '') + '»?'}
        description="Se borra de tu cuenta en todas las computadoras. Los chats que ya lo usaron conservan sus últimas instrucciones."
        confirmLabel="Borrar asistente"
        tone="danger"
      />
    </div>
  );
}
