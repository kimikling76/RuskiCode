'use client';
import {useSearchParams} from 'next/navigation';
import {DocumentEditor} from './document-editor';
import {OriginalEditor} from './original-editor';

/** /workspace/documento?id=… opens the page editor; &editor=texto opens Nutrient to edit text in place. */
export function DocumentRoute() {
  return useSearchParams().get('editor') === 'texto' ? <OriginalEditor /> : <DocumentEditor />;
}
