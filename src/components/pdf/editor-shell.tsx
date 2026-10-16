'use client';
import {useEffect} from 'react';
import {useRouter} from 'next/navigation';
import {StudioSidebar, type StudioView} from '@/components/studio/sidebar';
import {ChatDialogs} from '@/components/studio/chat-dialogs';
import {CinemaJobRunner} from '@/components/cinema/job-runner';
import {usePersonal} from '@/store/personal-chat';
import {BookEditor} from './book-editor';

/** The page editor inside the same shell as the rest of the workspace. */
export function EditorShell() {
  const router = useRouter();
  const hydrate = usePersonal(s => s.hydrate);
  useEffect(() => { hydrate(); }, [hydrate]);

  // Client-side navigation keeps the selected chat in memory.
  const go = (view: StudioView) => router.push('/workspace?studio=' + view);

  return (
    <div className="rc-app" data-studio="pdf">
      <a href="#studio-main" className="rc-skip-link">Saltar al contenido</a>
      <StudioSidebar view="pdf" onNavigate={go} onNew={() => { usePersonal.getState().select(null); go('chat'); }} />
      <div className="rc-main">
        <main id="studio-main" className="rc-main-body" tabIndex={-1}>
          <BookEditor />
        </main>
      </div>
      <ChatDialogs onChat={() => go('chat')} />
      <CinemaJobRunner />
    </div>
  );
}
