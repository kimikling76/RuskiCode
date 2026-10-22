import {Suspense} from 'react';
import {StudioShell} from '@/components/studio/studio-shell';
import {BookEditor} from '@/components/pdf/book-editor';

export const metadata = {title: 'Editor · PDF Studio · Russian Code'};

export default function EditorPage() {
  return (
    <Suspense>
      <StudioShell view="pdf" editor><BookEditor /></StudioShell>
    </Suspense>
  );
}
