'use client';
import {useMemo, useRef, useState, type KeyboardEvent, type ReactNode} from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import * as Popover from '@radix-ui/react-popover';
import {AtSign, Check, Clapperboard, Clock, Gem, Image as ImageIcon, Loader2, MapPin, Minus, Plus, RectangleHorizontal, ScanLine, Sparkles, User, Video, X} from 'lucide-react';
import {imageModels, videoModels, enabledStatus, publicModel} from '@/lib/ai/models';
import {startGeneration} from '@/lib/cinema/client';
import {ChatModelPicker} from '@/components/studio/chat-model-picker';
import {Tip} from '@/components/ui/tooltip';
import {AskFirst, AspectPicker, Segmented, SettingChip, aspectName, optionLabel, useGenerateConfirm} from '@/components/cinema/controls';
import {GalleryPicker, refSrc} from '@/components/cinema/gallery-picker';
import {useRefUrl} from '@/components/kb/character-refs';
import {composePrompt, lookNames, lookOption, lookOptions, mentioned, mentionQuery, referencesFor, type LookKey} from '@/lib/cinema/studio-looks';
import {useStudioItems} from '@/store/cinema-projects';
import type {JobBook} from '@/store/cinema';
import {useBalance} from '@/lib/ai/balance';
import {authorImageName, mentionPrompt} from '@/lib/cinema/mentions';
import {useCast, useEstudioDraft, type CastMember} from './data';
import {LookThumb} from './look-thumbs';

// The Estudio's composer. Image or Video; the four looks and the «@» cast only add sentences to the prompt; the model,
// quality, format, duration and variations are only what the chosen model documents, as in the other tabs.

const images = imageModels.map(m => publicModel(m, true));
const videos = videoModels.map(m => publicModel(m, true));
const pick = (value: string, list: readonly string[]) => list.includes(value) ? value : list[0] || '';

function CastPicture({member}: {member: CastMember}) {
  const url = useRefUrl(member.picture && 'ref' in member.picture ? member.picture.ref : null);
  const src = member.picture && 'url' in member.picture ? member.picture.url : url && url !== 'missing' ? url : null;
  const Icon = member.kind === 'place' ? MapPin : User;
  return <span className="rc-es-cast-pic" aria-hidden="true">{src ? <img src={src} alt="" /> : <Icon />}</span>;
}

/** Arrow keys move between the options of a radio group; Tab leaves it. */
function arrowKeys(e: KeyboardEvent<HTMLElement>) {
  const step = {ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1}[e.key];
  if (!step) return null;
  const list = [...e.currentTarget.querySelectorAll<HTMLElement>('[role=radio]')];
  const at = list.indexOf(document.activeElement as HTMLElement);
  if (at < 0) return null;
  e.preventDefault();
  const next = list[(at + step + list.length) % list.length];
  next.focus();
  return next;
}

