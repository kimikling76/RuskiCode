import {Suspense} from 'react';
import {StudioShell} from '@/components/studio/studio-shell';
import {ManualEditor} from '@/components/manual/manual-editor';

export const metadata = {title: 'Unidad del manual · PDF Studio · Russian Code'};

export default function ManualUnitPage() {
  return (
    <Suspense>
      <StudioShell view="pdf" editor><ManualEditor /></StudioShell>
    </Suspense>
  );
}
