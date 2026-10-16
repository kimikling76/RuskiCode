'use client';
import {useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import {Plus, MessageSquare, BookOpen, Clapperboard, MoreHorizontal, Menu as MenuIcon, X, Settings, Search, PanelLeftClose, ArrowUpRight, LogOut, CircleHelp} from 'lucide-react';
import {BrandMark, Wordmark} from './brand';
import {usePersonal, type PersonalChat} from '@/store/personal-chat';
import {useShell} from '@/store/shell';
import {useChatDialogs} from './chat-dialogs';
import {Dialog} from '@/components/ui/dialog';
import {Menu, MenuTrigger, MenuContent, MenuItem, MenuLink, MenuSeparator, MenuLabel} from '@/components/ui/menu';
import {Tip} from '@/components/ui/tooltip';
import {authClient} from '@/lib/auth/client';

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

export function StudioSidebar({view, onNavigate, onNew}: {view: StudioView; onNavigate: (v: StudioView) => void; onNew: () => void}) {
  const drawer = useShell(s => s.drawer);
  const setDrawer = useShell(s => s.setDrawer);
  const collapsed = useShell(s => s.collapsed);
  const restore = useShell(s => s.restore);
  const [help, setHelp] = useState(false);

  useEffect(() => { restore(); }, [restore]);

  // Close the drawer if the window grows past the mobile breakpoint.
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
      <aside className="rc-sidebar" data-collapsed={collapsed ? 'true' : 'false'} aria-label="Navegación principal">
        <SidebarContent view={view} rail={collapsed} onGo={go} onNew={fresh} onHelp={() => setHelp(true)} />
      </aside>

      <RadixDialog.Root open={drawer} onOpenChange={setDrawer}>
        <RadixDialog.Portal>
          <RadixDialog.Overlay className="rc-overlay rc-layer rc-drawer-overlay" />
          <RadixDialog.Content className="rc-drawer rc-layer" aria-describedby={undefined}>
            <RadixDialog.Title className="sr-only">Navegación</RadixDialog.Title>
            <SidebarContent view={view} rail={false} drawer onGo={go} onNew={fresh} onHelp={() => setHelp(true)} />
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>

      <Dialog open={help} onClose={() => setHelp(false)} title="Cómo se organiza el estudio" description="Chat, PDF Studio y Cinema Studio comparten la cuenta del equipo. Cada uno guarda su propio trabajo.">
        <div className="rc-dialog-body rc-help">
          <p><strong>Chat.</strong> Conversaciones personales con los modelos de Kie. No asume que estés trabajando en un libro.</p>
          <p><strong>PDF Studio.</strong> Proyectos de libros y documentos, y acceso al editor actual.</p>
          <p><strong>Cinema Studio.</strong> Proyectos de imagen y video. La generación se conecta por etapas.</p>
          <p>Para llevar una conversación a un estudio, usá «Convertir en proyecto». El chat original se conserva.</p>
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

function SidebarContent({view, rail, drawer, onGo, onNew, onHelp}: {view: StudioView; rail: boolean; drawer?: boolean; onGo: (v: StudioView) => void; onNew: () => void; onHelp: () => void}) {
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

  useEffect(() => { if (searching) search.current?.focus(); }, [searching]);

  const needle = query.trim().toLocaleLowerCase('es');
  const groups = useMemo(() => groupChats(data.chats.filter(c => c.title.toLocaleLowerCase('es').includes(needle))), [data.chats, needle]);
  const credits = data.usage.reduce((sum, entry) => sum + (entry.credits ?? 0), 0);
  const unreported = data.usage.filter(entry => entry.credits === undefined).length;

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

  return (
    <div className="rc-sidebar-inner">
      <div className="rc-sidebar-head">
        {rail ? (
          <Tip label="Expandir navegación" side="right">
            <button type="button" className="rc-icon-btn rc-sidebar-brand-rail" aria-label="Expandir navegación" onClick={toggleCollapsed}>
              <BrandMark />
            </button>
          </Tip>
        ) : (
          <>
            <button type="button" className="rc-sidebar-brand" onClick={() => onGo('chat')} aria-label="Russian Code, ir al Chat">
              <Wordmark />
            </button>
            {drawer ? (
              <button type="button" className="rc-icon-btn" aria-label="Cerrar navegación" onClick={() => setDrawer(false)}><X /></button>
            ) : (
              <Tip label="Plegar navegación" side="right">
                <button type="button" className="rc-icon-btn" aria-label="Plegar navegación" onClick={toggleCollapsed}><PanelLeftClose /></button>
              </Tip>
            )}
          </>
        )}
      </div>

      <RailTip rail={rail} label="Nuevo chat">
        <button type="button" className="rc-new-chat" onClick={onNew} aria-label={rail ? 'Nuevo chat' : undefined}>
          <Plus />
          <span className="rc-rail-hide">Nuevo chat</span>
        </button>
      </RailTip>

      <nav className="rc-nav" aria-label="Estudios">
        {studios.map(({id, name, icon: Icon}) => (
          <RailTip key={id} rail={rail} label={name}>
            <button
              type="button"
              className="rc-nav-item"
              data-studio={id}
              aria-current={view === id ? 'page' : undefined}
              aria-label={rail ? name : undefined}
              onClick={() => onGo(id)}
            >
              <Icon />
              <span className="rc-rail-hide">{name}</span>
            </button>
          </RailTip>
        ))}
      </nav>

      {rail ? <div className="rc-sidebar-spacer" /> : (
        <section className="rc-history" aria-label="Historial de chats">
          <div className="rc-history-head">
            <span>Chats</span>
            <Tip label={searching ? 'Cerrar búsqueda' : 'Buscar chats'}>
              <button
                type="button"
                className="rc-icon-btn rc-icon-btn--sm"
                aria-label={searching ? 'Cerrar búsqueda' : 'Buscar chats'}
                aria-expanded={searching}
                onClick={() => { setSearching(v => !v); setQuery(''); }}
              >
                {searching ? <X /> : <Search />}
              </button>
            </Tip>
          </div>
          {searching ? (
            <input
              ref={search}
              className="rc-input rc-history-search"
              type="search"
              aria-label="Buscar en los títulos de los chats"
              placeholder="Buscar por título"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setQuery(''); setSearching(false); } }}
            />
          ) : null}
          <div className="rc-history-list">
            {!hydrated ? (
              <div className="rc-history-loading" role="status" aria-label="Cargando chats">
                <span className="rc-skeleton" /><span className="rc-skeleton" /><span className="rc-skeleton" />
              </div>
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
                        <button
                          type="button"
                          className="rc-history-item"
                          aria-current={active ? 'true' : undefined}
                          title={chat.title}
                          onClick={() => { select(chat.id); onGo('chat'); }}
                        >
                          {chat.title}
                        </button>
                        <Menu>
                          <MenuTrigger asChild>
                            <button type="button" className="rc-icon-btn rc-icon-btn--sm rc-history-menu" aria-label={'Opciones de ' + chat.title}>
                              <MoreHorizontal />
                            </button>
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
        </section>
      )}

      <div className="rc-sidebar-foot">
        {!rail && credits > 0 ? (
          <Tip label={unreported ? 'Suma de lo que Kie informó en este navegador. Algunas respuestas no informan su costo.' : 'Suma de lo que Kie informó en este navegador.'}>
            <a className="rc-usage" href="https://kie.ai/logs" target="_blank" rel="noreferrer">
              <span>{credits.toLocaleString('es-AR')} créditos registrados</span>
              <ArrowUpRight />
            </a>
          </Tip>
        ) : null}
        <Menu>
          <RailTip rail={rail} label="Cuenta y ajustes">
            <MenuTrigger asChild>
              <button type="button" className="rc-account" aria-label="Cuenta y ajustes">
                <span className="rc-avatar" aria-hidden="true">RC</span>
                <span className="rc-rail-hide rc-account-text">
                  <strong>Equipo Russian Code</strong>
                  <small>Espacio privado</small>
                </span>
                {!rail ? <Settings className="rc-account-icon" /> : null}
              </button>
            </MenuTrigger>
          </RailTip>
          <MenuContent align="start" side="top">
            <MenuLabel>Equipo Russian Code</MenuLabel>
            <MenuItem onSelect={dialogs.openSettings}><Settings />Ajustes del Chat</MenuItem>
            <MenuItem onSelect={onHelp}><CircleHelp />Cómo se organiza el estudio</MenuItem>
            <MenuLink href="https://kie.ai/logs" external><ArrowUpRight />Registros de consumo en Kie</MenuLink>
            <MenuLink href="/"><ArrowUpRight />Volver a la portada</MenuLink>
            <MenuSeparator />
            <MenuItem onSelect={signOut}><LogOut />Cerrar sesión</MenuItem>
          </MenuContent>
        </Menu>
        {signOutError ? <p className="rc-history-empty" role="alert">No se pudo cerrar la sesión. Probá de nuevo.</p> : null}
      </div>
    </div>
  );
}
