'use client';
import {useMemo, useState, useSyncExternalStore} from 'react';
import * as Popover from '@radix-ui/react-popover';
import * as RadixDialog from '@radix-ui/react-dialog';
import {Command} from 'cmdk';
import {Check, ChevronDown, Sparkles, Star} from 'lucide-react';
import {useFavorites, type FavoriteCategory} from '@/store/favorites';
import type {PublicModel} from '@/lib/ai/models';
import {usableStatus} from '@/lib/ai/model-status';

/** What a picker row needs. Text models from /api/personal-chat and media models share it. */
export type ChatModel = Pick<PublicModel, 'id' | 'name' | 'provider'> & Partial<Pick<PublicModel, 'status' | 'available' | 'missing' | 'category' | 'price' | 'inputs' | 'webSearch'>>;

/** A configured price is only an estimate; the real cost is what Kie reports afterwards. */
export const estimate = (price: NonNullable<ChatModel['price']>) => 'estimado ≈ ' + price.credits.toLocaleString('es-AR') + ' créditos ' + price.per;

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

/** A model that can be chosen right now: enabled in the catalog and configured on the server. */
export const usable = (m: ChatModel) => m.available !== false && (!m.status || usableStatus(m.status));

/**
 * Model picker: search, provider filter, persistent favorites (synced) and keyboard navigation.
 * Unverified models are listed at the end, disabled, with what is missing.
 */
