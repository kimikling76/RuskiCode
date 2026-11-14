'use client';
import {useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import {applyTheme, currentTheme} from '@/lib/theme';
import * as RadixMenu from '@radix-ui/react-dropdown-menu';
import {ArrowDownUp, ArrowUpRight, AtSign, BookOpen, Bot, Check, ChevronDown, ChevronRight, ChevronsUpDown, CircleHelp, Clapperboard, Folder, FolderOpen, FolderPlus, Gauge, Heart, House, LayoutGrid, LibraryBig, LogOut, Menu as MenuIcon, MessageSquare, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Plug, Plus, Search, Settings, Sparkles, SunMoon, Users, X} from 'lucide-react';
import {usePathname, useRouter} from 'next/navigation';
import Link from 'next/link';
import {usePersonal, type PersonalChat} from '@/store/personal-chat';
import {useShell} from '@/store/shell';
import {useChatDialogs} from './chat-dialogs';
import {Dialog} from '@/components/ui/dialog';
import {Menu, MenuTrigger, MenuContent, MenuItem, MenuLink, MenuSeparator, MenuLabel} from '@/components/ui/menu';
import {Tip} from '@/components/ui/tooltip';
import {authClient} from '@/lib/auth/client';
import {startSync} from '@/lib/sync/engine';
import {SidebarStatus} from './sidebar-status';
import {Sheet} from '@/components/ui/sheet';
import {Fold} from '@/components/diseno/pieces';
import {useStudioItems, type StudioItem} from '@/store/cinema-projects';
import {useProjectDialogs} from '@/components/estudio/projects';
import type {View as KinoView} from '@/components/estudio/sidebar';

export type StudioView = 'chat' | 'pdf' | 'cinema';

export const studios = [
  {id: 'chat', name: 'Chat', icon: MessageSquare},
  {id: 'pdf', name: 'PDF Studio', icon: BookOpen},
  {id: 'cinema', name: 'Cinema Studio', icon: Clapperboard},
] as const;

function lastActivity(chat: PersonalChat) {
  const stamp = chat.messages.at(-1)?.createdAt || chat.createdAt;
  const time = Date.parse(stamp);
  return Number.isFinite(time) ? time : 0;
}

function groupChats(chats: PersonalChat[]) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const today = startOfToday.getTime();
  const week = today - 6 * 86400000;
  const groups: {label: string; items: PersonalChat[]}[] = [
    {label: 'Hoy', items: []},
    {label: 'Últimos 7 días', items: []},
    {label: 'Anteriores', items: []},
  ];
  [...chats].sort((a, b) => lastActivity(b) - lastActivity(a)).forEach(chat => {
    const time = lastActivity(chat);
    groups[time >= today ? 0 : time >= week ? 1 : 2].items.push(chat);
  });
  return groups.filter(g => g.items.length);
}

/** Opens the mobile drawer. Each view places it at the start of its header; CSS shows it below 768px. */
export function NavTrigger() {
  const setDrawer = useShell(s => s.setDrawer);
  return (
    <button type="button" className="rc-icon-btn rc-nav-trigger" aria-label="Abrir navegación" onClick={() => setDrawer(true)}>
      <MenuIcon />
    </button>
  );
}

/** The four sections of the studio, each with its Cyrillic initial on one of the four pigments. */
export const sections = [
  {id: 'chat', letter: 'Ч', ru: 'Чат', es: 'Chat y asistentes', tone: 'lazur'},
  {id: 'kino', letter: 'К', ru: 'Кино', es: 'Estudio de cine: imagen y video', tone: 'kinovar'},
  {id: 'pages', letter: 'С', ru: 'Страницы', es: 'PDF Studio y el Manual', tone: 'ohra'},
  {id: 'cast', letter: 'Г', ru: 'Герои', es: 'Contexto del libro: personajes y lugares', tone: 'zelen'},
] as const;
export type SectionId = (typeof sections)[number]['id'];

