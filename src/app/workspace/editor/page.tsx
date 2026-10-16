import {Suspense} from 'react';
import {EditorShell} from '@/components/pdf/editor-shell';

export const metadata = {title: 'Editor · PDF Studio · Russian Code'};

export default function EditorPage() {
  return <Suspense><EditorShell /></Suspense>;
}
