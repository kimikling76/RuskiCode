import {Suspense} from 'react';
import {StudioShell} from '@/components/studio/studio-shell';
import {AssistantsPage} from '@/components/assistants/assistants-page';

export const metadata = {title: 'Asistentes · Russian Code'};

export default function AssistantsRoute() {
  return (
    <Suspense>
      <StudioShell view={null}><AssistantsPage /></StudioShell>
    </Suspense>
  );
}
