import {Suspense} from 'react';
import {StudioShell} from '@/components/studio/studio-shell';
import {DocumentRoute} from '@/components/pdf/document-route';

export const metadata = {title: 'PDF importado · PDF Studio · Russian Code'};

export default function OriginalPdfPage() {
  return (
    <Suspense>
      <StudioShell view="pdf" editor><DocumentRoute /></StudioShell>
    </Suspense>
  );
}
