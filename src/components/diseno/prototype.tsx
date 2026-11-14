'use client';
import {useEffect, useRef, useState, type ReactNode} from 'react';
import Link from 'next/link';
import * as RadixMenu from '@radix-ui/react-dropdown-menu';
import * as Tabs from '@radix-ui/react-tabs';
import TextareaAutosize from 'react-textarea-autosize';
import {AnimatePresence, LayoutGroup, MotionConfig, motion} from 'framer-motion';
import {toast} from 'sonner';
import {ArrowDownUp, AtSign, BookMarked, Check, ChevronsUpDown, Film, FolderOpen, Globe, Heart, Home, Image as ImageIcon, Menu, Music, PanelLeftClose, PanelLeftOpen, Pencil, Play, Plug, Plus, Search, Settings, SlidersHorizontal, Slash, SunMoon, Upload, Video, Wand2, Zap} from 'lucide-react';
import {Switch} from '@/components/ui/switch';
import {Sheet} from '@/components/ui/sheet';
import {Spotlight} from '@/components/ui/spotlight';
import {TextShimmer} from '@/components/ui/text-shimmer';
import {applyTheme, currentTheme} from '@/lib/theme';
import {savedUrl} from '@/lib/cinema/keep';
import {KieImage} from '@/components/cinema/job-card';
import {useCinema} from '@/store/cinema';
import {chats, elements, firstOf, letters, models, priceOf, projects, sections, seedTiles, type SectionId, type Tile as TileData} from './data';
import {ModelPicker, Tile} from './model-picker';
import {Fold, GoButton, Pill, Results, TogglePill, soft, spring, usePhone} from './pieces';

// The design prototype: the approved layouts built with the site's real pieces (Radix, cmdk, framer-motion, Sonner,
// Vaul) and example data, so they can be used and felt. Nothing here asks Kie for anything or changes any saved data.

type KinoView = 'inicio' | 'imagen' | 'video';
const say = (text: string) => toast(text);
const modelOf = (id: string) => models.find(m => m.id === id)!;

function useShortcut(key: string, run: () => void) {
  const ref = useRef(run);
  ref.current = run;
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === key) { e.preventDefault(); ref.current(); } };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [key]);
}

function ElementsMenu({onPick}: {onPick: (name: string) => void}) {
  return (
    <RadixMenu.Root>
      <RadixMenu.Trigger asChild><button type="button" className="dz-pill dz-pill--icon" aria-label="Sumar un personaje o un lugar"><AtSign /></button></RadixMenu.Trigger>
      <RadixMenu.Portal>
        <RadixMenu.Content className="dz-menu rc-layer" side="top" align="start" sideOffset={8} collisionPadding={12}>
          <RadixMenu.Label className="dz-menu-label">Elementos del libro</RadixMenu.Label>
          {elements.map(e => <RadixMenu.Item key={e} className="dz-menu-item" onSelect={() => onPick(e)}><span>{e}</span></RadixMenu.Item>)}
        </RadixMenu.Content>
      </RadixMenu.Portal>
    </RadixMenu.Root>
  );
}

function ModelPill({category, value, onChange, phone, hotkey}: {category: 'text' | 'image' | 'video'; value: string; onChange: (id: string) => void; phone: boolean; hotkey?: boolean}) {
  const [open, setOpen] = useState(false);
  useShortcut('m', () => { if (hotkey) setOpen(true); });
  const m = modelOf(value);
  return (
    <ModelPicker category={category} value={value} onChange={onChange} open={open} onOpenChange={setOpen} phone={phone}>
      <button type="button" className="dz-pill dz-pill--model" aria-label={'Modelo: ' + m.name}><Tile letter={m.provider[0]} size="sm" tone="plain" /><span>{m.name}</span><ChevronsUpDown className="dz-pill-caret" aria-hidden="true" /></button>
    </ModelPicker>
  );
}

