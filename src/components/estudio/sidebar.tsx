'use client';
import {useMemo, useState, type ReactNode} from 'react';
import Link from 'next/link';
import {ArrowDownUp, AtSign, BookOpen, ChevronDown, ChevronRight, Clapperboard, Folder, FolderOpen, FolderPlus, Gauge, Heart, House, LayoutGrid, MessageSquare, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings, Sparkles, X} from 'lucide-react';
import {Menu, MenuContent, MenuItem, MenuLabel, MenuLink, MenuSeparator, MenuTrigger} from '@/components/ui/menu';
import {Tip} from '@/components/ui/tooltip';
import {useBalance} from '@/lib/ai/balance';
import {useStudioItems, type StudioItem} from '@/store/cinema-projects';

export type View = {v: 'home' | 'gen' | 'el' | 'fav' | 'all' | 'project' | 'folder'; id?: string};

const nav: {v: View['v']; name: string; icon: typeof House; tone: string}[] = [
  {v: 'home', name: 'Inicio', icon: House, tone: 'home'},
  {v: 'gen', name: 'Mis generaciones', icon: Sparkles, tone: 'gen'},
  {v: 'el', name: 'Mis elementos', icon: AtSign, tone: 'el'},
  {v: 'fav', name: 'Mis favoritos', icon: Heart, tone: 'fav'},
];

/** Folded, only the icons show: each one's name comes as a tooltip. */
function RailTip({on, label, children}: {on: boolean; label: string; children: ReactNode}) {
  return on ? <Tip label={label} side="right">{children}</Tip> : <>{children}</>;
}

