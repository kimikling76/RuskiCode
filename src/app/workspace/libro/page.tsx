import {Suspense} from 'react';
import {StudioShell} from '@/components/studio/studio-shell';
import {BookKnowledgePage} from '@/components/kb/book-page';

export const metadata = {title: 'Contexto del libro · PDF Studio · Russian Code'};

export default function BookKnowledgeRoute() {
  return (
    <Suspense>
      <StudioShell view="pdf"><BookKnowledgePage /></StudioShell>
    </Suspense>
  );
}
