import {Suspense} from 'react';
import {StudioShell} from '@/components/studio/studio-shell';
import {Estudio} from '@/components/estudio/estudio';

export const metadata = {title: 'Кино · Русский код'};

export default function EstudioRoute() {
  return (
    <Suspense>
      <StudioShell view="cinema"><Estudio /></StudioShell>
    </Suspense>
  );
}
