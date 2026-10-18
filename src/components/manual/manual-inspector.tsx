'use client';
import {useEffect, useRef, useState} from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import {toast} from 'sonner';
import {ArrowDown, ArrowUp, Copy, FilePlus2, History, ImagePlus, Lock, Trash2} from 'lucide-react';
import type {EditorFonts} from '@/lib/manual/fonts';
import {missingChars} from '@/lib/manual/fonts';
import type {Block, Component, Element, Page, Unit} from '@/lib/manual/model';
import type {Overflow} from '@/lib/manual/render';
import type {ManualVersion} from '@/lib/manual/store';
import {shownBox, plainText} from '@/lib/manual/elements';
import {composeComponent, componentLabel, nextExercise, placeOnPage} from '@/lib/manual/compose';
import {describeTemplate} from '@/lib/manual/template';
import {
  addComponent, addPage, countEverywhere, deleteBlock, deleteElement, deletePage, duplicatePage, editText, editable, mapBlock, mapElement, movePage, replaceEverywhere,
  moveElement, replaceImage, resizeElement, restyle, setLocked, updateComponent, useAsExerciseModel, type StyleChange,
} from '@/lib/manual/edit';
import {fromMm, imageFromFile, toMm} from '@/lib/manual/browser';
import {Segmented} from '@/components/cinema/controls';
import {Switch} from '@/components/ui/switch';
import {Tip} from '@/components/ui/tooltip';
import {ConfirmDialog} from '@/components/ui/dialog';
import type {Selection} from './manual-page';

export type ManualApi = {
  unit: Unit;
  fonts: EditorFonts;
  pageIndex: number;
  page: Page;
  selection: Selection;
  overflows: Overflow[];
  change: (next: Unit, opts?: {merge?: string}) => void;
  select: (s: Selection) => void;
  goToPage: (index: number) => void;
};

const kindName: Record<Block['kind'], string> = {background: 'Fondo', header: 'Encabezado', title: 'Título de la página', section: 'Bloque', footer: 'Pie de página', side: 'Pestaña lateral', content: 'Contenido'};
const roleName: Record<string, string> = {
  'ex-band': 'Banda del ejercicio', 'ex-badge': 'Círculo del número', 'ex-number': 'Número del ejercicio', 'ex-icon': 'Ícono de audio', 'ex-audio': 'Código de audio',
  'ex-instruction': 'Consigna', 'ex-example': 'Ejemplo', 'ex-item': 'Ítem', 'page-number': 'Número de página', 'footer-text': 'Texto del pie', 'unit-tab': 'Número de unidad', 'unit-tab-shape': 'Pestaña',
};
const imageErrors: Record<string, string> = {IMAGE_TYPE: 'Ese archivo no es una imagen que el navegador pueda abrir.', IMAGE_TOO_LARGE: 'La imagen pesa más de 4 MB incluso reducida.'};

export function elementName(el: Element) {
  if (el.role && roleName[el.role]) return roleName[el.role];
  return el.kind === 'text' ? 'Texto' : el.kind === 'image' ? 'Imagen' : 'Forma';
}

function NumberField({label, value, onCommit, step = 0.5, min, suffix = 'mm', disabled}: {label: string; value: number; onCommit: (v: number) => void; step?: number; min?: number; suffix?: string; disabled?: boolean}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const v = Number(text.replace(',', '.'));
    if (Number.isFinite(v) && v !== value && (min === undefined || v >= min)) onCommit(v); else setText(String(value));
  };
  return (
    <label className="rc-field rc-man-num"><span>{label}</span>
      <span className="rc-man-num-row">
        <input className="rc-input" inputMode="decimal" value={text} disabled={disabled} step={step} onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); }} />
        <small>{suffix}</small>
      </span>
    </label>
  );
}

