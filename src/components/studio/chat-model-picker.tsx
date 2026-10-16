'use client';
import {useState, useSyncExternalStore} from 'react';
import * as Popover from '@radix-ui/react-popover';
import * as RadixDialog from '@radix-ui/react-dialog';
import {Command} from 'cmdk';
import {Check, ChevronDown, Sparkles} from 'lucide-react';

export type ChatModel = {id: string; name: string; provider?: string};

/** "Gemini 3.1 Pro · KIE" → "Gemini 3.1 Pro". Kie is shown once, in the row detail. */
export function modelLabel(name: string) {
  return name.replace(/\s*·\s*kie(\.ai)?\s*$/i, '').trim() || name;
}

const SMALL = '(max-width: 640px)';
function subscribe(callback: () => void) {
  const media = window.matchMedia(SMALL);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}
function useSmallScreen() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(SMALL).matches, () => false);
}

export function ChatModelPicker({models, value, onChange, disabled}: {models: ChatModel[]; value: string; onChange: (id: string) => void; disabled?: boolean}) {
  const [open, setOpen] = useState(false);
  const small = useSmallScreen();
  const current = models.find(m => m.id === value);
  const label = value === 'auto' || !current ? 'Automático' : modelLabel(current.name);

  function choose(id: string) {
    onChange(id);
    setOpen(false);
  }

  const trigger = (
    <button type="button" className="rc-model-trigger" disabled={disabled} aria-label={'Modelo: ' + label}>
      <span>{label}</span>
      <ChevronDown aria-hidden="true" />
    </button>
  );

  const list = <ModelList models={models} value={value} onChoose={choose} autoFocus={!small} />;

  if (small) {
    return (
      <RadixDialog.Root open={open} onOpenChange={setOpen}>
        <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger>
        <RadixDialog.Portal>
          <RadixDialog.Overlay className="rc-overlay rc-layer" />
          <RadixDialog.Content
            className="rc-dialog rc-layer rc-model-sheet"
            aria-describedby={undefined}
            onOpenAutoFocus={e => { e.preventDefault(); (e.currentTarget as HTMLElement).focus(); }}
          >
            <RadixDialog.Title className="rc-dialog-title">Modelo</RadixDialog.Title>
            {list}
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>
    );
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="rc-popover rc-layer rc-model-popover" side="top" align="start" sideOffset={8} collisionPadding={12}>
          {list}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ModelList({models, value, onChoose, autoFocus}: {models: ChatModel[]; value: string; onChoose: (id: string) => void; autoFocus: boolean}) {
  return (
    <Command className="rc-command" label="Elegir modelo" loop defaultValue={value}>
      <Command.Input className="rc-command-input" placeholder="Buscar modelo" autoFocus={autoFocus} />
      <Command.List className="rc-command-list">
        <Command.Empty className="rc-command-empty">Ningún modelo coincide.</Command.Empty>
        <Command.Item value="auto" keywords={['automático', 'auto']} onSelect={() => onChoose('auto')} className="rc-model-row">
          <span className="rc-model-icon" aria-hidden="true"><Sparkles /></span>
          <span className="rc-model-text">
            <strong>Automático</strong>
            <small>El estudio elige un modelo disponible.</small>
          </span>
          {value === 'auto' ? <Check className="rc-model-check" aria-label="Seleccionado" /> : null}
        </Command.Item>
        {models.length ? (
          <Command.Group heading="Disponibles en Kie" className="rc-command-group">
            {models.map(m => (
              <Command.Item key={m.id} value={m.id} keywords={[m.name, m.provider || '']} onSelect={() => onChoose(m.id)} className="rc-model-row">
                <span className="rc-model-icon" aria-hidden="true">{(m.provider || m.name).slice(0, 1).toUpperCase()}</span>
                <span className="rc-model-text">
                  <strong>{modelLabel(m.name)}</strong>
                  <small>{m.provider ? m.provider + ' · vía Kie' : 'Vía Kie'}</small>
                </span>
                {value === m.id ? <Check className="rc-model-check" aria-label="Seleccionado" /> : null}
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}
      </Command.List>
    </Command>
  );
}
