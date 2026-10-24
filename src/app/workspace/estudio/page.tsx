import {Suspense} from 'react';
import {StudioShell} from '@/components/studio/studio-shell';
import {Estudio} from '@/components/estudio/estudio';

export const metadata = {title: 'Estudio · Cinema Studio · Russian Code'};

export default function EstudioRoute() {
  return (
    <Suspense>
      <StudioShell view="cinema" editor><Estudio /></StudioShell>
    </Suspense>
  );
}