/** The text of a line, with buttons for the letters chosen in it: bold, regular, highlighted, plain. */
function TextEditor({api, el, disabled}: {api: ManualApi; el: Extract<Element, {kind: 'text'}>; disabled: boolean}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(plainText(el));
  // The text before this edit, to offer the same change in every footer (or side tab) that still reads it.
  const [original] = useState(plainText(el));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(plainText(el)); }, [el]);
  const commitText = (value: string) => {
    setDraft(value);
    api.change(mapElement(api.unit, api.page.id, el.id, e => e.kind === 'text' ? editText(e, value) : e), {merge: 'text:' + el.id});
  };
  const range = () => {
    const a = area.current;
    if (!a) return [0, 0];
    // Positions in characters as the line counts them (a stress mark is one).
    return [Array.from(a.value.slice(0, a.selectionStart)).length, Array.from(a.value.slice(0, a.selectionEnd)).length];
  };
  const style = (change: StyleChange) => {
    const [start, end] = range();
    if (start === end) { toast('Elegí primero las letras en el cuadro de texto.'); return; }
    api.change(mapElement(api.unit, api.page.id, el.id, e => e.kind === 'text' ? restyle(e, start, end, change, api.unit.template) : e));
  };
  const stress = () => {
    const a = area.current;
    if (!a) return;
    const at = a.selectionEnd;
    const value = a.value.slice(0, at) + '́' + a.value.slice(at);
    commitText(value);
    requestAnimationFrame(() => { a.focus(); a.setSelectionRange(at + 1, at + 1); });
  };
  const missing = missingChars(api.fonts, 'regular', draft);
  const overflow = api.overflows.find(o => o.element === el.id);
  const size = el.spans[0]?.size ?? 10;
  return (
    <div className="rc-man-text">
      <label className="rc-field"><span>Texto</span>
        <TextareaAutosize
          ref={area} className="rc-textarea rc-pdf-text" minRows={2} maxRows={10} value={draft} disabled={disabled} lang="ru" spellCheck={false}
          onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; }}
          onChange={e => commitText(e.target.value.replace(/\n/g, ' '))}
        />
      </label>
      <div className="rc-pdf-inline rc-pdf-inline--wrap" role="group" aria-label="Estilo de las letras elegidas">
        <button type="button" className="rc-chip" disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={() => style('bold')}><strong>Negrita</strong></button>
        <button type="button" className="rc-chip" disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={() => style('regular')}>Normal</button>
        <button type="button" className="rc-chip rc-man-hl" disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={() => style('highlight')}>Resaltar</button>
        <button type="button" className="rc-chip" disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={() => style('plain')}>Sin resaltar</button>
        <Tip label="Agrega la tilde de acento (´) a la letra antes del cursor"><button type="button" className="rc-chip" disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={stress}><span aria-hidden="true">а́</span> Tilde</button></Tip>
      </div>
      <p className="rc-hint">Las letras que no cambiás conservan su estilo. Para negrita o resaltado, elegí las letras en el cuadro y tocá el botón.</p>
      <div className="rc-pdf-two">
        <NumberField label="Tamaño" suffix="pt" value={Math.round(size * 10) / 10} min={4} disabled={disabled} onCommit={v => {
          const box = shownBox(api.fonts, el);
          const k = v / size;
          api.change(resizeElement(api.fonts, api.unit, api.page.id, el.id, [box[0], box[1], box[0] + (box[2] - box[0]) * k, box[1] + (box[3] - box[1]) * k]));
        }} />
      </div>
      {el.role && ['footer-text', 'unit-tab'].includes(el.role) && draft !== original && countEverywhere(api.unit, el.role, original) > 0 ? (
        <div className="rc-notice" role="note">
          <span>{countEverywhere(api.unit, el.role, original) === 1 ? 'Otra página' : countEverywhere(api.unit, el.role, original) + ' páginas más'} todavía {countEverywhere(api.unit, el.role, original) === 1 ? 'dice' : 'dicen'} «{original}».</span>
          <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => {
            const r = replaceEverywhere(api.unit, el.role!, original, draft);
            api.change(r.unit);
            toast('Cambiado en ' + r.count + (r.count === 1 ? ' página más' : ' páginas más') + ', también en las aprobadas.');
          }}>Cambiar en todas</button>
        </div>
      ) : null}
      {missing.length ? <p className="rc-pdf-warn" role="alert">La fuente del manual no tiene estas letras: {missing.join(' ')}. Saldrían como cuadros vacíos.</p> : null}
      {overflow ? <p className="rc-pdf-warn" role="alert">El texto es más largo que su lugar ({toMm(overflow.width)} mm de {toMm(overflow.maxWidth)} mm). Acortalo o achicá la letra.</p> : null}
    </div>
  );
}

