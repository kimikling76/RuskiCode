'use client';
import {useEffect, useState} from 'react';
import Link from 'next/link';
import * as Tabs from '@radix-ui/react-tabs';
import {Clapperboard, Sparkles} from 'lucide-react';
import {useCinema, type CinemaJob} from '@/store/cinema';
import {useCinemaUi, cinemaTabs, type CinemaTab} from '@/store/cinema-ui';
import {NavTrigger} from '@/components/studio/sidebar';
import {videoModels, enabledStatus} from '@/lib/ai/models';
import {ImageTab} from './image-tab';
import {VideoTab} from './video-tab';
import {EditTab} from './edit-tab';
import {DirectTab, type CinemaProject} from './direct-tab';
import {GalleryTab} from './gallery-tab';
import {ImageViewer} from './image-viewer';

const videoReady = videoModels.some(enabledStatus);

const tabNames: Record<CinemaTab, string> = {image: 'Imagen', video: 'Video', edit: 'Editar', direct: 'Dirigir', gallery: 'Galería'};

export function CinemaStudio({projects, legacy, onOpenLegacy}: {projects: CinemaProject[]; legacy: {id: string; brief: string}[]; onOpenLegacy: (id: string) => void}) {
  const tab = useCinemaUi(s => s.tab);
  const setTab = useCinemaUi(s => s.setTab);
  const restoreAskFirst = useCinemaUi(s => s.restoreAskFirst);
  const storageError = useCinema(s => s.error);
  const [viewing, setViewing] = useState<CinemaJob | null>(null);

  useEffect(() => {
    restoreAskFirst();
    const saved = new URLSearchParams(window.location.search).get('tab');
    if (saved && (cinemaTabs as readonly string[]).includes(saved)) useCinemaUi.setState({tab: saved as CinemaTab});
  }, [restoreAskFirst]);

  return (
    <Tabs.Root className="rc-cinema" value={tab} onValueChange={v => setTab(v as CinemaTab)}>
      <header className="rc-topbar rc-cinema-bar">
        <NavTrigger />
        <div className="rc-studio-identity rc-cinema-identity">
          <Clapperboard aria-hidden="true" />
          <span>Cinema Studio</span>
        </div>
        <Tabs.List className="rc-tabs" aria-label="Herramientas de Cinema Studio">
          {cinemaTabs.map(id => (
            <Tabs.Trigger key={id} value={id} className="rc-tab">
              {tabNames[id]}
              {id === 'video' && !videoReady ? <span className="rc-tab-soon">Próximamente</span> : null}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Link href="/workspace/estudio" className="rc-cinema-estudio-link"><Sparkles aria-hidden="true" /><span>Estudio</span></Link>
      </header>
      {storageError ? <p className="rc-cinema-warning" role="alert">{storageError}</p> : null}
      <Tabs.Content value="image" className="rc-tab-panel"><ImageTab onOpen={setViewing} /></Tabs.Content>
      <Tabs.Content value="video" className="rc-tab-panel"><VideoTab onOpen={setViewing} /></Tabs.Content>
      <Tabs.Content value="edit" className="rc-tab-panel"><EditTab onOpen={setViewing} /></Tabs.Content>
      <Tabs.Content value="direct" className="rc-tab-panel"><DirectTab projects={projects} legacy={legacy} onOpenLegacy={onOpenLegacy} /></Tabs.Content>
      <Tabs.Content value="gallery" className="rc-tab-panel rc-tab-panel--scroll"><GalleryTab onOpen={setViewing} /></Tabs.Content>
      <ImageViewer job={viewing} onClose={() => setViewing(null)} />
    </Tabs.Root>
  );
}