const sectionOf = (view: StudioView | null, pathname: string): SectionId =>
  pathname.startsWith('/workspace/estudio') || view === 'cinema' ? 'kino' : pathname.startsWith('/workspace/libro') ? 'cast' : view === 'pdf' ? 'pages' : 'chat';

const kinoViews: KinoView['v'][] = ['home', 'gen', 'el', 'fav', 'all', 'project', 'folder'];
function readKinoView(): KinoView {
  const p = new URLSearchParams(window.location.search);
  const v = p.get('v') as KinoView['v'] | null;
  return v && kinoViews.includes(v) ? {v, ...(p.get('id') ? {id: p.get('id')!} : {})} : {v: 'home'};
}
/** The Estudio keeps its page in the address; the menu reads it there and changes it the same way. */
function useKino() {
  const pathname = usePathname();
  const router = useRouter();
  const inside = pathname === '/workspace/estudio';
  const [view, setView] = useState<KinoView | null>(null);
  useEffect(() => {
    const read = () => setView(inside ? readKinoView() : null);
    read();
    window.addEventListener('popstate', read);
    window.addEventListener('rc-estudio-view', read);
    return () => { window.removeEventListener('popstate', read); window.removeEventListener('rc-estudio-view', read); };
  }, [inside]);
  const go = (next: KinoView) => {
    const query = new URLSearchParams();
    if (next.v !== 'home') query.set('v', next.v);
    if (next.id) query.set('id', next.id);
    const url = '/workspace/estudio' + (query.size ? '?' + query : '');
    if (inside) { window.history.pushState(null, '', url); window.dispatchEvent(new PopStateEvent('popstate')); }
    else router.push(url);
  };
  return {view, go};
}

/** `editor`: an editor is open, so the navigation uses its own folded or unfolded choice (folded at first). */
export function StudioSidebar({view, editor, onNavigate, onNew}: {view: StudioView | null; editor?: boolean; onNavigate: (v: StudioView) => void; onNew: () => void}) {
  const drawer = useShell(s => s.drawer);
  const setDrawer = useShell(s => s.setDrawer);
  const collapsed = useShell(s => editor ? s.editorCollapsed : s.collapsed);
  const restore = useShell(s => s.restore);
  const [help, setHelp] = useState(false);

  useEffect(() => { restore(); startSync(); useStudioItems.getState().hydrate(); }, [restore]);

  // Close the sheet if the window grows past the mobile breakpoint.
  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const close = () => { if (media.matches) setDrawer(false); };
    media.addEventListener('change', close);
    return () => media.removeEventListener('change', close);
  }, [setDrawer]);

  function go(v: StudioView) { onNavigate(v); setDrawer(false); }
  function fresh() { onNew(); setDrawer(false); }

  return (
    <>
      <aside className="rc-sidebar rc-side" data-collapsed={collapsed ? 'true' : 'false'} aria-label="Navegación principal">
        <SidebarContent view={view} rail={collapsed} onGo={go} onNew={fresh} onHelp={() => setHelp(true)} />
      </aside>

      {/* On a phone the same menu rises from the bottom. */}
      <Sheet open={drawer} onOpenChange={setDrawer} title="Navegación">
        <SidebarContent view={view} rail={false} drawer onGo={go} onNew={fresh} onHelp={() => setHelp(true)} />
      </Sheet>

      <Dialog open={help} onClose={() => setHelp(false)} title="Cómo se organiza el estudio" description="Cuatro secciones comparten la cuenta del equipo. Cada una guarda su propio trabajo.">
        <div className="rc-dialog-body rc-help">
          <p><strong>Чат · Chat.</strong> Conversaciones con los modelos de Kie y tus asistentes. No asume que estés trabajando en un libro.</p>
          <p><strong>Кино · Estudio de cine.</strong> Imágenes y videos con Kie: crear, editar, planificar planos y guardar por proyecto.</p>
          <p><strong>Страницы · PDF Studio.</strong> Libros, PDF y unidades del manual, con páginas reales que se exportan a PDF.</p>
          <p><strong>Герои · Contexto del libro.</strong> Personajes, lugares, reglas y decisiones del libro.</p>
          <p>Lo que hacés se guarda en tu cuenta y aparece en tus otras computadoras. Abajo ves si está guardado y el saldo de Kie.</p>
        </div>
        <div className="rc-dialog-footer rc-dialog-footer--end">
          <button type="button" className="rc-btn rc-btn--primary" onClick={() => setHelp(false)}>Entendido</button>
        </div>
      </Dialog>
    </>
  );
}