/** The image composer: a big box that floats, pills with the model's real options and the key with the price. */
function ImageComposer({prompt, setPrompt, onGenerate, phone, config, modes}: {prompt: string; setPrompt: (p: string) => void; onGenerate: (count: number) => void; phone: boolean; config?: ReactNode; modes?: ReactNode}) {
  const [model, setModel] = useState(firstOf('image').id);
  const m = modelOf(model);
  const o = m.options!;
  const [aspect, setAspect] = useState('');
  const [quality, setQuality] = useState('');
  const [count, setCount] = useState('1');
  const [busy, setBusy] = useState(false);
  const a = o.aspects.includes(aspect) ? aspect : o.aspects[0] || '';
  const q = o.resolutions.includes(quality) ? quality : o.resolutions[0] || '';
  const go = () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    window.setTimeout(() => { setBusy(false); onGenerate(Number(count)); }, 450);
  };
  useShortcut('enter', go);
  return (
    <motion.div layout className="dz-composer" transition={soft}>
      {config}
      <TextareaAutosize className="dz-input" minRows={phone ? 2 : 1} maxRows={6} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Describí la escena que imaginás" aria-label="Escena" />
      <div className="dz-bar dz-bar--go">
        <div className="dz-bar">
        {modes}
        <button type="button" className="dz-pill dz-pill--icon" aria-label="Agregar referencias" onClick={() => say('Acá se abren tus referencias: galería o archivos.')}><Plus /></button>
        <ElementsMenu onPick={e => setPrompt((prompt ? prompt + ' ' : '') + '@' + e + ' ')} />
        <ModelPill category="image" value={model} onChange={setModel} phone={phone} hotkey />
        <Pill label="Formato" value={a} options={o.aspects} onChange={setAspect} />
        <Pill label={o.resolutionLabel} value={q} options={o.resolutions} onChange={setQuality} />
        <Pill label="Cantidad" value={count} options={['1', '2', '3', '4']} onChange={setCount} />
        </div>
        <GoButton verb="Generar" price={priceOf(m, Number(count))} busy={busy} disabled={!prompt.trim()} beam onClick={go} wide={phone} />
      </div>
    </motion.div>
  );
}

/** The person's own finished pictures, read from the gallery this browser has. Only read: nothing is asked or saved. */
function useOwnPictures() {
  const hydrate = useCinema(s => s.hydrate);
  const jobs = useCinema(s => s.data.jobs);
  useEffect(() => { hydrate(); }, [hydrate]);
  return jobs.filter(j => j.state === 'success' && j.mode !== 'video' && j.urls[0]).slice(0, 12).map(j => ({id: j.id, src: j.urls[0], fallback: savedUrl(j) || undefined, prompt: j.prompt}));
}