function ImageEditor({api, el, disabled}: {api: ManualApi; el: Extract<Element, {kind: 'image'}>; disabled: boolean}) {
  const [busy, setBusy] = useState(false);
  const box = shownBox(api.fonts, el);
  const w = box[2] - box[0], h = box[3] - box[1];
  // Density of the picture itself (a cut-out shows part of it at the same density).
  const ppi = Math.round(el.image.width / (Math.hypot(el.matrix[0], el.matrix[1]) / 72));
  async function replace(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const image = await imageFromFile(file);
      api.change(replaceImage(api.unit, api.page.id, el.id, image));
      toast('Imagen reemplazada: ocupa el mismo lugar, sin deformarse.');
    } catch (e) {
      toast(imageErrors[(e as Error).message] || 'No se pudo usar esa imagen.');
    } finally { setBusy(false); }
  }
  return (
    <div className="rc-man-image">
      <label className="rc-btn rc-btn--secondary rc-btn--sm rc-pdf-add" aria-disabled={disabled || busy}>
        <ImagePlus aria-hidden="true" />{busy ? 'Preparando…' : 'Reemplazar imagen…'}
        <input type="file" accept="image/*" className="sr-only" disabled={disabled || busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; void replace(f); }} />
      </label>
      <div className="rc-pdf-two">
        <NumberField label="Ancho" value={toMm(w)} min={1} disabled={disabled} onCommit={v => { const k = fromMm(v) / w; api.change(resizeElement(api.fonts, api.unit, api.page.id, el.id, [box[0], box[3] - h * k, box[0] + w * k, box[3]])); }} />
        <NumberField label="Alto" value={toMm(h)} min={1} disabled={disabled} onCommit={v => { const k = fromMm(v) / h; api.change(resizeElement(api.fonts, api.unit, api.page.id, el.id, [box[0], box[3] - h * k, box[0] + w * k, box[3]])); }} />
      </div>
      <p className={ppi < 200 ? 'rc-pdf-warn' : 'rc-hint'}>
        {el.image.width} × {el.image.height} px · {ppi} ppi a este tamaño{ppi < 200 ? '. Para imprimir conviene 300 ppi: con menos se ve suave en papel.' : '.'}
        {el.image.format === 'raw' ? ' Es la imagen original del PDF, sin recomprimir.' : ''}
      </p>
    </div>
  );
}