/** `project`: the project the results go to (a project page); on Inicio the author chooses it. */
export function EstudioComposer({project}: {project?: string}) {
  const d = useEstudioDraft();
  const items = useStudioItems(s => s.items);
  const projects = items.filter(i => i.type === 'project');
  const cast = useCast();
  const video = d.mode === 'video';
  const enabled = (video ? videoModels : imageModels).filter(enabledStatus);
  const chosenId = video ? d.videoModel : d.imageModel;
  const model = enabled.find(m => m.id === chosenId) || (video ? enabled.find(m => m.options.modes.includes('create')) : undefined) || enabled[0];
  const o = model?.options;
  const aspect = pick(d.aspect, o?.aspectRatios || []);
  const resolution = pick(d.resolution, o?.resolutions || []);
  const duration = pick(d.duration || o?.durationDefault || '', o?.durations || []);
  const count = Math.max(1, Math.min(d.count, o?.maxVariants || 1));
  const max = o?.maxReferences || 0;
  const called = useMemo(() => mentioned(d.prompt, cast || []), [d.prompt, cast]);
  const references = referencesFor(d.references, called, max);
  const left = called.filter(m => m.reference && !references.includes(m.reference));
  const editsOnly = Boolean(o && !o.modes.includes('create'));
  const needsImage = editsOnly && !references.length;
  const ready = Boolean(model && d.prompt.trim()) && !needsImage;
  const target = project ?? d.project;
  // The pictures sent, named in order «@image1», «@image2»… (the server turns them into each model's own names).
  const sentCount = o?.fields.images ? (o.fields.imagesSingle ? Math.min(1, references.length) : references.length) : 0;
  // Each called character is told which picture is theirs: by the model's own name (`@image_{n}`), or «image n».
  const numbered = o?.mention?.includes('{n}') ? o.mention : !o?.mention ? 'image {n}' : null;
  const pictureOf = (m: {reference?: string}) => {
    const k = m.reference ? references.indexOf(m.reference) : -1;
    return numbered && k >= 0 && k < sentCount ? numbered.replace('{n}', String(k + 1)) : null;
  };
  const prompt = composePrompt(d.prompt, d.looks, called, pictureOf);
  const estimate = model?.price ? model.price.credits * count : null;
  // The button's second line: the catalog's estimate when Kie publishes a price, otherwise the real Kie balance.
  const balance = useBalance().data?.credits;
  const label = video ? 'Generar video' : count === 1 ? 'Generar' : 'Generar ' + count;

  const [picker, setPicker] = useState<'refs' | 'frame' | null>(null);
  const [menu, setMenu] = useState<{query: string; index: number} | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  // Book characters called together: kept with the job, like the book's own pictures.
  const book = useMemo<JobBook | undefined>(() => {
    const fromBook = called.filter(m => (m as CastMember).book) as CastMember[];
    if (!fromBook.length) return undefined;
    const first = fromBook[0].book!;
    return {project: first.project, name: first.projectName, characters: fromBook.filter(m => m.book!.project === first.project).map(m => ({id: m.book!.id, name: m.name, refs: m.book!.refs.filter(r => references.includes('asset:' + r.hash))}))};
  }, [called, references]);

  const {request, dialog, busy} = useGenerateConfirm({
    label,
    onGenerate: () => {
      if (!model || !o) return;
      return startGeneration({
        mode: video ? 'video' : 'create', model: model.id, prompt,
        aspect: o.aspectRatios.length ? aspect : '', resolution: o.resolutions.length ? resolution : '', duration: o.durations.length ? duration : undefined,
        references, count, ...(target ? {studio: target} : {}), ...(book ? {book} : {}),
      });
    },
    facts: model && o ? [
      ['Modelo', model.name],
      [video ? 'Videos' : 'Imágenes', String(count)],
      ...(o.aspectRatios.length ? [['Formato', aspectName(aspect)] as [string, string]] : []),
      ...(o.resolutions.length ? [[o.resolutionLabel || 'Calidad', optionLabel(resolution)] as [string, string]] : []),
      ...(o.durations.length ? [['Duración', duration + ' s'] as [string, string]] : []),
      ...(references.length ? [['Referencias', String(references.length)] as [string, string]] : []),
      ...(called.length ? [['Con', called.map(m => m.name).join(', ')] as [string, string]] : []),
      ...(target ? [['Proyecto', projects.find(p => p.id === target)?.name || 'Proyecto'] as [string, string]] : []),
      ...(estimate !== null ? [['Costo', '≈ ' + estimate.toLocaleString('es-AR') + ' créditos estimados; el real lo informa Kie al terminar'] as [string, string]] : []),
    ] : [],
  });
  const generate = () => { if (ready && !busy) request(); };

  const unknownImages = [...new Set([...d.prompt.matchAll(/@image_?(\d{1,2})(?![\p{L}\p{N}_])/giu)].map(m => Number(m[1])).filter(n => n < 1 || n > sentCount))];

  // «@»: what is written right before the caret opens the list (the pictures first, then the cast); picking one writes
  // its name in full.
  type Entry = {key: string; name: string; pic: ReactNode; sub: string; cast?: boolean};
  const entries: Entry[] = [
    ...references.slice(0, sentCount).map((url, i): Entry => {
      const member = called.find(m => m.reference === url) as CastMember | undefined;
      return {key: 'image:' + url, name: authorImageName(i + 1).slice(1), sub: member ? 'Foto de ' + member.name : 'Referencia ' + (i + 1),
        pic: member ? <CastPicture member={member} /> : <span className="rc-es-cast-pic" aria-hidden="true"><img src={refSrc(url)} alt="" /></span>};
    }),
    ...(cast || []).map((m): Entry => ({key: m.key, name: m.name, cast: true, pic: <CastPicture member={m} />,
      sub: m.source === 'book' ? (m.book?.projectName || 'Libro') + (m.reference ? ' · con su foto principal' : ' · sin foto principal') : m.kind === 'place' ? 'Lugar' : 'Personaje'})),
  ];
  const options = menu ? entries.filter(e => e.name.toLowerCase().includes(menu.query.toLowerCase())).slice(0, 10) : [];
  // Writing past every name closes the list instead of covering the box with «nada»; a bare «@» still shows it.
  const listOpen = Boolean(menu && (options.length || !menu.query));
  function readMention() {
    const el = box.current;
    if (!el) return;
    const q = mentionQuery(el.value.slice(0, el.selectionStart));
    setMenu(q === null ? null : {query: q, index: 0});
  }
  function choose(m: Entry) {
    const el = box.current;
    if (!el) return;
    const at = el.selectionStart;
    const before = el.value.slice(0, at).replace(/@([^\s@]{0,40})$/, '@' + m.name + ' ');
    const next = before + el.value.slice(at);
    d.patch({prompt: next});
    setMenu(null);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(before.length, before.length); });
  }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (menu && options.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const step = e.key === 'ArrowDown' ? 1 : -1; setMenu({...menu, index: (menu.index + step + options.length) % options.length}); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(options[Math.min(menu.index, options.length - 1)]); return; }
    }
    if (menu && e.key === 'Escape') { e.preventDefault(); setMenu(null); return; }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); generate(); }
  }
  function startMention() {
    const el = box.current;
    if (!el) return;
    const at = el.selectionStart;
    const glue = at && !/\s/.test(el.value[at - 1]) ? ' @' : '@';
    const next = el.value.slice(0, at) + glue + el.value.slice(at);
    d.patch({prompt: next});
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(at + glue.length, at + glue.length); setMenu({query: '', index: 0}); });
  }

  if (!model || !o) return <p className="rc-hint">No hay modelos de {video ? 'video' : 'imagen'} habilitados todavía.</p>;
  const lookKeys = Object.keys(lookNames) as LookKey[];

  return (
    <section className="rc-es-composer" aria-label="Generar">
      <div className="rc-es-mode" role="radiogroup" aria-label="Qué generar" onKeyDown={e => { const next = arrowKeys(e); if (next) d.patch({mode: next.dataset.mode as 'image' | 'video'}); }}>
        {([['image', 'Imagen', ImageIcon], ['video', 'Video', Video]] as const).map(([id, name, Icon]) => (
          <button key={id} type="button" role="radio" aria-checked={d.mode === id} tabIndex={d.mode === id ? 0 : -1} data-mode={id} className="rc-es-mode-option" onClick={() => d.patch({mode: id})}>
            <Icon aria-hidden="true" /><span>{name}</span>
          </button>
        ))}
      </div>

      <div className="rc-es-panel">
        <div className="rc-es-chips">
          <button type="button" className="rc-es-chip" onClick={() => setPicker('refs')} disabled={!max}>
            {references.length ? (
              <span className="rc-es-chip-pic" aria-hidden="true">
                {(() => { const member = called.find(m => m.reference === references[0]) as CastMember | undefined; return member ? <CastPicture member={member} /> : <img src={refSrc(references[0])} alt="" />; })()}
                <span className="rc-es-chip-plus"><Plus /></span>
              </span>
            ) : <span className="rc-es-chip-pic rc-es-chip-pic--plus" aria-hidden="true"><Plus /></span>}
            <span className="rc-es-chip-text"><small>Referencias</small><strong>{references.length}/{max}</strong></span>
            <span className="sr-only">{max ? '. Agregar de la galería o de tu computadora' : '. Este modelo no recibe imágenes'}</span>
          </button>
          {lookKeys.map(key => {
            const value = lookOption(key, d.looks[key]);
            return (
              <Popover.Root key={key}>
                <Popover.Trigger asChild>
                  <button type="button" className="rc-es-chip" data-set={value.id !== 'auto' || undefined}>
                    <span className="rc-es-chip-pic" aria-hidden="true"><LookThumb look={key} id={value.id} /></span>
                    <span className="rc-es-chip-text"><small>{lookNames[key]}</small><strong>{value.label}</strong></span>
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    className="rc-popover rc-layer rc-es-pop" side="bottom" align="start" sideOffset={8} collisionPadding={12} aria-label={lookNames[key]}
                    // The chosen option gets the focus, so the arrow keys start from it.
                    onOpenAutoFocus={e => { e.preventDefault(); (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[aria-checked=true]')?.focus(); }}
                  >
                    <p className="rc-chip-pop-title">{lookNames[key]}</p>
                    <div className="rc-es-pop-list" role="radiogroup" aria-label={lookNames[key]} onKeyDown={arrowKeys}>
                      {lookOptions[key].map(opt => (
                        <Popover.Close asChild key={opt.id}>
                          <button type="button" role="radio" aria-checked={d.looks[key] === opt.id} className="rc-es-pop-option" onClick={() => d.patch({looks: {...d.looks, [key]: opt.id}})}>
                            <span className="rc-es-pop-pic"><LookThumb look={key} id={opt.id} />{d.looks[key] === opt.id ? <span className="rc-es-pop-check" aria-hidden="true"><Check /></span> : null}</span>
                            <span className="rc-es-pop-name">{opt.label}</span>
                          </button>
                        </Popover.Close>
                      ))}
                    </div>
                    <p className="rc-hint">{value.prompt ? 'Se agrega al prompt: «' + value.prompt + '»' : 'Auto: el modelo decide; no se agrega nada al prompt.'}</p>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            );
          })}
        </div>

        {/* The writing stage: a second, lighter layer inside the panel, with the scene, its settings and the button. */}
        <div className="rc-es-stage">
          <div className="rc-es-box">
            {references.length ? (
              <div className="rc-gen-refs" role="group" aria-label="Referencias que se envían">
                {references.map((url, i) => {
                  const member = called.find(m => m.reference === url) as CastMember | undefined;
                  return (
                    <span key={url} className="rc-ref" title={member ? member.name : undefined}>
                      {member ? <CastPicture member={member} /> : <img src={refSrc(url)} alt="" />}
                      {i < sentCount ? <span className="rc-ref-name">{authorImageName(i + 1)}</span> : null}
                      {member ? null : <button type="button" className="rc-ref-remove" aria-label="Quitar referencia" onClick={() => d.patch({references: d.references.filter(u => u !== url)})}><X /></button>}
                    </span>
                  );
                })}
              </div>
            ) : null}
            <div className="rc-es-write">
              <label className="sr-only" htmlFor="estudio-prompt">Describí la escena</label>
              <TextareaAutosize
                ref={box}
                id="estudio-prompt"
                className="rc-es-prompt"
                minRows={2}
                maxRows={9}
                maxLength={3600}
                value={d.prompt}
                placeholder="Describí la escena; usá @ para sumar imágenes, personajes y lugares"
                aria-autocomplete="list"
                aria-controls={listOpen ? 'estudio-cast' : undefined}
                aria-activedescendant={listOpen && menu && options.length ? 'estudio-cast-' + Math.min(menu.index, options.length - 1) : undefined}
                onChange={e => { d.patch({prompt: e.target.value}); requestAnimationFrame(readMention); }}
                onKeyDown={onKeyDown}
                onClick={readMention}
                // Leaving the box closes the list, unless the focus came back (the «@» button puts it there).
                onBlur={() => setTimeout(() => { if (document.activeElement !== box.current) setMenu(null); }, 150)}
              />
              {listOpen && menu ? (
                <div className="rc-es-cast rc-layer" id="estudio-cast" role="listbox" aria-label="Imágenes, personajes y lugares">
                  {options.length ? options.map((m, i) => (
                    <button key={m.key} id={'estudio-cast-' + i} type="button" role="option" aria-selected={i === menu.index} className="rc-es-cast-option" tabIndex={-1} onMouseDown={e => e.preventDefault()} onClick={() => choose(m)}>
                      {m.pic}
                      <span><strong lang={m.cast ? 'ru' : undefined}>{m.cast ? m.name : '@' + m.name}</strong><small>{m.sub}</small></span>
                    </button>
                  )) : cast === null ? <p className="rc-hint">Cargando…</p>
                    : <p className="rc-hint">{entries.length ? 'Nada con ese nombre.' : 'Todavía no hay imágenes elegidas ni personajes o lugares: agregalos con «+», en «Mis elementos» o en Contexto del libro.'}</p>}
                </div>
              ) : null}
              <span className="sr-only" role="status">{menu && options.length ? options.length + (options.length === 1 ? ' sugerencia' : ' sugerencias') : ''}</span>
            </div>
            {sentCount ? <p className="rc-hint rc-es-refs-hint">Nombralas en la escena como {Array.from({length: Math.min(sentCount, 2)}, (_, i) => authorImageName(i + 1)).join(', ')}{sentCount > 2 ? '…' : ''}, o elegilas con @.</p> : null}
            {unknownImages.length ? <p className="rc-es-note" role="status">No hay {unknownImages.map(authorImageName).join(' ni ')}: {sentCount ? 'elegiste ' + sentCount + (sentCount === 1 ? ' imagen' : ' imágenes') : max ? 'todavía no elegiste ninguna imagen' : model.name + ' no recibe imágenes'}.</p> : null}
            {left.length ? <p className="rc-es-note" role="status">{model.name} recibe hasta {max} {max === 1 ? 'imagen' : 'imágenes'}: {left.map(m => m.name).join(', ')} va{left.length === 1 ? '' : 'n'} solo con su descripción.</p> : null}
            {needsImage ? <p className="rc-es-note" role="status">{model.name} {video ? 'anima' : 'edita'} una imagen: elegí una con «+» o con el cuadro.</p> : null}

            <div className="rc-es-bar">
              <Tip label={max ? 'Agregar referencias de la galería o de tu computadora' : 'Este modelo no recibe imágenes'}>
                <span className="rc-es-tip"><button type="button" className="rc-es-pill rc-es-pill--icon" aria-label="Agregar referencias de la galería o de tu computadora" disabled={!max} onClick={() => setPicker('refs')}><Plus /></button></span>
              </Tip>
              <Tip label="Sumar un personaje o un lugar (@)">
                <button type="button" className="rc-es-pill rc-es-pill--icon" aria-label="Sumar un personaje o un lugar" onClick={startMention}><AtSign /></button>
              </Tip>
              <Tip label={max ? (video ? 'Imagen inicial (el primer cuadro del video)' : 'Imagen de partida') : 'Este modelo no recibe imágenes'}>
                <span className="rc-es-tip"><button type="button" className="rc-es-pill rc-es-pill--icon" aria-label={video ? 'Elegir la imagen inicial' : 'Elegir la imagen de partida'} disabled={!max} onClick={() => setPicker('frame')}><ScanLine /></button></span>
              </Tip>
              <div className="rc-es-model">
                <ChatModelPicker models={video ? videos : images} value={model.id} onChange={id => d.patch(video ? {videoModel: id} : {imageModel: id})} category={video ? 'video' : 'image'} allowAuto={false} title={video ? 'Modelo de video' : 'Modelo de imagen'} />
              </div>
              {o.resolutions.length ? (
                <SettingChip label={o.resolutionLabel || 'Calidad'} valueText={optionLabel(resolution)} value={<><Gem aria-hidden="true" />{optionLabel(resolution)}</>}>
                  {close => <Segmented name="es-resolution" label={o.resolutionLabel || 'Calidad'} value={resolution} onChange={r => d.patch({resolution: r})} onPick={close} options={o.resolutions.map(r => ({value: r, label: optionLabel(r)}))} />}
                </SettingChip>
              ) : null}
              {o.aspectRatios.length ? (
                <SettingChip label="Formato" valueText={aspectName(aspect)} value={<><RectangleHorizontal aria-hidden="true" />{/^auto$/i.test(aspect) ? 'Auto' : aspect === 'adaptive' ? 'Adapt.' : aspect}</>} wide>
                  {close => <AspectPicker name="es-aspect" value={aspect} onChange={a => d.patch({aspect: a})} options={o.aspectRatios} onPick={close} />}
                </SettingChip>
              ) : null}
              {o.durations.length ? (
                <SettingChip label="Duración" valueText={duration + ' s'} value={<><Clock aria-hidden="true" />{duration} s</>} wide={o.durations.length > 6}>
                  {close => <Segmented name="es-duration" label="Duración" value={duration} onChange={v => d.patch({duration: v})} onPick={close} options={o.durations.map(x => ({value: x, label: x + ' s'}))} />}
                </SettingChip>
              ) : null}
              {o.maxVariants > 1 ? (
                <div className="rc-es-stepper" role="group" aria-label="Variaciones">
                  <button type="button" aria-label="Una variación menos" disabled={count <= 1} onClick={() => d.patch({count: count - 1})}><Minus /></button>
                  <span aria-live="polite"><span className="sr-only">Variaciones: </span>{count}/{o.maxVariants}</span>
                  <button type="button" aria-label="Una variación más" disabled={count >= o.maxVariants} onClick={() => d.patch({count: count + 1})}><Plus /></button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rc-es-go">
            <Tip label={ready ? 'Ctrl+Enter' : needsImage ? 'Elegí la imagen' : 'Describí la escena'}>
              <span className="rc-es-tip">
                <button type="button" className="rc-es-generate" disabled={!ready || busy} aria-busy={busy || undefined} onClick={generate}>
                  <span>{busy ? 'ENVIANDO…' : label.toUpperCase()}</span>
                  {busy ? <small><Loader2 className="rc-es-spin" aria-hidden="true" />Pidiendo a Kie</small>
                    : estimate !== null ? <small><Sparkles aria-hidden="true" />≈ {estimate.toLocaleString('es-AR')}<span className="sr-only"> créditos estimados</span></small>
                    : balance !== undefined ? <small><Sparkles aria-hidden="true" />{balance.toLocaleString('es-AR', {maximumFractionDigits: 1})} disponibles<span className="sr-only"> en tu saldo de Kie</span></small> : null}
                </button>
              </span>
            </Tip>
          </div>
        </div>
      </div>

      <div className="rc-es-under">
        {project === undefined ? (
          <label className="rc-es-target">
            <Clapperboard aria-hidden="true" />
            <span>Guardar en</span>
            <select className="rc-input" value={d.project || ''} onChange={e => d.patch({project: e.target.value || null})}>
              <option value="">Sin proyecto</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        ) : null}
        <AskFirst id="estudio-ask-first" />
        <details className="rc-es-sent">
          <summary>Ver lo que se envía</summary>
          {/* Exactly what Kie receives: the server adds the same image names (`@image_1`…) the model's page asks for. */}
          <pre>{prompt && o ? mentionPrompt(prompt, o, o.fields.images ? (o.fields.imagesSingle ? Math.min(1, references.length) : references.length) : 0) : 'Todavía nada.'}</pre>
          <p className="rc-hint">{estimate !== null ? 'El costo con ≈ es un estimado del catálogo; el real lo informa Kie al terminar y se descuenta de tu saldo en Kie.' : 'Kie no publicó un precio para este modelo: el costo real aparece cuando Kie lo informa al terminar.'}</p>
        </details>
      </div>

      <GalleryPicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        max={picker === 'frame' ? 1 : Math.max(1, max - called.filter(m => m.reference).length)}
        initial={picker === 'frame' ? d.references.slice(0, 1) : d.references}
        title={picker === 'frame' ? (video ? 'Imagen inicial' : 'Imagen de partida') : 'Referencias'}
        upload
        onChoose={urls => d.patch({references: picker === 'frame' ? [...urls, ...d.references.filter(u => !urls.includes(u))].slice(0, max) : urls})}
      />
      {dialog}
    </section>
  );
}