function useTiles() {
  const own = useOwnPictures();
  const [tiles, setTiles] = useState<TileData[]>(seedTiles);
  // With pictures of their own, the examples give way to them (the two failed examples stay, to show that state).
  useEffect(() => {
    if (!own.length) return;
    setTiles(t => (t.some(x => x.src) ? t : [...own.map((p, i) => ({id: 'own-' + p.id, letter: 'А', tone: i, state: 'done' as const, prompt: p.prompt, src: p.src, fallback: p.fallback})), ...t.filter(x => x.state === 'failed')]));
  }, [own.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const add = (count: number, prompt: string) => {
    const fresh: TileData[] = Array.from({length: count}, (_, i) => ({id: 'n' + Date.now() + i, letter: letters[Math.floor(Math.random() * letters.length)], tone: Math.floor(Math.random() * 4), state: 'working', prompt}));
    setTiles(t => [...fresh, ...t]);
    window.setTimeout(() => {
      setTiles(t => t.map(x => (fresh.some(f => f.id === x.id) ? {...x, state: 'done', cost: 6} : x)));
      toast(count === 1 ? 'Imagen de ejemplo lista.' : count + ' imágenes de ejemplo listas.', {description: 'En el sitio real acá se ve el costo que informó Kie.'});
    }, 2800);
  };
  const remove = (id: string) => {
    const gone = tiles.find(t => t.id === id);
    setTiles(t => t.filter(x => x.id !== id));
    if (gone) toast('Borrada.', {action: {label: 'Deshacer', onClick: () => setTiles(t => [gone, ...t])}});
  };
  return {tiles, add, remove};
}

function ImageScreen({phone}: {phone: boolean}) {
  const {tiles, add, remove} = useTiles();
  const [prompt, setPrompt] = useState('');
  const [filter, setFilter] = useState('todas');
  const shown = tiles.filter(t => filter === 'todas' || (filter === 'fallidas' ? t.state === 'failed' : t.state === 'done'));
  return (
    <div className="dz-screen dz-screen--grid" data-letter="К">
      <header className="dz-head">
        <h1 className="dz-title">Imagen</h1>
        <div className="dz-tabs" role="group" aria-label="Qué mostrar">
          {[['todas', 'Todas'], ['listas', 'Listas'], ['fallidas', 'Fallidas']].map(([v, l]) => <button key={v} type="button" className="dz-tab" aria-pressed={filter === v} onClick={() => setFilter(v)}>{l}{filter === v ? <motion.span layoutId="tab-image" className="dz-tab-line" transition={spring} /> : null}</button>)}
        </div>
      </header>
      {shown.length ? <Results tiles={shown} onReuse={p => { setPrompt(p); say('Prompt copiado a la caja.'); }} onRemove={remove} />
        : <div className="dz-empty"><p>No hay nada acá todavía.</p><button type="button" className="dz-pill" onClick={() => { setFilter('todas'); setPrompt('Una calle con nieve, de noche'); }}>Probar con un ejemplo</button></div>}
      <div className="dz-float"><ImageComposer prompt={prompt} setPrompt={setPrompt} onGenerate={n => add(n, prompt)} phone={phone} /></div>
    </div>
  );
}

const looks = [['Referencias', '0/10'], ['Película', 'Auto'], ['Cámara', 'Auto'], ['Paleta', 'Auto'], ['Luz', 'Auto']] as const;
const lookOptions: Record<string, string[]> = {Película: ['Auto', '35 mm', 'Súper 8', 'Digital'], Cámara: ['Auto', 'Plano general', 'Primer plano', 'Cenital'], Paleta: ['Auto', 'Cálida', 'Fría', 'Blanco y negro'], Luz: ['Auto', 'Día', 'Hora dorada', 'Noche']};

function HomeScreen({phone, onVideo}: {phone: boolean; onVideo: () => void}) {
  const {tiles, add, remove} = useTiles();
  const [prompt, setPrompt] = useState('');
  const [look, setLook] = useState<Record<string, string>>({});
  const config = (
    <div className="dz-looks">
      {looks.map(([name, value]) => name === 'Referencias'
        ? <button key={name} type="button" className="dz-look" onClick={() => say('Acá se abren tus referencias: galería o archivos.')}><span className="dz-look-pic"><Plus /></span><span><small>{name}</small><strong>{value}</strong></span></button>
        : (
          <RadixMenu.Root key={name}>
            <RadixMenu.Trigger asChild><button type="button" className="dz-look"><span className="dz-look-pic" data-kind={name} /><span><small>{name}</small><strong>{look[name] || value}</strong></span></button></RadixMenu.Trigger>
            <RadixMenu.Portal>
              <RadixMenu.Content className="dz-menu rc-layer" side="top" align="start" sideOffset={8} collisionPadding={12}>
                <RadixMenu.Label className="dz-menu-label">{name}</RadixMenu.Label>
                <RadixMenu.RadioGroup value={look[name] || 'Auto'} onValueChange={v => setLook(l => ({...l, [name]: v}))}>
                  {lookOptions[name].map(o => <RadixMenu.RadioItem key={o} value={o} className="dz-menu-item"><span>{o}</span><RadixMenu.ItemIndicator><Check aria-hidden="true" /></RadixMenu.ItemIndicator></RadixMenu.RadioItem>)}
                </RadixMenu.RadioGroup>
              </RadixMenu.Content>
            </RadixMenu.Portal>
          </RadixMenu.Root>
        ))}
    </div>
  );
  const modes = (
    <span className="dz-modes" role="group" aria-label="Qué generar">
      <button type="button" aria-pressed="true"><ImageIcon />Imagen</button>
      <button type="button" aria-pressed="false" onClick={onVideo}><Video />Video</button>
    </span>
  );
  const done = tiles.filter(t => t.state === 'done').slice(0, 3);
  return (
    <div className="dz-screen dz-screen--home" data-letter="К">
      <div className="dz-fan" aria-hidden="true">
        {done.map((t, i) => <motion.span key={t.id} className="dz-fan-card" data-pos={i} style={{background: ['#2A3D57', '#3A4A34', '#5A2A1C'][i]}} whileHover={{y: -6, rotate: 0}} transition={soft}>{t.src ? <KieImage className="dz-photo" src={t.src} fallback={t.fallback} alt="" /> : <i>{t.letter}{t.letter.toLowerCase()}</i>}</motion.span>)}
      </div>
      <h1 className="dz-poster" lang="ru">Кино</h1>
      <p className="dz-lead">Estudio de cine del libro</p>
      <div className="dz-center"><ImageComposer prompt={prompt} setPrompt={setPrompt} onGenerate={n => add(n, prompt)} phone={phone} config={config} modes={modes} /></div>
      <section className="dz-block" aria-label="Últimos resultados">
        <h2 className="dz-h2">Últimos resultados</h2>
        <Results tiles={tiles.slice(0, phone ? 4 : 5)} onReuse={setPrompt} onRemove={remove} />
      </section>
      <section className="dz-block" aria-label="Mis proyectos">
        <h2 className="dz-h2">Mis proyectos</h2>
        <div className="dz-posters">
          <motion.button type="button" className="dz-poster-card dz-poster-card--new" whileHover={{y: -4}} whileTap={{scale: 0.98}} transition={soft} onClick={() => say('Acá se crea un proyecto.')}><Plus /><span>Crear proyecto</span></motion.button>
          {projects.map((p, i) => { const pic = tiles.filter(t => t.src)[i]; return <motion.button key={p} type="button" className="dz-poster-card" data-photo={pic ? 'true' : undefined} style={{background: ['#5A2A1C', '#2A3D57', '#3A4A34'][i]}} whileHover={{y: -4}} whileTap={{scale: 0.98}} transition={soft} onClick={() => say('Acá se abre «' + p + '».')}>{pic ? <KieImage className="dz-photo" src={pic.src!} fallback={pic.fallback} alt="" /> : <i>{p.split(' ').map(w => w[0]).join('').toUpperCase()}</i>}<span>{p}</span></motion.button>; })}
        </div>
      </section>
    </div>
  );
}

function VideoPanel({phone, onGenerate}: {phone: boolean; onGenerate: () => void}) {
  const [model, setModel] = useState(firstOf('video').id);
  const [pick, setPick] = useState(false);
  const m = modelOf(model);
  const o = m.options!;
  const [tab, setTab] = useState('refs');
  const [prompt, setPrompt] = useState('');
  const [set, setSet] = useState<Record<string, string>>({});
  const [frames, setFrames] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const val = (k: string, xs: string[]) => (xs.includes(set[k]) ? set[k] : xs[0] || '');
  const grid = ([['Duración', o.durations.map(d => d + ' s')], ['Formato', o.aspects], [o.resolutionLabel, o.resolutions], ['Variaciones', ['1', '2']]] as [string, string[]][]).filter(([, xs]) => xs.length);
  const tabs = [['refs', 'Referencias'], ['frames', 'Cuadros'], ['audio', 'Audio']];
  const go = () => { if (!prompt.trim() || busy) return; setBusy(true); window.setTimeout(() => { setBusy(false); onGenerate(); }, 450); };
  return (
    <div className="dz-panel">
      <div className="dz-panel-scroll">
        <ModelPicker category="video" value={model} onChange={setModel} open={pick} onOpenChange={setPick} phone={phone}>
          <button type="button" className="dz-modelcard" aria-label={'Modelo: ' + m.name + '. Cambiar'}>
            <Spotlight />
            <span className="dz-modelcard-change"><Pencil aria-hidden="true" />Cambiar</span>
            <strong>{m.name}</strong>
            <small>{m.fact}</small>
          </button>
        </ModelPicker>
        <Tabs.Root value={tab} onValueChange={setTab}>
          <Tabs.List className="dz-seg" aria-label="Qué sumar al video">
            {tabs.map(([v, l]) => <Tabs.Trigger key={v} value={v} className="dz-seg-item">{tab === v ? <motion.span layoutId="seg-video" className="dz-seg-on" transition={spring} /> : null}<span>{l}</span></Tabs.Trigger>)}
          </Tabs.List>
          <Tabs.Content value="refs" className="dz-drop" tabIndex={-1}>
            <Upload aria-hidden="true" /><strong>Soltá imágenes o videos</strong><span>o elegilos de tu galería</span>
            <button type="button" className="dz-pill" onClick={() => say('Acá se abre tu galería.')}>Elegir de la galería</button>
          </Tabs.Content>
          <Tabs.Content value="frames" className="dz-drop" tabIndex={-1}>
            <Film aria-hidden="true" /><strong>Cuadros del video</strong><span>El video empieza, pasa y termina en estas imágenes.</span>
            <div className="dz-frames">{['Inicio', 'Medio', 'Final'].map(f => <button key={f} type="button" aria-pressed={Boolean(frames[f])} onClick={() => setFrames(x => ({...x, [f]: !x[f]}))}>{frames[f] ? <Check /> : <Plus />}{f}</button>)}</div>
          </Tabs.Content>
          <Tabs.Content value="audio" className="dz-drop" tabIndex={-1}>
            <Music aria-hidden="true" /><strong>Audio de referencia</strong><span>Una voz, una música o un sonido para seguir.</span>
            <button type="button" className="dz-pill" onClick={() => say('Acá se elige un audio.')}>Elegir un audio</button>
          </Tabs.Content>
        </Tabs.Root>
        <div className="dz-prompt">
          <TextareaAutosize className="dz-input" minRows={3} maxRows={8} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Qué pasa en el video y cómo se mueve la cámara" aria-label="Prompt del video" />
          <div className="dz-bar"><ElementsMenu onPick={e => setPrompt((prompt ? prompt + ' ' : '') + '@' + e + ' ')} /><button type="button" className="dz-pill" onClick={() => setPrompt('Una calle con nieve, de noche. La cámara avanza despacio.')}><Wand2 />Ayuda con el prompt</button></div>
        </div>
        <div className="dz-settings">
          {grid.map(([label, xs]) => (
            <RadixMenu.Root key={label}>
              <RadixMenu.Trigger asChild><button type="button" className="dz-setting"><small>{label}</small><strong>{val(label, xs)}</strong></button></RadixMenu.Trigger>
              <RadixMenu.Portal>
                <RadixMenu.Content className="dz-menu rc-layer" side="right" align="start" sideOffset={8} collisionPadding={12}>
                  <RadixMenu.Label className="dz-menu-label">{label}</RadixMenu.Label>
                  <RadixMenu.RadioGroup value={val(label, xs)} onValueChange={v => setSet(s => ({...s, [label]: v}))}>
                    {xs.map(x => <RadixMenu.RadioItem key={x} value={x} className="dz-menu-item"><span>{x}</span><RadixMenu.ItemIndicator><Check aria-hidden="true" /></RadixMenu.ItemIndicator></RadixMenu.RadioItem>)}
                  </RadixMenu.RadioGroup>
                </RadixMenu.Content>
              </RadixMenu.Portal>
            </RadixMenu.Root>
          ))}
        </div>
      </div>
      <div className="dz-panel-foot"><GoButton verb="Generar" price={priceOf(m)} busy={busy} disabled={!prompt.trim()} wide onClick={go} /></div>
    </div>
  );
}

function VideoScreen({phone}: {phone: boolean}) {
  const [sheet, setSheet] = useState(false);
  const [clips, setClips] = useState<{id: string; working: boolean}[]>([{id: 'c1', working: false}, {id: 'c2', working: false}]);
  const [at, setAt] = useState('c1');
  const generate = () => {
    const id = 'c' + Date.now();
    setClips(c => [{id, working: true}, ...c]);
    setAt(id);
    setSheet(false);
    window.setTimeout(() => { setClips(c => c.map(x => (x.id === id ? {...x, working: false} : x))); toast('Video de ejemplo listo.', {description: 'En el sitio real acá se ve el costo que informó Kie.'}); }, 3200);
  };
  const current = clips.find(c => c.id === at) || clips[0];
  const panel = <VideoPanel phone={phone} onGenerate={generate} />;
  return (
    <div className="dz-screen dz-screen--video">
      {!phone ? <aside className="dz-panel-wrap" aria-label="Ajustes del video">{panel}</aside> : null}
      <div className="dz-stage">
        <header className="dz-head"><h1 className="dz-title">Video</h1><span className="dz-hint">Historial</span></header>
        <div className="dz-player">
          <AnimatePresence mode="wait">
            <motion.div key={current.id + String(current.working)} className="dz-player-screen" data-working={current.working ? 'true' : undefined} initial={{opacity: 0, scale: 0.97}} animate={{opacity: 1, scale: 1}} exit={{opacity: 0}} transition={soft}>
              {current.working ? <><span className="dz-sweep" aria-hidden="true" /><TextShimmer>Generando el video…</TextShimmer></> : <button type="button" className="dz-play" aria-label="Reproducir" onClick={() => say('Video de ejemplo: no hay nada que reproducir.')}><Play /></button>}
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="dz-history" role="group" aria-label="Historial">
          {clips.map((c, i) => <button key={c.id} type="button" className="dz-history-item" aria-label={'Video ' + (clips.length - i) + (c.working ? ', generando' : '')} aria-current={c.id === at ? 'true' : undefined} data-working={c.working ? 'true' : undefined} onClick={() => setAt(c.id)}>{c.working ? <span className="dz-sweep" aria-hidden="true" /> : null}</button>)}
        </div>
        {phone ? <div className="dz-float"><button type="button" className="dz-openpanel" onClick={() => setSheet(true)}><SlidersHorizontal />Ajustes y generar</button></div> : null}
      </div>
      {phone ? <Sheet open={sheet} onOpenChange={setSheet} title="Ajustes del video">{panel}</Sheet> : null}
    </div>
  );
}

function ChatScreen({phone}: {phone: boolean}) {
  const [model, setModel] = useState(firstOf('text').id);
  const [text, setText] = useState('');
  const [web, setWeb] = useState(false);
  const [book, setBook] = useState(false);
  const [ask, setAsk] = useState(true);
  const [skill, setSkill] = useState('');
  const [thread, setThread] = useState<{who: 'me' | 'ai'; text: string; pending?: boolean}[]>([]);
  const m = modelOf(model);
  const send = () => {
    if (!text.trim()) return;
    const mine = text.trim();
    setText('');
    setThread(t => [...t, {who: 'me', text: mine}, {who: 'ai', text: '', pending: true}]);
    window.setTimeout(() => setThread(t => t.map((x, i) => (i === t.length - 1 ? {who: 'ai', text: 'Esta es una respuesta de ejemplo del prototipo. En el sitio real acá responde el modelo que elegiste, y debajo se ve cuánto costó.'} : x))), 1400);
  };
  useShortcut('enter', send);
  const empty = !thread.length;
  const composer = (
    <motion.div layout className="dz-composer" transition={soft}>
      <TextareaAutosize className="dz-input" minRows={phone ? 2 : 1} maxRows={8} value={text} onChange={e => setText(e.target.value)} placeholder="Escribí tu mensaje, o «/» para una habilidad" aria-label="Mensaje" />
      <div className="dz-bar dz-bar--go">
        <div className="dz-bar">
        <button type="button" className="dz-pill dz-pill--icon" aria-label="Adjuntar imágenes o archivos" onClick={() => say('Acá se adjuntan imágenes o archivos.')}><Plus /></button>
        <Pill label="Habilidad" value={skill || 'Ninguna'} options={['Ninguna', '/image-generation', '/video-generation', '/pdf-generator', '/revisar-ruso']} onChange={v => setSkill(v === 'Ninguna' ? '' : v)} icon={<Slash />} />
        <TogglePill on={web} onChange={setWeb}><Globe />Web</TogglePill>
        <TogglePill on={book} onChange={setBook}><BookMarked />Libro</TogglePill>
        <ModelPill category="text" value={model} onChange={setModel} phone={phone} hotkey />
        <label className="dz-ask"><span>Preguntar antes</span><Switch checked={ask} onCheckedChange={setAsk} /></label>
        </div>
        <GoButton verb="Enviar" price={priceOf(m)} disabled={!text.trim()} beam={empty} onClick={send} wide={phone} />
      </div>
    </motion.div>
  );
  return (
    <div className="dz-screen dz-screen--chat" data-letter="Ч" data-empty={empty ? 'true' : undefined}>
      {empty ? (
        <div className="dz-hello">
          <h1 className="dz-poster dz-poster--line">¿Qué vamos a crear hoy?</h1>
          <div className="dz-center">{composer}</div>
          <div className="dz-quick">
            <button type="button" onClick={() => say('Acá se elige el proyecto del chat.')}><FolderOpen />Sin proyecto</button>
            <button type="button" onClick={() => setText('/')}><Zap />Habilidades</button>
            <button type="button" onClick={() => setBook(b => !b)}><BookMarked />Contexto del libro</button>
            <button type="button" onClick={() => say('Acá se ve el estado de Kie y de la cuenta.')}><Plug />Conectores</button>
          </div>
        </div>
      ) : (
        <>
          <div className="dz-thread">
            {thread.map((x, i) => <motion.div key={i} className="dz-msg" data-who={x.who} initial={{opacity: 0, y: 10}} animate={{opacity: 1, y: 0}} transition={soft}>{x.pending ? <TextShimmer>Escribiendo…</TextShimmer> : x.text}</motion.div>)}
          </div>
          <div className="dz-float">{composer}</div>
        </>
      )}
    </div>
  );
}

function Later({name}: {name: string}) {
  return <div className="dz-screen dz-screen--later"><h1 className="dz-poster" lang="ru">{name}</h1><p className="dz-lead">Esta sección se rediseña después del Chat y de Кино. En el prototipo solo está su lugar en el menú.</p></div>;
}

function Side({section, setSection, view, setView, collapsed, setCollapsed}: {section: SectionId; setSection: (s: SectionId) => void; view: KinoView; setView: (v: KinoView) => void; collapsed: boolean; setCollapsed: (c: boolean) => void}) {
  const s = sections.find(x => x.id === section)!;
  const nav: [string, ReactNode, string, (() => void) | null, boolean][] = section === 'kino'
    ? [['И', <Home key="i" />, 'Inicio', () => setView('inicio'), view === 'inicio'], ['Г', <ImageIcon key="g" />, 'Imagen', () => setView('imagen'), view === 'imagen'], ['В', <Video key="v" />, 'Video', () => setView('video'), view === 'video'], ['Э', <AtSign key="e" />, 'Mis elementos', null, false], ['Л', <Heart key="l" />, 'Favoritos', null, false]]
    : section === 'chat' ? [['+', <Plus key="p" />, 'Nuevo chat', null, true], ['А', <Wand2 key="a" />, 'Asistentes', null, false], ['Н', <Zap key="n" />, 'Habilidades', null, false]]
    : [['И', <Home key="i" />, 'Inicio', null, true]];
  const tonesNav = ['plain', 'ohra', 'lazur', 'zelen', 'kinovar'];
  return (
    <nav className="dz-side" data-collapsed={collapsed ? 'true' : undefined} aria-label="Menú del estudio">
      <div className="dz-side-top">
        <RadixMenu.Root>
          <RadixMenu.Trigger asChild>
            <button type="button" className="dz-switch" aria-label={'Sección: ' + s.ru + '. Cambiar'}>
              <Tile letter={s.letter} tone={s.tone} />
              <span className="dz-switch-text"><strong lang="ru">{s.ru}</strong><small>{s.es.split(':')[0]}</small></span>
              <ChevronsUpDown aria-hidden="true" />
            </button>
          </RadixMenu.Trigger>
          <RadixMenu.Portal>
            <RadixMenu.Content className="dz-menu dz-menu--sections rc-layer" side="bottom" align="start" sideOffset={8} collisionPadding={12}>
              <RadixMenu.Label className="dz-menu-label">Ir a</RadixMenu.Label>
              {sections.map(x => (
                <RadixMenu.Item key={x.id} className="dz-menu-item dz-menu-item--section" onSelect={() => setSection(x.id)}>
                  <Tile letter={x.letter} tone={x.tone} /><span><strong lang="ru">{x.ru}</strong><small>{x.es}</small></span>{x.id === section ? <Check aria-hidden="true" /> : null}
                </RadixMenu.Item>
              ))}
            </RadixMenu.Content>
          </RadixMenu.Portal>
        </RadixMenu.Root>
        <button type="button" className="dz-iconbtn dz-side-collapse" aria-label={collapsed ? 'Mostrar el menú' : 'Esconder el menú'} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</button>
      </div>
      <LayoutGroup id="side">
        <ul className="dz-nav">
          {nav.map(([, icon, label, run, on], i) => (
            <li key={label}>
              <button type="button" className="dz-nav-item" aria-current={on ? 'page' : undefined} title={collapsed ? label : undefined} onClick={() => (run ? run() : say('«' + label + '» todavía no está en el prototipo.'))}>
                {on ? <motion.span layoutId="nav-on" className="dz-nav-on" transition={spring} /> : null}
                <span className="dz-tile" data-size="sm" data-tone={tonesNav[i % tonesNav.length]} aria-hidden="true">{icon}</span><span className="dz-side-hide">{label}</span>
              </button>
            </li>
          ))}
        </ul>
      </LayoutGroup>
      <div className="dz-side-hide dz-side-scroll">
        <Fold title="Proyectos" actions={<span className="dz-fold-actions"><button type="button" className="dz-iconbtn" aria-label="Buscar proyectos" onClick={() => say('Acá se buscan proyectos.')}><Search /></button><button type="button" className="dz-iconbtn" aria-label="Ordenar proyectos" onClick={() => say('Acá se cambia el orden.')}><ArrowDownUp /></button></span>}>
          <button type="button" className="dz-row" onClick={() => say('Acá se crea un proyecto.')}><Plus />Nuevo proyecto</button>
          {projects.map(p => <button key={p} type="button" className="dz-row" onClick={() => say('Acá se abre «' + p + '».')}>{p}</button>)}
        </Fold>
        <Fold title="Chats" actions={<span className="dz-fold-actions"><button type="button" className="dz-iconbtn" aria-label="Buscar chats" onClick={() => say('Acá se buscan chats.')}><Search /></button></span>}>
          {chats.map(c => <button key={c} type="button" className="dz-row" onClick={() => setSection('chat')}>{c}</button>)}
        </Fold>
      </div>
      <div className="dz-side-foot">
        <div className="dz-balance dz-side-hide"><small>Saldo en Kie (ejemplo)</small><strong>1.000 créditos</strong></div>
        <RadixMenu.Root>
          <RadixMenu.Trigger asChild><button type="button" className="dz-nav-item" aria-label="Cuenta y ajustes"><Tile letter="Р" tone="plain" size="sm" /><span className="dz-side-hide">Equipo · Ajustes</span><Settings className="dz-side-hide dz-nav-end" aria-hidden="true" /></button></RadixMenu.Trigger>
          <RadixMenu.Portal>
            <RadixMenu.Content className="dz-menu rc-layer" side="top" align="start" sideOffset={8} collisionPadding={12}>
              <RadixMenu.Item className="dz-menu-item" onSelect={() => applyTheme(currentTheme() === 'light' ? 'dark' : 'light')}><SunMoon /><span>Cambiar entre modo oscuro y claro</span></RadixMenu.Item>
              <RadixMenu.Item className="dz-menu-item" asChild><Link href="/workspace"><Home /><span>Volver al estudio real</span></Link></RadixMenu.Item>
            </RadixMenu.Content>
          </RadixMenu.Portal>
        </RadixMenu.Root>
      </div>
    </nav>
  );
}

export function Prototype() {
  const phone = usePhone();
  const [section, setSection] = useState<SectionId>('kino');
  const [view, setView] = useState<KinoView>('inicio');
  const [collapsed, setCollapsed] = useState(false);
  const [menu, setMenu] = useState(false);
  useShortcut('k', () => say('Ctrl o ⌘ + K: acá se abre la búsqueda de todo el estudio.'));
  const go = (s: SectionId) => { setSection(s); setMenu(false); };
  const show = (v: KinoView) => { setView(v); setMenu(false); };
  const side = <Side section={section} setSection={go} view={view} setView={show} collapsed={!phone && collapsed} setCollapsed={setCollapsed} />;
  const key = section === 'kino' ? 'kino-' + view : section;
  return (
    <MotionConfig reducedMotion="user">
      <div className="dz rc-app" data-collapsed={collapsed ? 'true' : undefined}>
        <p className="dz-ribbon" role="note">Prototipo con datos de ejemplo. Nada se envía a Kie ni se guarda.</p>
        {!phone ? side : <Sheet open={menu} onOpenChange={setMenu} title="Menú del estudio">{side}</Sheet>}
        <main className="dz-main">
          {phone ? <button type="button" className="dz-iconbtn dz-menu-open" aria-label="Abrir el menú" onClick={() => setMenu(true)}><Menu /></button> : null}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={key} className="dz-view" initial={{opacity: 0, y: 8}} animate={{opacity: 1, y: 0}} exit={{opacity: 0}} transition={{duration: 0.16}}>
              {section === 'chat' ? <ChatScreen phone={phone} /> : section === 'kino' ? (view === 'inicio' ? <HomeScreen phone={phone} onVideo={() => setView('video')} /> : view === 'imagen' ? <ImageScreen phone={phone} /> : <VideoScreen phone={phone} />) : <Later name={sections.find(x => x.id === section)!.ru} />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </MotionConfig>
  );
}