export function ChatModelPicker({models, value, onChange, disabled, category = 'text', allowAuto = true, title = 'Modelo'}: {
  models: ChatModel[]; value: string; onChange: (id: string) => void; disabled?: boolean;
  category?: FavoriteCategory; allowAuto?: boolean; title?: string;
}) {
  const [open, setOpen] = useState(false);
  const small = useSmallScreen();
  const current = models.find(m => m.id === value);
  const label = allowAuto && (value === 'auto' || !current) ? 'Automático' : current ? modelLabel(current.name) : 'Elegir modelo';

  function choose(id: string) {
    onChange(id);
    setOpen(false);
  }

  const trigger = (
    <button type="button" className="rc-model-trigger" disabled={disabled} aria-label={title + ': ' + label}>
      <span>{label}</span>
      <ChevronDown aria-hidden="true" />
    </button>
  );

  const list = <ModelList models={models} value={value} onChoose={choose} autoFocus={!small} category={category} allowAuto={allowAuto} />;

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
            <RadixDialog.Title className="rc-dialog-title">{title}</RadixDialog.Title>
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

function Row({m, value, favorite, onChoose, onFavorite}: {m: ChatModel; value: string; favorite: boolean; onChoose: (id: string) => void; onFavorite: (id: string) => void}) {
  const ok = usable(m);
  const detail = m.status === 'unverified' ? 'No verificado' + (m.missing ? ' · ' + m.missing : '')
    : m.status === 'listed' ? 'Sin pantalla en el estudio' + (m.missing ? ' · ' + m.missing : '')
      : m.available === false ? m.missing || 'Sin configurar en el servidor'
        : (m.provider ? m.provider + ' · vía Kie' : 'Vía Kie') + (m.status === 'docs' ? ' · sin prueba real todavía' : '')
          + (m.inputs?.includes('image') ? ' · lee imágenes' : '') + (m.webSearch ? ' · busca en la web' : '') + (m.price ? ' · ' + estimate(m.price) : '');
  return (
    <Command.Item
      value={m.id}
      keywords={[m.name, m.provider || '']}
      disabled={!ok}
      onSelect={() => onChoose(m.id)}
      className="rc-model-row"
      data-unverified={m.status && !usableStatus(m.status) ? 'true' : undefined}
      aria-label={modelLabel(m.name) + (favorite ? ', favorito' : '') + '. ' + detail}
    >
      <span className="rc-model-icon" aria-hidden="true">{(m.provider || m.name).slice(0, 1).toUpperCase()}</span>
      <span className="rc-model-text">
        <strong>{modelLabel(m.name)}</strong>
        <small title={detail}>{detail}</small>
      </span>
      {ok ? (
        <span
          className="rc-model-star"
          data-on={favorite ? 'true' : undefined}
          aria-hidden="true"
          title={favorite ? 'Quitar de favoritos (Ctrl+Enter)' : 'Marcar como favorito (Ctrl+Enter)'}
          onPointerDown={e => { e.preventDefault(); e.stopPropagation(); }}
          onClick={e => { e.preventDefault(); e.stopPropagation(); onFavorite(m.id); }}
        >
          <Star />
        </span>
      ) : null}
      {value === m.id ? <Check className="rc-model-check" aria-label="Seleccionado" /> : null}
    </Command.Item>
  );
}

function ModelList({models, value, onChoose, autoFocus, category, allowAuto}: {models: ChatModel[]; value: string; onChoose: (id: string) => void; autoFocus: boolean; category: FavoriteCategory; allowAuto: boolean}) {
  const favorites = useFavorites(s => s.favorites);
  const toggle = useFavorites(s => s.toggle);
  const [provider, setProvider] = useState<string | 'favorites' | null>(null);
  const [highlighted, setHighlighted] = useState(value);

  const providers = useMemo(() => [...new Set(models.map(m => m.provider).filter(Boolean))] as string[], [models]);
  const shown = models.filter(m => provider === null ? true : provider === 'favorites' ? Boolean(favorites[m.id]) : m.provider === provider);
  const fav = shown.filter(m => usable(m) && favorites[m.id]);
  const rest = shown.filter(m => usable(m) && !favorites[m.id]);
  const off = shown.filter(m => !usable(m));
  const onFavorite = (id: string) => toggle(id, category);

  return (
    <div className="rc-model-picker">
      {providers.length > 1 || Object.keys(favorites).length ? (
        <div className="rc-model-filters" role="group" aria-label="Filtrar por proveedor">
          <button type="button" className="rc-chip" aria-pressed={provider === null} onClick={() => setProvider(null)}>Todos</button>
          <button type="button" className="rc-chip" aria-pressed={provider === 'favorites'} onClick={() => setProvider(provider === 'favorites' ? null : 'favorites')}><Star aria-hidden="true" />Favoritos</button>
          {providers.map(p => <button key={p} type="button" className="rc-chip" aria-pressed={provider === p} onClick={() => setProvider(provider === p ? null : p)}>{p}</button>)}
        </div>
      ) : null}
      <Command className="rc-command" label="Elegir modelo" loop defaultValue={value} value={highlighted} onValueChange={setHighlighted}>
        <Command.Input
          className="rc-command-input"
          placeholder="Buscar modelo"
          autoFocus={autoFocus}
          onKeyDown={e => {
            // Ctrl/⌘ + Enter marks the highlighted model as favorite without choosing it.
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && highlighted && highlighted !== 'auto' && models.some(m => m.id === highlighted && usable(m))) {
              e.preventDefault(); e.stopPropagation(); onFavorite(highlighted);
            }
          }}
        />
        <Command.List className="rc-command-list">
          <Command.Empty className="rc-command-empty">Ningún modelo coincide.</Command.Empty>
          {allowAuto && provider === null ? (
            <Command.Item value="auto" keywords={['automático', 'auto']} onSelect={() => onChoose('auto')} className="rc-model-row">
              <span className="rc-model-icon" aria-hidden="true"><Sparkles /></span>
              <span className="rc-model-text">
                <strong>Automático</strong>
                <small>El estudio elige un modelo disponible.</small>
              </span>
              {value === 'auto' ? <Check className="rc-model-check" aria-label="Seleccionado" /> : null}
            </Command.Item>
          ) : null}
          {fav.length ? (
            <Command.Group heading="Favoritos" className="rc-command-group">
              {fav.map(m => <Row key={m.id} m={m} value={value} favorite onChoose={onChoose} onFavorite={onFavorite} />)}
            </Command.Group>
          ) : null}
          {rest.length ? (
            <Command.Group heading={fav.length ? 'Otros disponibles' : 'Disponibles en Kie'} className="rc-command-group">
              {rest.map(m => <Row key={m.id} m={m} value={value} favorite={false} onChoose={onChoose} onFavorite={onFavorite} />)}
            </Command.Group>
          ) : null}
          {off.length ? (
            <Command.Group heading={'No disponibles (' + off.length + ')'} className="rc-command-group">
              {off.map(m => <Row key={m.id} m={m} value={value} favorite={false} onChoose={onChoose} onFavorite={onFavorite} />)}
            </Command.Group>
          ) : null}
        </Command.List>
      </Command>
      <p className="rc-model-hint">Flechas para moverte · Enter para elegir · Ctrl+Enter para marcar favorito</p>
    </div>
  );
}
