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
export type ChatModel = Pick<PublicModel, 'id' | 'name' | 'provider'> & Partial<Pick<PublicModel, 'status' | 'available' | 'missing' | 'category' | 'price' | 'inputs' | 'webSearch' | 'options'>>;

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

const seconds = (list: readonly string[]) => {
  const n = list.map(Number).filter(Number.isFinite);
  if (!n.length) return '';
  const min = Math.min(...n), max = Math.max(...n);
  return (min === max ? String(min) : min + '–' + max) + ' s';
};

/** What a model can do, in a few words, from the catalog: never more than the catalog says. */
export function capabilities(m: ChatModel) {
  const out: string[] = [];
  if (m.inputs?.includes('image')) out.push('lee imágenes');
  if (m.webSearch) out.push('busca en la web');
  const o = m.options;
  if (o && m.category === 'video') {
    if (o.maxReferences && !o.modes.includes('create')) out.push('anima una imagen');
    else if (o.maxReferences === 1) out.push('imagen inicial opcional');
    else if (o.maxReferences > 1) out.push('hasta ' + o.maxReferences + ' referencias');
    if (o.durations.length) out.push(seconds(o.durations));
  } else if (o) {
    if (!o.modes.includes('create')) out.push('solo edita');
    else if (o.modes.includes('edit')) out.push('crea y edita');
    if (o.maxReferences) out.push(o.maxReferences === 1 ? '1 referencia' : 'hasta ' + o.maxReferences + ' referencias');
    if (o.maxVariants > 1) out.push('hasta ' + o.maxVariants + ' por pedido');
  }
  if (m.price) out.push(estimate(m.price));
  return out;
}

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
        <Popover.Content className="rc-popover rc-layer rc-model-popover" side="top" align="start" sideOffset={8} collisionPadding={12} aria-label={title}>
          {list}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Row({m, value, favorite, onChoose, onFavorite}: {m: ChatModel; value: string; favorite: boolean; onChoose: (id: string) => void; onFavorite: (id: string) => void}) {
  const ok = usable(m);
  // Whether it was tested is said once, by its group; the row says who makes it and what it can do.
  const detail = m.status === 'unverified' ? 'No verificado' + (m.missing ? ' · ' + m.missing : '')
    : m.status === 'listed' ? 'Sin pantalla en el estudio' + (m.missing ? ' · ' + m.missing : '')
      : m.available === false ? m.missing || 'Sin configurar en el servidor'
        : [m.provider ? m.provider + ' vía Kie' : 'Vía Kie', ...capabilities(m)].join(' · ');
  return (
    <Command.Item
      value={m.id}
      keywords={[m.name, m.provider || '']}
      disabled={!ok}
      onSelect={() => onChoose(m.id)}
      className="rc-model-row"
      data-unverified={m.status && !usableStatus(m.status) ? 'true' : undefined}
    >
      <span className="rc-model-icon" aria-hidden="true">{(m.provider || m.name).slice(0, 1).toUpperCase()}</span>
      <span className="rc-model-text">
        {/* The name read aloud is the visible text, with a pause before the detail. */}
        <strong>{modelLabel(m.name)}{favorite ? <span className="sr-only">, favorito</span> : null}</strong>
        <small><span className="sr-only">. </span>{detail}</small>
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
  const others = shown.filter(m => usable(m) && !favorites[m.id]);
  // Tested from the studio, or only set up from Kie's documentation: said once, in the group's title.
  const tested = others.filter(m => m.status !== 'docs');
  const untested = others.filter(m => m.status === 'docs');
  const off = shown.filter(m => !usable(m));
  const onFavorite = (id: string) => toggle(id, category);
  const row = (m: ChatModel, favorite = false) => <Row key={m.id} m={m} value={value} favorite={favorite} onChoose={onChoose} onFavorite={onFavorite} />;

  return (
    <div className="rc-model-picker">
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
        {providers.length > 1 || Object.keys(favorites).length ? (
          // One row that slides sideways. Its keys stay its own: Enter presses a filter, not the highlighted model.
          <div className="rc-model-filters" role="group" aria-label="Filtrar por proveedor" onKeyDown={e => e.stopPropagation()}>
            <button type="button" className="rc-chip" aria-pressed={provider === null} onClick={() => setProvider(null)}>Todos</button>
            <button type="button" className="rc-chip" aria-pressed={provider === 'favorites'} onClick={() => setProvider(provider === 'favorites' ? null : 'favorites')}><Star aria-hidden="true" />Favoritos</button>
            {providers.map(p => <button key={p} type="button" className="rc-chip" aria-pressed={provider === p} onClick={() => setProvider(provider === p ? null : p)}>{p}</button>)}
          </div>
        ) : null}
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
          {fav.length ? <Command.Group heading="Favoritos" className="rc-command-group">{fav.map(m => row(m, true))}</Command.Group> : null}
          {tested.length ? <Command.Group heading={untested.length ? 'Probados en el estudio' : fav.length ? 'Otros disponibles' : 'Disponibles en Kie'} className="rc-command-group">{tested.map(m => row(m))}</Command.Group> : null}
          {untested.length ? <Command.Group heading="Sin probar todavía · según la documentación de Kie" className="rc-command-group">{untested.map(m => row(m))}</Command.Group> : null}
          {off.length ? <Command.Group heading={'No disponibles (' + off.length + ')'} className="rc-command-group">{off.map(m => row(m))}</Command.Group> : null}
        </Command.List>
      </Command>
      <p className="rc-model-hint">Escribí para buscar · Enter elige · Ctrl+Enter marca favorito</p>
    </div>
  );
}
