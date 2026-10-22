'use client';
import {useEffect, type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
import {StudioSidebar, type StudioView} from './sidebar';
import {ChatDialogs} from './chat-dialogs';
import {CinemaJobRunner} from '@/components/cinema/job-runner';
import {usePersonal} from '@/store/personal-chat';
import {useShell} from '@/store/shell';

/**
 * The workspace frame for pages outside /workspace (editor, settings): same sidebar, dialogs and job runner. An
 * `editor` opens with the navigation folded unless the person unfolded it there before.
 */
export function StudioShell({view, editor, children}: {view: StudioView | null; editor?: boolean; children: ReactNode}) {
  const router = useRouter();
  const hydrate = usePersonal(s => s.hydrate);
  const setEditor = useShell(s => s.setEditor);
  useEffect(() => { hydrate(); }, [hydrate]);
  useEffect(() => {
    if (!editor) return;
    setEditor(true);
    return () => setEditor(false);
  }, [editor, setEditor]);

  // Client-side navigation keeps the selected chat in memory.
  const go = (next: StudioView) => router.push('/workspace?studio=' + next);

  return (
    <div className="rc-app" data-studio={view || undefined}>
      <a href="#studio-main" className="rc-skip-link">Saltar al contenido</a>
      <StudioSidebar view={view} editor={editor} onNavigate={go} onNew={() => { usePersonal.getState().select(null); go('chat'); }} />
      <div className="rc-main">
        <main id="studio-main" className="rc-main-body" tabIndex={-1}>
          {children}
        </main>
      </div>
      <ChatDialogs onChat={() => go('chat')} />
      <CinemaJobRunner />
    </div>
  );
}