function RailTip({rail, label, children}: {rail: boolean; label: string; children: ReactNode}) {
  return rail ? <Tip label={label} side="right">{children}</Tip> : <>{children}</>;
}

function Tile({letter, tone, size, children}: {letter?: string; tone: string; size?: 'sm'; children?: ReactNode}) {
  return <span className="dz-tile" data-tone={tone} data-size={size} aria-hidden="true">{children ?? letter}</span>;
}

type NavItem = {key: string; label: string; icon: typeof House; on: boolean; run?: () => void; href?: string};
const navTones = ['plain', 'ohra', 'lazur', 'zelen', 'kinovar', 'plain'];

function SidebarContent({view, rail, drawer, onGo, onNew, onHelp}: {view: StudioView | null; rail: boolean; drawer?: boolean; onGo: (v: StudioView) => void; onNew: () => void; onHelp: () => void}) {
  const toggleCollapsed = useShell(s => s.toggleCollapsed);
  const setDrawer = useShell(s => s.setDrawer);
  const data = usePersonal(s => s.data);
  const hydrated = usePersonal(s => s.hydrated);
  const select = usePersonal(s => s.select);
  const activeId = usePersonal(s => s.activeId);
  const dialogs = useChatDialogs();
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [signOutError, setSignOutError] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const section = sectionOf(view, pathname);
  const current = sections.find(s => s.id === section)!;
  const kino = useKino();
  const close = () => setDrawer(false);
  const goKino = (v: KinoView) => { kino.go(v); close(); };

  // Projects of the Estudio: the same tree it had in its own menu.
  const items = useStudioItems(s => s.items);
  const projectDialogs = useProjectDialogs(goKino);
  const [projectSearch, setProjectSearch] = useState(false);
  const [projectQuery, setProjectQuery] = useState('');
  const [byName, setByName] = useState(false);
  const [shut, setShut] = useState<Record<string, boolean>>({});
  const pq = projectQuery.trim().toLowerCase();
  const sort = (list: StudioItem[]) => [...list].sort((a, b) => byName ? a.name.localeCompare(b.name, 'es') : b.updatedAt - a.updatedAt);
  const folders = useMemo(() => sort(items.filter(i => i.type === 'folder')), [items, byName]); // eslint-disable-line react-hooks/exhaustive-deps
  const projects = useMemo(() => sort(items.filter(i => i.type === 'project' && (!pq || i.name.toLowerCase().includes(pq)))), [items, byName, pq]); // eslint-disable-line react-hooks/exhaustive-deps
  const inFolder = (id: string) => projects.filter(p => p.folder === id);
  const loose = projects.filter(p => !p.folder || !folders.some(f => f.id === p.folder));
  const shownFolders = folders.filter(f => !pq || f.name.toLowerCase().includes(pq) || inFolder(f.id).length);

  useEffect(() => { if (searching) search.current?.focus(); }, [searching]);

  const needle = query.trim().toLocaleLowerCase('es');
  const groups = useMemo(() => groupChats(data.chats.filter(c => c.title.toLocaleLowerCase('es').includes(needle))), [data.chats, needle]);

  async function signOut() {
    setSignOutError(false);
    try {
      const result = await authClient.signOut();
      if (result.error) throw Error();
      window.location.assign('/login');
    } catch {
      setSignOutError(true);
    }
  }

  function goSection(id: SectionId) {
    if (id === 'chat') onGo('chat');
    else if (id === 'pages') onGo('pdf');
    else { router.push(id === 'kino' ? '/workspace/estudio' : '/workspace/libro'); close(); }
  }

  const kv = kino.view?.v;
  const nav: NavItem[] = section === 'kino' ? [
    {key: 'home', label: 'Inicio', icon: House, on: kv === 'home', run: () => goKino({v: 'home'})},
    {key: 'gen', label: 'Mis generaciones', icon: Sparkles, on: kv === 'gen', run: () => goKino({v: 'gen'})},
    {key: 'el', label: 'Mis elementos', icon: AtSign, on: kv === 'el', run: () => goKino({v: 'el'})},
    {key: 'fav', label: 'Mis favoritos', icon: Heart, on: kv === 'fav', run: () => goKino({v: 'fav'})},
    {key: 'all', label: 'Todos los proyectos', icon: LayoutGrid, on: kv === 'all', run: () => goKino({v: 'all'})},
    {key: 'tabs', label: 'Imagen, video y planos', icon: Clapperboard, on: view === 'cinema' && pathname === '/workspace', run: () => onGo('cinema')},
  ] : section === 'pages' ? [
    {key: 'library', label: 'Biblioteca', icon: LibraryBig, on: pathname === '/workspace', run: () => onGo('pdf')},
  ] : section === 'cast' ? [
    {key: 'book', label: 'Contexto del libro', icon: Users, on: true, href: '/workspace/libro'},
  ] : [
    {key: 'new', label: 'Nuevo chat', icon: Plus, on: false, run: onNew},
    {key: 'assistants', label: 'Asistentes', icon: Bot, on: pathname === '/workspace/asistentes', href: '/workspace/asistentes'},
  ];

  const project = (p: StudioItem) => (
    <li key={p.id}>
      <button type="button" className="dz-row" aria-current={kino.view?.v === 'project' && kino.view.id === p.id ? 'page' : undefined} onClick={() => goKino({v: 'project', id: p.id})}>
        <Clapperboard aria-hidden="true" /><span>{p.name}</span>
      </button>
    </li>
  );

  const projectsFold = (
    <Fold key="projects" title="Proyectos" actions={
      <span className="dz-fold-actions">
        <Tip label="Buscar proyectos"><button type="button" className="dz-iconbtn" aria-label="Buscar proyectos" aria-pressed={projectSearch} onClick={() => { setProjectSearch(v => !v); setProjectQuery(''); }}><Search /></button></Tip>
        <Tip label={byName ? 'Ordenados por nombre' : 'Los más recientes primero'}><button type="button" className="dz-iconbtn" aria-label={'Ordenar: ' + (byName ? 'por nombre' : 'los más recientes primero')} onClick={() => setByName(v => !v)}><ArrowDownUp /></button></Tip>
      </span>
    }>
      {projectSearch ? <label className="dz-side-search"><span className="sr-only">Buscar proyectos</span><input type="search" className="rc-input" autoFocus placeholder="Nombre del proyecto" value={projectQuery} onChange={e => setProjectQuery(e.target.value)} /></label> : null}
      <button type="button" className="dz-row" onClick={() => projectDialogs.newItem('project')}><Plus aria-hidden="true" /><span>Nuevo proyecto</span></button>
      <button type="button" className="dz-row" onClick={() => projectDialogs.newItem('folder')}><FolderPlus aria-hidden="true" /><span>Nueva carpeta</span></button>
      <ul className="dz-tree">
        {shownFolders.map(f => {
          const closed = shut[f.id] && !pq;
          return (
            <li key={f.id}>
              <div className="dz-tree-folder">
                <button type="button" className="dz-iconbtn" aria-label={(closed ? 'Abrir ' : 'Cerrar ') + f.name} aria-expanded={!closed} onClick={() => setShut(c => ({...c, [f.id]: !closed}))}>{closed ? <ChevronRight /> : <ChevronDown />}</button>
                <button type="button" className="dz-row" aria-current={kino.view?.v === 'folder' && kino.view.id === f.id ? 'page' : undefined} onClick={() => goKino({v: 'folder', id: f.id})}>
                  {closed ? <Folder aria-hidden="true" /> : <FolderOpen aria-hidden="true" />}<span>{f.name}</span>
                </button>
              </div>
              {closed ? null : <ul className="dz-tree dz-tree--inner">{inFolder(f.id).map(project)}</ul>}
            </li>
          );
        })}
        {loose.map(project)}
      </ul>
      {pq && !projects.length && !shownFolders.length ? <p className="rc-history-empty">Nada con ese nombre.</p> : null}
    </Fold>
  );

  const chatsFold = (
    <Fold key="chats" title="Chats" actions={
      <span className="dz-fold-actions">
        <Tip label={searching ? 'Cerrar búsqueda' : 'Buscar chats'}>
          <button type="button" className="dz-iconbtn" aria-label={searching ? 'Cerrar búsqueda' : 'Buscar chats'} aria-expanded={searching} onClick={() => { setSearching(v => !v); setQuery(''); }}>{searching ? <X /> : <Search />}</button>
        </Tip>
      </span>
    }>
      {searching ? (
        <input
          ref={search} className="rc-input rc-history-search" type="search" aria-label="Buscar en los títulos de los chats" placeholder="Buscar por título"
          value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setQuery(''); setSearching(false); } }}
        />
      ) : null}
      <div className="rc-history-list">
        {!hydrated ? (
          <div className="rc-history-loading" role="status" aria-label="Cargando chats"><span className="rc-skeleton" /><span className="rc-skeleton" /><span className="rc-skeleton" /></div>
        ) : !data.chats.length ? (
          <p className="rc-history-empty">Tus conversaciones van a aparecer acá.</p>
        ) : !groups.length ? (
          <p className="rc-history-empty" role="status">Ningún chat tiene ese título.</p>
        ) : groups.map(group => (
          <div key={group.label} className="rc-history-group">
            <h3>{group.label}</h3>
            <ul>
              {group.items.map(chat => {
                const active = activeId === chat.id && view === 'chat';
                return (
                  <li key={chat.id} className="rc-history-row" data-active={active ? 'true' : undefined}>
                    <button type="button" className="rc-history-item" aria-current={active ? 'true' : undefined} title={chat.title} onClick={() => { select(chat.id); onGo('chat'); }}>{chat.title}</button>
                    <Menu>
                      <MenuTrigger asChild>
                        <button type="button" className="rc-icon-btn rc-icon-btn--sm rc-history-menu" aria-label={'Opciones de ' + chat.title}><MoreHorizontal /></button>
                      </MenuTrigger>
                      <MenuContent align="start">
                        <MenuItem onSelect={() => dialogs.openRename(chat.id)}>Renombrar</MenuItem>
                        <MenuItem danger onSelect={() => dialogs.openDelete(chat.id)}>Borrar</MenuItem>
                      </MenuContent>
                    </Menu>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Fold>
  );

  return (
    <div className="dz-side" data-collapsed={rail ? 'true' : undefined}>
      <div className="dz-side-top">
        <RadixMenu.Root>
          <RailTip rail={rail} label={'Sección: ' + current.ru}>
            <RadixMenu.Trigger asChild>
              <button type="button" className="dz-switch" aria-label={'Sección: ' + current.ru + ' (' + current.es.split(':')[0] + '). Cambiar de sección'}>
                <Tile letter={current.letter} tone={current.tone} />
                <span className="dz-switch-text"><strong lang="ru">{current.ru}</strong><small>{current.es.split(':')[0]}</small></span>
                <ChevronsUpDown aria-hidden="true" />
              </button>
            </RadixMenu.Trigger>
          </RailTip>
          <RadixMenu.Portal>
            <RadixMenu.Content className="dz-menu dz-menu--sections rc-layer" side="bottom" align="start" sideOffset={8} collisionPadding={12}>
              <RadixMenu.Label className="dz-menu-label">Ir a</RadixMenu.Label>
              {sections.map(x => (
                <RadixMenu.Item key={x.id} className="dz-menu-item dz-menu-item--section" onSelect={() => goSection(x.id)}>
                  <Tile letter={x.letter} tone={x.tone} /><span><strong lang="ru">{x.ru}</strong><small>{x.es}</small></span>{x.id === section ? <Check aria-hidden="true" /> : null}
                </RadixMenu.Item>
              ))}
            </RadixMenu.Content>
          </RadixMenu.Portal>
        </RadixMenu.Root>
        {drawer ? (
          <button type="button" className="dz-iconbtn" aria-label="Cerrar navegación" onClick={close}><X /></button>
        ) : (
          <Tip label={rail ? 'Mostrar el menú' : 'Esconder el menú'} side="right">
            <button type="button" className="dz-iconbtn dz-side-collapse" aria-label={rail ? 'Expandir navegación' : 'Plegar navegación'} aria-expanded={!rail} onClick={toggleCollapsed}>{rail ? <PanelLeftOpen /> : <PanelLeftClose />}</button>
          </Tip>
        )}
      </div>

      <nav aria-label={'Páginas de ' + current.ru}>
        <ul className="dz-nav">
          {nav.map((n, i) => {
            const inner = <><Tile tone={navTones[i % navTones.length]} size="sm"><n.icon /></Tile><span className="dz-side-hide">{n.label}</span></>;
            return (
              <li key={n.key}>
                <RailTip rail={rail} label={n.label}>
                  {n.href
                    ? <Link href={n.href} className="dz-nav-item" data-on={n.on ? 'true' : undefined} aria-current={n.on ? 'page' : undefined} aria-label={rail ? n.label : undefined} onClick={close}>{inner}</Link>
                    : <button type="button" className="dz-nav-item" data-on={n.on ? 'true' : undefined} aria-current={n.on ? 'page' : undefined} aria-label={rail ? n.label : undefined} onClick={n.run}>{inner}</button>}
                </RailTip>
              </li>
            );
          })}
        </ul>
      </nav>

      {rail ? <div className="rc-sidebar-spacer" /> : (
        <div className="dz-side-scroll">
          {section === 'chat' ? [chatsFold, projectsFold] : [projectsFold, chatsFold]}
        </div>
      )}

      <div className="rc-sidebar-foot dz-side-foot">
        <SidebarStatus rail={rail} />
        <Menu>
          <RailTip rail={rail} label="Cuenta y ajustes">
            <MenuTrigger asChild>
              <button type="button" className="rc-account">
                <span className="sr-only">Cuenta y ajustes: </span>
                <span className="rc-avatar" aria-hidden="true">RC</span>
                <span className="rc-rail-hide rc-account-text">
                  <strong>Equipo Русский код</strong>
                  <small>Espacio privado</small>
                </span>
                {!rail ? <Settings className="rc-account-icon" /> : null}
              </button>
            </MenuTrigger>
          </RailTip>
          <MenuContent align="start" side="top">
            <MenuLabel>Equipo Русский код</MenuLabel>
            <MenuLink href="/workspace/ajustes"><Settings />Ajustes y cuenta</MenuLink>
            <MenuLink href="/workspace/ajustes?seccion=uso"><Gauge />Uso y créditos</MenuLink>
            <MenuLink href="/workspace/ajustes?seccion=conectores"><Plug />Conectores y estado</MenuLink>
            <MenuItem onSelect={onHelp}><CircleHelp />Cómo se organiza el estudio</MenuItem>
            <MenuItem onSelect={() => applyTheme(currentTheme() === 'light' ? 'dark' : 'light')}><SunMoon />Cambiar entre modo oscuro y claro</MenuItem>
            <MenuLink href="/"><ArrowUpRight />Volver a la portada</MenuLink>
            <MenuSeparator />
            <MenuItem onSelect={signOut}><LogOut />Cerrar sesión</MenuItem>
          </MenuContent>
        </Menu>
        {signOutError ? <p className="rc-history-empty" role="alert">No se pudo cerrar la sesión. Probá de nuevo.</p> : null}
      </div>
      {projectDialogs.dialogs}
    </div>
  );
}
