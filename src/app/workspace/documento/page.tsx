import {Suspense} from 'react';
import {StudioShell} from '@/components/studio/studio-shell';
import {OriginalEditor} from '@/components/pdf/original-editor';

export const metadata = {title: 'PDF original · PDF Studio · Russian Code'};

export default function OriginalPdfPage() {
  return (
    <Suspense>
      <StudioShell view="pdf"><OriginalEditor /></StudioShell>
    </Suspense>
  );
}