function SelectionPanel({api}: {api: ManualApi}) {
  const {unit, page, selection} = api;
  const block = page.blocks.find(b => b.id === selection.block);
  const el = block?.elements.find(e => e.id === selection.element);
  const [confirm, setConfirm] = useState<null | 'block'>(null);

  if (page.conserved && !block) {
    return (
      <div className="rc-pdf-form">
        <p className="rc-notice" role="note">Esta página se conserva tal cual del PDF original: {page.conserved.reason} Su contenido no se puede editar acá. Podés agregarle bloques encima desde «Agregar».</p>
      </div>
    );
  }
  if (!block) {
    return (
      <div className="rc-pdf-form">
        <p className="rc-hint">Hacé clic en un bloque de la página para elegirlo. Otro clic adentro elige un elemento (una línea, una imagen). Arrastrá para mover; las flechas del teclado lo mueven de a 1 punto (con Mayús, de a 10).</p>
        <BlockList api={api} />
      </div>
    );
  }
  const canEdit = editable(page, block);
  const lockedNote = !canEdit && !page.conserved ? (
    <div className="rc-notice rc-man-locked" role="note">
      <Lock aria-hidden="true" /><span>Bloque aprobado: no se cambia hasta que lo desbloquees.</span>
      <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => api.change(setLocked(unit, page.id, block.id, false))}>Desbloquear</button>
    </div>
  ) : null;

  const pos = el ? shownBox(api.fonts, el) : null;
  return (
    <div className="rc-pdf-form">
      <div className="rc-pdf-form-head">
        <span className="rc-pdf-kind">{el ? elementName(el) + ' · en «' + block.label + '»' : kindName[block.kind]}</span>
        <span className="rc-pdf-form-actions">
          {el ? <Tip label="Volver al bloque"><button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => api.select({block: block.id, element: null})}>Bloque</button></Tip> : null}
          <Tip label={el ? 'Borrar elemento' : 'Borrar bloque'}>
            <button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label={el ? 'Borrar elemento' : 'Borrar bloque'} disabled={!canEdit} onClick={() => {
              if (el) { api.change(deleteElement(unit, page.id, el.id)); api.select({block: block.id, element: null}); } else setConfirm('block');
            }}><Trash2 /></button>
          </Tip>
        </span>
      </div>
      {lockedNote}
      {!el ? (
        <>
          <label className="rc-field"><span>Nombre del bloque</span>
            <input className="rc-input" value={block.label} maxLength={200} onChange={e => api.change(mapBlock(unit, page.id, block.id, b => ({...b, label: e.target.value})), {merge: 'label:' + block.id})} />
          </label>
          <div className="rc-man-switch">
            <Switch id="man-lock" checked={Boolean(block.locked)} onCheckedChange={v => api.change(setLocked(unit, page.id, block.id, v))} disabled={Boolean(page.conserved)} />
            <label htmlFor="man-lock">Aprobado (bloqueado)<small>Ni el editor ni el asistente lo cambian.</small></label>
          </div>
          {block.component && canEdit ? <ComponentForm key={block.id} api={api} block={block} /> : null}
          {block.elements.some(e => e.role === 'ex-band') ? (
            <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm rc-pdf-add" onClick={() => { api.change(useAsExerciseModel(unit, page.id, block.id)); toast('Los ejercicios nuevos van a usar este encabezado.'); }}>Usar este encabezado para los ejercicios nuevos</button>
          ) : null}
          <div className="rc-field"><span>Elementos ({block.elements.length})</span>
            <ul className="rc-man-els">
              {block.elements.slice(0, 80).map(e => (
                <li key={e.id}><button type="button" className="rc-man-el-row" onClick={() => api.select({block: block.id, element: e.id})}>
                  <span>{elementName(e)}</span><small>{e.kind === 'text' ? plainText(e).slice(0, 60) : e.kind === 'image' ? e.image.width + ' × ' + e.image.height + ' px' : ''}</small>
                </button></li>
              ))}
            </ul>
            {block.elements.length > 80 ? <p className="rc-hint">y {block.elements.length - 80} más: elegilos en la página.</p> : null}
          </div>
        </>
      ) : (
        <>
          {el.kind === 'text' ? <TextEditor key={el.id} api={api} el={el} disabled={!canEdit} /> : null}
          {el.kind === 'image' ? <ImageEditor api={api} el={el} disabled={!canEdit} /> : null}
          {el.kind === 'path' ? <p className="rc-hint">Una forma del diseño (banda, círculo, línea). Se puede mover o borrar.</p> : null}
          {pos ? (
            <div className="rc-pdf-two">
              <NumberField label="Desde la izquierda" value={toMm(pos[0])} disabled={!canEdit} onCommit={v => api.change(moveElement(unit, page.id, el.id, fromMm(v) - pos[0], 0))} />
              <NumberField label="Desde arriba" value={toMm(page.height - pos[3])} disabled={!canEdit} onCommit={v => api.change(moveElement(unit, page.id, el.id, 0, (page.height - pos[3]) - fromMm(v)))} />
            </div>
          ) : null}
        </>
      )}
      <ConfirmDialog
        open={confirm === 'block'} onClose={() => setConfirm(null)} tone="danger" confirmLabel="Borrar bloque"
        title={'¿Borrar «' + block.label + '»?'} description="Se quita de la página con todos sus elementos. Podés deshacerlo con ⌘Z o volver a una versión."
        onConfirm={() => { api.change(deleteBlock(unit, page.id, block.id)); api.select({block: null, element: null}); setConfirm(null); }}
      />
    </div>
  );
}

