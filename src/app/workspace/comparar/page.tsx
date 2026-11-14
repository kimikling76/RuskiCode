import {Suspense} from 'react';
import {StudioShell} from '@/components/studio/studio-shell';
import {ModelCompare} from '@/components/manual/model-compare';

export const metadata = {title: 'Comparar modelos · PDF Studio · Russian Code'};

export default function ModelCompareRoute() {
  return (
    <Suspense>
      <StudioShell view="pdf"><ModelCompare /></StudioShell>
    </Suspense>
  );
}
