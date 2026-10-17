'use client';
import {useEffect, useRef} from 'react';
import {useRouter, useSearchParams} from 'next/navigation';
import * as Tabs from '@radix-ui/react-tabs';
import {Settings} from 'lucide-react';
import {NavTrigger} from '@/components/studio/sidebar';
import {AccountSection} from './account-section';
import {PreferencesSection} from './preferences-section';
import {UsageSection} from './usage-section';
import {ConnectorsSection} from './connectors-section';
import {BrowserSection} from './browser-section';

const sections = [
  {id: 'cuenta', name: 'Cuenta', panel: AccountSection},
  {id: 'preferencias', name: 'Preferencias', panel: PreferencesSection},
  {id: 'uso', name: 'Uso y créditos', panel: UsageSection},
  {id: 'conectores', name: 'Conectores', panel: ConnectorsSection},
  {id: 'navegador', name: 'Este navegador', panel: BrowserSection},
] as const;
type SectionId = (typeof sections)[number]['id'];

export function SettingsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get('seccion');
  const section: SectionId = sections.some(s => s.id === requested) ? requested as SectionId : 'cuenta';
  const list = useRef<HTMLDivElement>(null);

  // On a phone the tab row scrolls sideways; keep the chosen section in view.
  useEffect(() => { list.current?.querySelector('[data-state=active]')?.scrollIntoView({block: 'nearest', inline: 'nearest'}); }, [section]);

  return (
    <div className="rc-settings">
      <header className="rc-topbar rc-topbar--mobile-only">
        <NavTrigger />
        <div className="rc-studio-identity"><Settings aria-hidden="true" />Ajustes</div>
      </header>
      <div className="rc-main-scroll rc-settings-scroll">
        <Tabs.Root className="rc-settings-page" value={section} onValueChange={v => router.replace('/workspace/ajustes?seccion=' + v, {scroll: false})}>
          <h1 className="rc-page-title rc-settings-title">Ajustes</h1>
          <Tabs.List ref={list} className="rc-tabs rc-settings-tabs" aria-label="Secciones de Ajustes">
            {sections.map(s => <Tabs.Trigger key={s.id} value={s.id} className="rc-tab">{s.name}</Tabs.Trigger>)}
          </Tabs.List>
          {sections.map(({id, panel: Panel}) => (
            <Tabs.Content key={id} value={id} className="rc-settings-panel">
              <Panel />
            </Tabs.Content>
          ))}
        </Tabs.Root>
      </div>
    </div>
  );
}