function BlockList({api}: {api: ManualApi}) {
  const {page} = api;
  if (!page.blocks.length) return <p className="rc-hint">Página vacía: agregá contenido desde «Agregar».</p>;
  return (
    <div className="rc-field"><span>Bloques de esta página</span>
      <ul className="rc-man-els">
        {page.blocks.map(b => (
          <li key={b.id}>
            <button type="button" className="rc-man-el-row" aria-current={api.selection.block === b.id ? 'true' : undefined} onClick={() => api.select({block: b.id, element: null})}>
              <span>{b.locked ? <Lock aria-label="Aprobado" /> : null}{b.label}</span><small>{kindName[b.kind]}</small>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

type ExerciseDraft = {number: string; audio: string; instruction: string; example: string; items: string; columns: 1 | 2};
const lines = (s: string) => s.split('\n').map(l => l.trim()).filter(Boolean);
const toComponent = (d: ExerciseDraft): Component => ({type: 'exercise', number: d.number.trim(), audio: d.audio.trim(), instruction: d.instruction.trim(), example: lines(d.example).slice(0, 6), items: lines(d.items).slice(0, 40), columns: d.columns});

function ExerciseFields({draft, onChange}: {draft: ExerciseDraft; onChange: (d: ExerciseDraft) => void}) {
  return (
    <>
      <div className="rc-pdf-two">
        <label className="rc-field"><span>Número</span><input className="rc-input" maxLength={10} value={draft.number} onChange={e => onChange({...draft, number: e.target.value})} /></label>
        <label className="rc-field"><span>Código de audio</span><input className="rc-input" maxLength={12} value={draft.audio} onChange={e => onChange({...draft, audio: e.target.value})} /></label>
      </div>
      <label className="rc-field"><span>Consigna</span><TextareaAutosize className="rc-textarea" lang="ru" minRows={1} maxRows={4} maxLength={300} value={draft.instruction} onChange={e => onChange({...draft, instruction: e.target.value.replace(/\n/g, ' ')})} /></label>
      <label className="rc-field"><span>Ejemplo (una línea por renglón, opcional)</span><TextareaAutosize className="rc-textarea" lang="ru" minRows={2} maxRows={6} value={draft.example} onChange={e => onChange({...draft, example: e.target.value})} /></label>
      <label className="rc-field"><span>Ítems (uno por renglón; se numeran solos)</span><TextareaAutosize className="rc-textarea" lang="ru" minRows={3} maxRows={14} value={draft.items} onChange={e => onChange({...draft, items: e.target.value})} /></label>
      <div className="rc-field"><span>Columnas</span>
        <Segmented name="ex-columns" label="Columnas de ítems" value={draft.columns} onChange={columns => onChange({...draft, columns})} options={[{value: 1, label: 'Una'}, {value: 2, label: 'Dos'}]} />
      </div>
      <p className="rc-hint">Marcas: **negrita** y ==resaltado== (por ejemplo, Это ==тоже== Маша). Para la tilde de acento, escribí la vocal y después ´ con el botón del texto, o pegá «а́».</p>
    </>
  );
}

function ComponentForm({api, block}: {api: ManualApi; block: Block}) {
  const c = block.component!;
  const [draft, setDraft] = useState<ExerciseDraft | null>(c.type === 'exercise' ? {number: c.number, audio: c.audio, instruction: c.instruction, example: c.example.join('\n'), items: c.items.join('\n'), columns: c.columns} : null);
  const [text, setText] = useState(c.type === 'text' || c.type === 'heading' ? c.text : '');
  const apply = (component: Component) => api.change(updateComponent(api.fonts, api.unit, api.page.id, block.id, component), {merge: 'component:' + block.id});
  if (c.type === 'exercise' && draft) return <div className="rc-man-component"><ExerciseFields draft={draft} onChange={d => { setDraft(d); apply(toComponent(d)); }} /></div>;
  if (c.type === 'text' || c.type === 'heading') {
    return (
      <label className="rc-field"><span>{c.type === 'text' ? 'Texto' : 'Título'}</span>
        <TextareaAutosize className="rc-textarea" lang="ru" minRows={c.type === 'text' ? 4 : 1} maxRows={16} value={text} onChange={e => { setText(e.target.value); apply({...c, text: c.type === 'heading' ? e.target.value.replace(/\n/g, ' ') : e.target.value}); }} />
      </label>
    );
  }
  if (c.type === 'image' || c.type === 'gallery' || c.type === 'comic') return <PictureForm c={c} apply={apply} />;
  return null;
}

type PictureComponent = Extract<Component, {type: 'image' | 'gallery' | 'comic'}>;

/** A photo, a gallery or a comic: its texts (caption, labels, bubbles) and each of its pictures. */
function PictureForm({c, apply}: {c: PictureComponent; apply: (c: Component) => void}) {
  const [draft, setDraft] = useState<PictureComponent>(c);
  const [busy, setBusy] = useState<number | null>(null);
  const change = (next: PictureComponent) => { setDraft(next); apply(next); };
  const slots = draft.type === 'image' ? [{image: draft.image, prompt: draft.prompt}] : draft.type === 'gallery' ? draft.cells : draft.panels;
  async function pick(i: number, file?: File) {
    if (!file) return;
    setBusy(i);
    try {
      const image = await imageFromFile(file);
      change(draft.type === 'image' ? {...draft, image} : draft.type === 'gallery' ? {...draft, cells: draft.cells.map((x, k) => k === i ? {...x, image} : x)} : {...draft, panels: draft.panels.map((x, k) => k === i ? {...x, image} : x)});
    } catch (e) {
      toast(imageErrors[(e as Error).message] || 'No se pudo usar esa imagen.');
    } finally { setBusy(null); }
  }
  async function copy(prompt: string) {
    try { await navigator.clipboard.writeText(prompt); toast('Prompt copiado.'); } catch { toast('No se pudo copiar: seleccionalo a mano.'); }
  }
  const setBubble = (i: number, k: number, text: string) => {
    if (draft.type !== 'comic') return;
    const bubbles = [...draft.panels[i].bubbles];
    bubbles[k] = text;
    while (bubbles.length && !bubbles[bubbles.length - 1].trim()) bubbles.pop();
    change({...draft, panels: draft.panels.map((p, n) => n === i ? {...p, bubbles} : p)});
  };
  const name = (i: number) => draft.type === 'gallery' ? 'Imagen ' + (i + 1) : draft.type === 'comic' ? 'Viñeta ' + (i + 1) : 'Imagen';
  return (
    <div className="rc-man-pictures">
      {draft.type === 'image' ? (
        <label className="rc-field"><span>Epígrafe</span>
          <input className="rc-input" lang="ru" maxLength={300} value={draft.caption || ''} onChange={e => change({...draft, caption: e.target.value || undefined})} />
        </label>
      ) : null}
      <ol className="rc-man-picture-list">
        {slots.map((slot, i) => (
          <li key={i}>
            <span className="rc-man-picture-head">{name(i)} · {slot.image ? slot.image.width + ' × ' + slot.image.height + ' px' : 'pendiente'}</span>
            {draft.type === 'gallery' ? (
              <label className="rc-field"><span>Etiqueta</span>
                <input className="rc-input" lang="ru" maxLength={120} value={draft.cells[i].label} onChange={e => change({...draft, cells: draft.cells.map((x, k) => k === i ? {...x, label: e.target.value} : x)})} />
              </label>
            ) : null}
            {draft.type === 'comic' ? [...draft.panels[i].bubbles, ''].slice(0, 4).map((b, k) => (
              <label key={k} className="rc-field"><span>{k < draft.panels[i].bubbles.length ? 'Globo ' + (k + 1) : 'Globo nuevo'}</span>
                <input className="rc-input" lang="ru" maxLength={200} value={b} onChange={e => setBubble(i, k, e.target.value)} />
              </label>
            )) : null}
            <div className="rc-man-picture-actions">
              <label className="rc-btn rc-btn--secondary rc-btn--sm rc-pdf-add" aria-disabled={busy !== null}>
                <ImagePlus aria-hidden="true" />{busy === i ? 'Preparando…' : slot.image ? 'Cambiar imagen…' : 'Elegir imagen…'}
                <input type="file" accept="image/*" className="sr-only" disabled={busy !== null} aria-label={(slot.image ? 'Cambiar ' : 'Elegir ') + name(i).toLowerCase()} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; void pick(i, f); }} />
              </label>
              {slot.prompt ? <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => void copy(slot.prompt!)}><Copy aria-hidden="true" />Copiar prompt</button> : null}
            </div>
          </li>
        ))}
      </ol>
      {slots.some(x => !x.image && x.prompt) ? <p className="rc-hint">Para crear con IA una imagen pendiente, copiá su prompt y usalo con /image-generation en el Chat o en Cinema; después elegila acá.</p> : null}
      <p className="rc-hint">Las imágenes llenan su lugar y se recortan como las fotos del manual; los textos los dibuja el estudio.</p>
    </div>
  );
}

function AddPanel({api}: {api: ManualApi}) {
  const {unit, page, fonts} = api;
  const [type, setType] = useState<'exercise' | 'text' | 'heading' | 'image'>('exercise');
  const next = nextExercise(unit);
  const [draft, setDraft] = useState<ExerciseDraft>({...next, instruction: '', example: '', items: '', columns: 2});
  const [text, setText] = useState('');
  const [image, setImage] = useState<{data: Component & {type: 'image'}; name: string} | null>(null);
  const [width, setWidth] = useState(60);
  const [rounded, setRounded] = useState(true);
  const [noRoom, setNoRoom] = useState<Component | null>(null);
  useEffect(() => { setDraft(d => ({...d, number: next.number, audio: next.audio})); }, [next.number, next.audio]);
  const {has, missing} = describeTemplate(unit.template);

  function component(): Component | null {
    if (type === 'exercise') return draft.instruction.trim() || lines(draft.items).length ? toComponent(draft) : null;
    if (type === 'text') return text.trim() ? {type: 'text', text} : null;
    if (type === 'heading') return text.trim() ? {type: 'heading', text: text.replace(/\n/g, ' ')} : null;
    if (!image) return null;
    const w = fromMm(width);
    const img = image.data.image!;
    return {...image.data, width: w, height: w * img.height / img.width, rounded};
  }

  function add(onNewPage = false) {
    const c = component();
    if (!c) { toast(type === 'image' ? 'Elegí una imagen.' : 'Escribí el contenido primero.'); return; }
    let u = unit, target = page, index = api.pageIndex;
    if (onNewPage) {
      const made = addPage(fonts, unit, api.pageIndex);
      u = made.unit; target = made.page; index = api.pageIndex + 1;
    }
    const probe = composeComponent({fonts, template: u.template, page: target, idPrefix: 'probe', z: 0}, c, [0, target.height]);
    const at = placeOnPage(fonts, u.template, target, probe.height);
    if (!at) { setNoRoom(c); return; }
    const {unit: out, block} = addComponent(fonts, u, target.id, c, at);
    api.change(out);
    if (index !== api.pageIndex) api.goToPage(index);
    if (block) api.select({block: block.id, element: null});
    setNoRoom(null);
    toast(componentLabel(c) + ' · agregado');
    if (type === 'exercise') setDraft({...nextExercise(out), instruction: '', example: '', items: '', columns: draft.columns});
    else if (type !== 'image') setText('');
  }

  async function pick(file?: File) {
    if (!file) return;
    try {
      const data = await imageFromFile(file);
      setImage({data: {type: 'image', image: data, width: 0, height: 0, rounded}, name: file.name});
    } catch (e) { toast(imageErrors[(e as Error).message] || 'No se pudo usar esa imagen.'); }
  }

  return (
    <div className="rc-pdf-form">
      <Segmented name="add-type" label="Qué agregar" value={type} onChange={setType} options={[{value: 'exercise', label: 'Ejercicio'}, {value: 'text', label: 'Texto'}, {value: 'heading', label: 'Título'}, {value: 'image', label: 'Imagen'}]} />
      {type === 'exercise' ? (
        <>
          <ExerciseFields draft={draft} onChange={setDraft} />
          {!unit.template.exerciseHeader ? <p className="rc-pdf-warn">Esta unidad no tiene un encabezado de ejercicio para copiar: el ejercicio sale sin banda. Importá una unidad del manual o elegí un bloque con encabezado y tocá «Usar este encabezado…».</p> : null}
        </>
      ) : type === 'image' ? (
        <>
          <label className="rc-btn rc-btn--secondary rc-btn--sm rc-pdf-add"><ImagePlus aria-hidden="true" />{image ? image.name : 'Elegir imagen…'}
            <input type="file" accept="image/*" className="sr-only" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; void pick(f); }} />
          </label>
          <div className="rc-pdf-two"><NumberField label="Ancho" value={width} min={5} onCommit={setWidth} /></div>
          <div className="rc-man-switch"><Switch id="man-round" checked={rounded} onCheckedChange={setRounded} /><label htmlFor="man-round">Esquinas redondeadas<small>Como las fotos del manual.</small></label></div>
        </>
      ) : (
        <label className="rc-field"><span>{type === 'text' ? 'Texto' : 'Título'}</span>
          <TextareaAutosize className="rc-textarea" lang="ru" minRows={type === 'text' ? 4 : 1} maxRows={14} value={text} onChange={e => setText(e.target.value)} />
        </label>
      )}
      <div className="rc-pdf-inline rc-pdf-inline--wrap">
        <button type="button" className="rc-btn rc-btn--primary rc-btn--sm" onClick={() => add(false)}>Agregar en esta página</button>
        <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => add(true)}><FilePlus2 aria-hidden="true" />En una página nueva</button>
      </div>
      {noRoom ? (
        <div className="rc-notice" role="alert"><span>No entra en lo que queda de esta página.</span><button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => add(true)}>Agregarlo en una página nueva</button></div>
      ) : null}
      <p className="rc-hint">Se dibuja con la plantilla de la unidad ({has.join(', ') || 'sin piezas'}){missing.length ? '. Falta: ' + missing.join(', ') : ''}. Va debajo del último bloque de la página; después lo podés mover.</p>
    </div>
  );
}

