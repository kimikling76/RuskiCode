'use client';
import {useMemo, useState, type ReactNode} from 'react';
import * as Popover from '@radix-ui/react-popover';
import {Command} from 'cmdk';
import {Check, Search, Star} from 'lucide-react';
import type {Category} from '@/lib/ai/models';
import {Sheet} from '@/components/ui/sheet';
import {categoryNames, models, type ProtoModel} from './data';

// The model picker of the prototype: cmdk (search and keyboard) inside a Radix Popover on a computer and inside a
// bottom sheet on a phone. Models are grouped by type and by brand, favourites first; each row carries its initial
// in a tile (no brand logos), one line of facts from the catalog and «Nuevo» when it is recent.

export function Tile({letter, tone, size = 'md'}: {letter: string; tone?: string; size?: 'sm' | 'md' | 'lg'}) {
  return <span className="dz-tile" data-tone={tone} data-size={size} aria-hidden="true">{letter}</span>;
}

const brandTone = (provider: string) => ['kinovar', 'ohra', 'lazur', 'zelen'][[...provider].reduce((n, c) => n + c.charCodeAt(0), 0) % 4];

function Row({m, chosen, favourite, onChoose, onFavourite}: {m: ProtoModel; chosen: boolean; favourite: boolean; onChoose: () => void; onFavourite: () => void}) {
  return (
    <Command.Item className="dz-model" data-id={m.id} value={m.name + ' ' + m.provider + ' ' + m.id} disabled={!m.ready} onSelect={onChoose} data-chosen={chosen ? 'true' : undefined}>
      <Tile letter={m.provider[0]} tone={m.ready ? brandTone(m.provider) : 'off'} />
      <span className="dz-model-text">
        <strong>{m.name}{m.fresh ? <span className="dz-new">Nuevo</span> : null}{favourite ? <span className="sr-only">, favorito</span> : null}</strong>
        <small>{m.ready ? m.fact : m.provider + ' · todavía no conectado'}</small>
      </span>
      {chosen ? <Check className="dz-model-check" aria-label="Elegido" /> : null}
      {/* Not a button inside the option (a list option cannot hold one): a click target for the pointer, and Ctrl+Enter for the keyboard. */}
      <span className="dz-star" data-on={favourite ? 'true' : undefined} title={favourite ? 'Quitar de favoritos (Ctrl+Enter)' : 'Marcar como favorito (Ctrl+Enter)'} aria-hidden="true" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onFavourite(); }}><Star /></span>
    </Command.Item>
  );
}

function List({category, lockCategory, value, onChange, favourites, toggle}: {category: Category; lockCategory?: boolean; value: string; onChange: (id: string) => void; favourites: Set<string>; toggle: (id: string) => void}) {
  const [type, setType] = useState<Category>(category);
  const [brand, setBrand] = useState('');
  const ofType = useMemo(() => models.filter(m => m.category === type), [type]);
  const brands = useMemo(() => [...new Set(ofType.map(m => m.provider))].sort(), [ofType]);
  const shown = ofType.filter(m => !brand || m.provider === brand);
  const fav = shown.filter(m => favourites.has(m.id));
  const featured = shown.filter(m => m.featured && !favourites.has(m.id));
  const rest = shown.filter(m => !favourites.has(m.id) && !m.featured);
  const byBrand = brands.filter(b => !brand || b === brand).map(b => [b, rest.filter(m => m.provider === b)] as const).filter(([, xs]) => xs.length);
  const row = (m: ProtoModel) => <Row key={m.id} m={m} chosen={m.id === value} favourite={favourites.has(m.id)} onChoose={() => onChange(m.id)} onFavourite={() => toggle(m.id)} />;
  return (
    <Command className="dz-picker" label="Elegir modelo" loop onKeyDown={e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const id = (e.currentTarget.querySelector('[cmdk-item][data-selected="true"]') as HTMLElement | null)?.dataset.id;
        if (id) { e.preventDefault(); e.stopPropagation(); toggle(id); }
      }
    }}>
      <div className="dz-picker-search"><Search aria-hidden="true" /><Command.Input placeholder={'Buscar entre ' + ofType.length + ' modelos de ' + categoryNames[type].toLowerCase()} autoFocus /></div>
      {!lockCategory ? (
        <div className="dz-chips" role="tablist" aria-label="Tipo de modelo">
          {(Object.keys(categoryNames) as Category[]).map(c => <button key={c} type="button" role="tab" aria-selected={c === type} className="dz-chip" onClick={() => { setType(c); setBrand(''); }}>{categoryNames[c]}</button>)}
        </div>
      ) : null}
      <div className="dz-chips dz-chips--scroll" aria-label="Marca">
        <button type="button" className="dz-chip dz-chip--quiet" aria-pressed={!brand} onClick={() => setBrand('')}>Todas</button>
        {brands.map(b => <button key={b} type="button" className="dz-chip dz-chip--quiet" aria-pressed={b === brand} onClick={() => setBrand(b === brand ? '' : b)}>{b}</button>)}
      </div>
      <Command.List className="dz-picker-list">
        <Command.Empty className="dz-picker-empty">Ningún modelo con ese nombre. Probá con la marca.</Command.Empty>
        {fav.length ? <Command.Group heading="Favoritos">{fav.map(row)}</Command.Group> : null}
        {featured.length ? <Command.Group heading="Destacados · probados en el estudio">{featured.map(row)}</Command.Group> : null}
        {byBrand.map(([b, xs]) => <Command.Group key={b} heading={b}>{xs.map(row)}</Command.Group>)}
      </Command.List>
      <p className="dz-picker-foot"><kbd>↑</kbd><kbd>↓</kbd> moverse · <kbd>Enter</kbd> elegir · <kbd>Ctrl</kbd><kbd>Enter</kbd> favorito · <kbd>Esc</kbd> cerrar</p>
    </Command>
  );
}

export function ModelPicker({category, lockCategory = true, value, onChange, open, onOpenChange, phone, children}: {
  category: Category; lockCategory?: boolean; value: string; onChange: (id: string) => void;
  open: boolean; onOpenChange: (open: boolean) => void; phone: boolean; children: ReactNode;
}) {
  const [favourites, setFavourites] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setFavourites(f => { const n = new Set(f); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const list = <List category={category} lockCategory={lockCategory} value={value} favourites={favourites} toggle={toggle} onChange={id => { onChange(id); onOpenChange(false); }} />;
  if (phone) return (
    <>
      <span onClick={() => onOpenChange(true)} style={{display: 'contents'}}>{children}</span>
      <Sheet open={open} onOpenChange={onOpenChange} title="Elegir modelo">{list}</Sheet>
    </>
  );
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="dz-pop rc-layer" align="start" side="top" sideOffset={10} collisionPadding={16}>{list}</Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
