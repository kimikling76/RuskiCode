'use client';
import {Fragment} from 'react';
import Link from 'next/link';
import {Bot, ChevronDown, X} from 'lucide-react';
import {useAssistants, type Assistant, type AssistantScope} from '@/store/assistants';
import {Dialog} from '@/components/ui/dialog';
import {Menu, MenuTrigger, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuLink} from '@/components/ui/menu';
import {modelLabel, type ChatModel} from './chat-model-picker';

export const scopeNames: Record<AssistantScope, string> = {chat: 'Chat', cinema: 'Cinema Studio', pdf: 'PDF Studio'};

/** Where the preferred model stands: usable, gone, or «Auto». */
export function preferredModel(a: Assistant, models: ChatModel[]) {
  if (a.model === 'auto') return {state: 'auto' as const, label: 'Automático'};
  const m = models.find(x => x.id === a.model);
  if (m && m.available !== false && m.status !== 'unverified') return {state: 'ok' as const, label: modelLabel(m.name)};
  return {state: 'missing' as const, label: m ? modelLabel(m.name) : a.model};
}

/** Chooses an assistant for a new conversation. The neutral Chat is always the first option. */
export function AssistantMenu({onPick, label = 'Elegir asistente'}: {onPick: (a: Assistant) => void; label?: string}) {
  const assistants = useAssistants(s => s.assistants);
  const order: AssistantScope[] = ['chat', 'pdf', 'cinema'];
  return (
    <Menu>
      <MenuTrigger asChild>
        <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm rc-assistant-trigger"><Bot aria-hidden="true" />{label}<ChevronDown aria-hidden="true" /></button>
      </MenuTrigger>
      <MenuContent align="start">
        {order.map(scope => {
          const list = assistants.filter(a => a.scope === scope);
          if (!list.length) return null;
          return (
            <Fragment key={scope}>
              <MenuLabel>{scopeNames[scope]}</MenuLabel>
              {list.map(a => <MenuItem key={a.id} onSelect={() => onPick(a)}>{a.name}</MenuItem>)}
            </Fragment>
          );
        })}
        {assistants.length ? <MenuSeparator /> : null}
        <MenuLink href="/workspace/asistentes">{assistants.length ? 'Administrar asistentes' : 'Crear un asistente'}</MenuLink>
      </MenuContent>
    </Menu>
  );
}

/** Shows what an assistant will do before using it. */
export function AssistantPreview({assistant, models, onUse, onClose, inUse}: {assistant: Assistant | null; models: ChatModel[]; onUse?: () => void; onClose: () => void; inUse?: boolean}) {
  const pref = assistant ? preferredModel(assistant, models) : null;
  return (
    <Dialog open={Boolean(assistant)} onClose={onClose} title={assistant?.name || ''} description={assistant?.description || undefined} wide>
      {assistant ? (
        <div className="rc-dialog-body">
          <dl className="rc-facts">
            <dt>Ámbito</dt><dd>{scopeNames[assistant.scope]}</dd>
            <dt>Modelo preferido</dt><dd>{pref?.label}</dd>
          </dl>
          {pref?.state === 'missing' ? (
            <p className="rc-form-error" role="status">Ese modelo no está disponible ahora. Las instrucciones se conservan: se va a usar el modelo que elijas en el selector. Podés cambiar el preferido en Asistentes.</p>
          ) : null}
          <div className="rc-assistant-instructions" tabIndex={0} aria-label="Instrucciones del asistente">{assistant.instructions}</div>
          <p className="rc-hint">Estas instrucciones se agregan a la conversación solo mientras uses este asistente. No le dan acceso a herramientas: solo responde con texto.</p>
          <div className="rc-dialog-footer rc-dialog-footer--end">
            <Link className="rc-btn rc-btn--ghost" href={'/workspace/asistentes?editar=' + encodeURIComponent(assistant.id)}>Editar</Link>
            <button type="button" className="rc-btn rc-btn--ghost" onClick={onClose}>{onUse && !inUse ? 'Cancelar' : 'Cerrar'}</button>
            {onUse && !inUse ? <button type="button" className="rc-btn rc-btn--primary" onClick={onUse}>Usar este asistente</button> : null}
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}

/** The active assistant, always visible while it applies. */
export function AssistantChip({name, onView, onClear, clearLabel = 'Volver al chat neutro'}: {name: string; onView: () => void; onClear: () => void; clearLabel?: string}) {
  return (
    <span className="rc-assistant-chip">
      <button type="button" className="rc-assistant-chip-main" onClick={onView} aria-label={'Asistente activo: ' + name + '. Ver instrucciones'}>
        <Bot aria-hidden="true" /><span>{name}</span>
      </button>
      <button type="button" className="rc-assistant-chip-clear" onClick={onClear} aria-label={clearLabel} title={clearLabel}><X aria-hidden="true" /></button>
    </span>
  );
}

/** For studio panels: «Sin asistente» or one assistant of that studio's scope. */
export function AssistantSelect({scope, value, onChange}: {scope: AssistantScope; value: string | null; onChange: (a: Assistant | null) => void}) {
  const assistants = useAssistants(s => s.assistants).filter(a => a.scope === scope);
  const current = assistants.find(a => a.id === value) || null;
  if (!assistants.length) return null;
  return (
    <Menu>
      <MenuTrigger asChild>
        <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm rc-assistant-trigger" aria-label={'Asistente: ' + (current?.name || 'ninguno')}>
          <Bot aria-hidden="true" />{current ? current.name : 'Sin asistente'}<ChevronDown aria-hidden="true" />
        </button>
      </MenuTrigger>
      <MenuContent align="start">
        <MenuItem onSelect={() => onChange(null)}>Sin asistente</MenuItem>
        <MenuSeparator />
        {assistants.map(a => <MenuItem key={a.id} onSelect={() => onChange(a)}>{a.name}</MenuItem>)}
      </MenuContent>
    </Menu>
  );
}