function PagesPanel({api}: {api: ManualApi}) {
  const {unit, fonts, pageIndex: i} = api;
  const [confirm, setConfirm] = useState(false);
  const count = unit.pages.length;
  return (
    <div className="rc-pdf-form">
      <p className="rc-hint">Página {i + 1} de {count}{api.page.conserved ? ' · se conserva del PDF original' : api.page.sourcePage !== undefined ? ' · importada (página ' + (api.page.sourcePage + 1) + ' del PDF)' : ' · nueva'}.</p>
      <div className="rc-man-actions">
        <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" onClick={() => { const r = addPage(fonts, unit, i); api.change(r.unit); api.goToPage(i + 1); }}><FilePlus2 aria-hidden="true" />Página nueva después</button>
        <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => { api.change(duplicatePage(fonts, unit, i)); api.goToPage(i + 1); }}><Copy aria-hidden="true" />Duplicar</button>
        <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" disabled={i === 0} onClick={() => { api.change(movePage(fonts, unit, i, i - 1)); api.goToPage(i - 1); }}><ArrowUp aria-hidden="true" />Antes</button>
        <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" disabled={i >= count - 1} onClick={() => { api.change(movePage(fonts, unit, i, i + 1)); api.goToPage(i + 1); }}><ArrowDown aria-hidden="true" />Después</button>
        <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" disabled={count <= 1} onClick={() => setConfirm(true)}><Trash2 aria-hidden="true" />Borrar</button>
      </div>
      <p className="rc-hint">La página nueva lleva el pie y la pestaña de la página anterior. Los números de página se ordenan solos.</p>
      <BlockList api={api} />
      <ConfirmDialog
        open={confirm} onClose={() => setConfirm(false)} tone="danger" confirmLabel="Borrar página" title={'¿Borrar la página ' + (i + 1) + '?'}
        description="Se quita de la unidad. Podés deshacerlo con ⌘Z o volver a una versión."
        onConfirm={() => { api.change(deletePage(fonts, unit, i)); api.goToPage(Math.max(0, i - 1)); setConfirm(false); }}
      />
    </div>
  );
}