/** The Estudio's own navigation: its pages, its projects and folders, the real balance and the account. */
export function EstudioSidebar({view, go, collapsed, onCollapse, onNew, onClose}: {
  view: View; go: (v: View) => void; collapsed: boolean; onCollapse: () => void;
  onNew: (type: 'project' | 'folder') => void; onClose?: () => void;
}) {
  const items = useStudioItems(s => s.items);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [byName, setByName] = useState(false);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const balance = useBalance();
  const open = (v: View) => { go(v); onClose?.(); };

  const sort = (list: StudioItem[]) => [...list].sort((a, b) => byName ? a.name.localeCompare(b.name, 'es') : b.updatedAt - a.updatedAt);
  const q = query.trim().toLowerCase();
  const folders = useMemo(() => sort(items.filter(i => i.type === 'folder')), [items, byName]); // eslint-disable-line react-hooks/exhaustive-deps
  const projects = useMemo(() => sort(items.filter(i => i.type === 'project' && (!q || i.name.toLowerCase().includes(q)))), [items, byName, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const inFolder = (id: string) => projects.filter(p => p.folder === id);
  const loose = projects.filter(p => !p.folder || !folders.some(f => f.id === p.folder));
  const shownFolders = folders.filter(f => !q || f.name.toLowerCase().includes(q) || inFolder(f.id).length);

  const item = (p: StudioItem) => (
    <li key={p.id}>
      <button type="button" className="rc-es-tree-item" aria-current={view.v === 'project' && view.id === p.id ? 'page' : undefined} onClick={() => open({v: 'project', id: p.id})}>
        <Clapperboard aria-hidden="true" /><span>{p.name}</span>
      </button>
    </li>
  );

  return (
    <aside className="rc-es-side" data-collapsed={collapsed ? 'true' : undefined} aria-label="Estudio">
      <div className="rc-es-side-head">
        <Menu>
          <MenuTrigger asChild>
            <button type="button" className="rc-es-workspace" aria-label="Cambiar de estudio: Cinema Studio">
              <span className="rc-es-logo" aria-hidden="true"><Clapperboard /></span>
              <span className="rc-es-hide">Cinema Studio</span>
              <ChevronDown className="rc-es-hide" aria-hidden="true" />
            </button>
          </MenuTrigger>
          <MenuContent align="start">
            <MenuLabel>Cambiar de estudio</MenuLabel>
            <MenuLink href="/workspace?studio=chat"><MessageSquare />Chat</MenuLink>
            <MenuLink href="/workspace?studio=pdf"><BookOpen />PDF Studio</MenuLink>
            <MenuLink href="/workspace?studio=cinema"><LayoutGrid />Cinema Studio · pestañas</MenuLink>
            <MenuItem onSelect={() => open({v: 'home'})}><Clapperboard />Cinema Studio · Estudio</MenuItem>
          </MenuContent>
        </Menu>
        {onClose ? (
          <button type="button" className="rc-icon-btn rc-es-collapse" aria-label="Cerrar el menú del Estudio" onClick={onClose}><X /></button>
        ) : (
          <Tip label={collapsed ? 'Expandir' : 'Plegar'}>
            <button type="button" className="rc-icon-btn rc-es-collapse" aria-label={collapsed ? 'Expandir el menú del Estudio' : 'Plegar el menú del Estudio'} aria-expanded={!collapsed} onClick={onCollapse}>
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </button>
          </Tip>
        )}
      </div>

      <nav className="rc-es-nav" aria-label="Páginas del Estudio">
        {nav.map(n => (
          <RailTip key={n.v} on={collapsed} label={n.name}>
            <button type="button" className="rc-es-nav-item" aria-label={collapsed ? n.name : undefined} aria-current={view.v === n.v ? 'page' : undefined} onClick={() => open({v: n.v})}>
              <span className="rc-es-nav-icon" data-tone={n.tone} aria-hidden="true"><n.icon /></span>
              <span className="rc-es-hide">{n.name}</span>
            </button>
          </RailTip>
        ))}
      </nav>

      <div className="rc-es-projects rc-es-hide">
        <div className="rc-es-section-head">
          <h2>Proyectos</h2>
          <Tip label="Buscar proyectos"><button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label="Buscar proyectos" aria-pressed={searching} onClick={() => { setSearching(v => !v); setQuery(''); }}><Search /></button></Tip>
          <Tip label={byName ? 'Ordenados por nombre' : 'Los más recientes primero'}><button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label={'Ordenar: ' + (byName ? 'por nombre' : 'los más recientes primero')} onClick={() => setByName(v => !v)}><ArrowDownUp /></button></Tip>
        </div>
        {searching ? (
          <label className="rc-es-search"><span className="sr-only">Buscar proyectos</span><input type="search" className="rc-input" autoFocus placeholder="Nombre del proyecto" value={query} onChange={e => setQuery(e.target.value)} /></label>
        ) : null}
        <button type="button" className="rc-es-tree-item rc-es-tree-add" onClick={() => onNew('project')}><Plus aria-hidden="true" /><span>Nuevo proyecto</span></button>
        <button type="button" className="rc-es-tree-item rc-es-tree-add" onClick={() => onNew('folder')}><FolderPlus aria-hidden="true" /><span>Nueva carpeta</span></button>
        <ul className="rc-es-tree">
          {shownFolders.map(f => {
            const shut = closed[f.id] && !q;
            return (
              <li key={f.id}>
                <div className="rc-es-tree-folder">
                  <button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label={(shut ? 'Abrir ' : 'Cerrar ') + f.name} aria-expanded={!shut} onClick={() => setClosed(c => ({...c, [f.id]: !shut}))}>{shut ? <ChevronRight /> : <ChevronDown />}</button>
                  <button type="button" className="rc-es-tree-item" aria-current={view.v === 'folder' && view.id === f.id ? 'page' : undefined} onClick={() => open({v: 'folder', id: f.id})}>
                    {shut ? <Folder aria-hidden="true" /> : <FolderOpen aria-hidden="true" />}<span>{f.name}</span>
                  </button>
                </div>
                {shut ? null : <ul className="rc-es-tree rc-es-tree--inner">{inFolder(f.id).map(item)}</ul>}
              </li>
            );
          })}
          {loose.map(item)}
        </ul>
        {q && !projects.length && !shownFolders.length ? <p className="rc-hint">Nada con ese nombre.</p> : null}
      </div>

      <div className="rc-es-side-foot">
        <RailTip on={collapsed} label="Todos los proyectos">
          <button type="button" className="rc-es-nav-item" aria-label={collapsed ? 'Todos los proyectos' : undefined} aria-current={view.v === 'all' ? 'page' : undefined} onClick={() => open({v: 'all'})}>
            <span className="rc-es-nav-icon" data-tone="all" aria-hidden="true"><LayoutGrid /></span>
            <span className="rc-es-hide">Todos los proyectos</span>
            <ChevronRight className="rc-es-hide rc-es-push" aria-hidden="true" />
          </button>
        </RailTip>
        {/* The real balance Kie reports; never an estimate. */}
        <Link href="/workspace/ajustes?seccion=uso" className="rc-es-balance" aria-label={collapsed ? 'Saldo en Kie: ' + (balance.data ? balance.data.credits.toLocaleString('es-AR', {maximumFractionDigits: 1}) + ' créditos' : 'consultando') : undefined}>
          <Gauge aria-hidden="true" />
          <span className="rc-es-hide">
            <small>Saldo en Kie</small>
            <strong>{balance.data ? balance.data.credits.toLocaleString('es-AR', {maximumFractionDigits: 1}) + ' créditos' : balance.isError ? 'No disponible' : 'Consultando…'}</strong>
          </span>
        </Link>
        <Menu>
          <MenuTrigger asChild>
            <button type="button" className="rc-es-account" aria-label={collapsed ? 'Cuenta RC: Equipo Russian Code, ajustes' : undefined}>
              <span className="rc-avatar" aria-hidden="true">RC</span>
              <span className="rc-es-hide"><strong>Equipo Russian Code</strong><small>Espacio privado</small></span>
            </button>
          </MenuTrigger>
          <MenuContent align="start" side="top">
            <MenuLabel>Equipo Russian Code</MenuLabel>
            <MenuLink href="/workspace/ajustes"><Settings />Ajustes y cuenta</MenuLink>
            <MenuSeparator />
            <MenuLink href="/workspace/ajustes?seccion=uso"><Gauge />Uso y créditos</MenuLink>
          </MenuContent>
        </Menu>
      </div>
    </aside>
  );
}
