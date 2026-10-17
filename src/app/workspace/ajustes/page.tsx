import {Suspense} from 'react';
import {StudioShell} from '@/components/studio/studio-shell';
import {SettingsPage} from '@/components/settings/settings-page';

export const metadata = {title: 'Ajustes · Russian Code'};

export default function SettingsRoute() {
  return (
    <Suspense>
      <StudioShell view={null}><SettingsPage /></StudioShell>
    </Suspense>
  );
}