const when = (at: number) => new Date(at).toLocaleString('es-AR', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});

function VersionsPanel({versions, onSave, onRestore}: {versions: ManualVersion[]; onSave: (label: string) => void; onRestore: (v: ManualVersion) => void}) {
  const [label, setLabel] = useState('');
  return (
    <div className="rc-pdf-form">
      <form className="rc-man-version-form" onSubmit={e => { e.preventDefault(); onSave(label.trim() || 'Versión guardada'); setLabel(''); }}>
        <label className="rc-field"><span>Guardar cómo está ahora</span><input className="rc-input" placeholder="Por ejemplo: Ejercicios 1 a 5 revisados" maxLength={200} value={label} onChange={e => setLabel(e.target.value)} /></label>
        <button type="submit" className="rc-btn rc-btn--secondary rc-btn--sm">Guardar versión</button>
      </form>
      <p className="rc-hint">Los cambios se guardan solos. Una versión es una foto para volver después; la importada se conserva siempre. Volver a una versión guarda antes la actual.</p>
      <ol className="rc-doc-versions" reversed>
        {[...versions].reverse().map(v => (
          <li key={v.id}>
            <History aria-hidden="true" />
            <span className="rc-doc-version-text"><strong>{v.label}</strong><small>{when(v.createdAt)} · {v.unit.pages.length} páginas</small></span>
            <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => onRestore(v)} aria-label={'Volver a esta versión: ' + v.label}>Volver a esta</button>
          </li>
        ))}
      </ol>
    </div>
  );
}

export {SelectionPanel, AddPanel, PagesPanel, VersionsPanel};
