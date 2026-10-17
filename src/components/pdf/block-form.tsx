'use client';
import {useMemo, useState} from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import {toast} from 'sonner';
import {ArrowDown, ArrowUp, Copy, ImagePlus, Images, Minus, Plus, Sparkles, Trash2, Upload} from 'lucide-react';
import type {Block} from '@/lib/pipeline/types';
import {blobToDataUrl, remoteToDataUrl} from '@/lib/books/images';
import {startGeneration} from '@/lib/cinema/client';
import {useCinema, isActive, isDone} from '@/store/cinema';
import {useCinemaUi} from '@/store/cinema-ui';
import {ConfirmDialog} from '@/components/ui/dialog';
import {GalleryPicker} from '@/components/cinema/gallery-picker';
import {Elapsed} from '@/components/cinema/job-card';
import {Segmented} from '@/components/cinema/controls';
import {Tip} from '@/components/ui/tooltip';
import {blockNames, type EditorApi} from './editor-api';
import {InsertMenu} from './insert-menu';

const imageErrors: Record<string, string> = {
  IMAGE_TYPE: 'Solo PNG, JPEG o WebP.',
  IMAGE_TOO_LARGE: 'La imagen es demasiado grande incluso reducida.',
  IMAGE_DOWNLOAD: 'No se pudo traer la imagen de la galería.',
};

export function BlockForm({api, block}: {api: EditorApi; block: Block}) {
  const {updateBlock} = api;
  const set = (patch: Partial<Block>, key: string) => updateBlock(block.id, patch, block.id + ':' + key);
  const chapter = api.book.chapters[api.selection.chapter];
  const index = chapter ? chapter.blocks.findIndex(b => b.id === block.id) : -1;

  return (
    <div className="rc-pdf-form">
      <div className="rc-pdf-form-head">
        <span className="rc-pdf-kind">{blockNames[block.type]}</span>
        <span className="rc-pdf-form-actions">
          <Tip label="Subir"><button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label="Subir bloque" disabled={index <= 0} onClick={() => api.moveBlock(block.id, -1)}><ArrowUp /></button></Tip>
          <Tip label="Bajar"><button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label="Bajar bloque" disabled={!chapter || index >= chapter.blocks.length - 1} onClick={() => api.moveBlock(block.id, 1)}><ArrowDown /></button></Tip>
          <Tip label="Duplicar"><button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label="Duplicar bloque" onClick={() => api.duplicateBlock(block.id)}><Copy /></button></Tip>
          <Tip label="Borrar"><button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label="Borrar bloque" disabled={!chapter || chapter.blocks.length <= 1} onClick={() => api.deleteBlock(block.id)}><Trash2 /></button></Tip>
        </span>
      </div>

      {block.type === 'heading' ? (
        <>
          <Text label="Texto" value={block.text} onChange={text => set({text}, 'text')} />
          <div className="rc-field"><span>Nivel</span>
            <Segmented name="heading-level" label="Nivel del título" value={block.level} onChange={level => set({level}, 'level')} options={[{value: 1, label: 'Grande'}, {value: 2, label: 'Medio'}, {value: 3, label: 'Chico'}]} />
          </div>
        </>
      ) : block.type === 'paragraph' || block.type === 'callout' ? (
        <Text label="Texto" value={block.text} onChange={text => set({text}, 'text')} rows={4} hint={block.type === 'paragraph' ? 'Cada salto de línea se respeta en la página.' : undefined} />
      ) : block.type === 'exercise' ? (
        <>
          <Text label="Consigna" value={block.instruction} onChange={instruction => set({instruction}, 'instruction')} />
          <ListEditor label="Ítems" items={block.items} max={30} onChange={(items, key) => set({items}, key)} />
          <label className="rc-field"><span>Pista de audio (opcional)</span>
            <input className="rc-input" maxLength={30} value={block.audioId || ''} onChange={e => set({audioId: e.target.value || undefined}, 'audio')} placeholder="1.02" />
          </label>
        </>
      ) : block.type === 'table' ? (
        <TableEditor block={block} onChange={(patch, key) => set(patch, key)} />
      ) : block.type === 'writing' ? (
        <>
          <Text label="Modelo para copiar" value={block.text} onChange={text => set({text}, 'text')} max={200} hint="Letras o palabras que se copian en los renglones." />
          <div className="rc-field"><span>Renglones</span>
            <Segmented name="writing-lines" label="Renglones" value={block.lines} onChange={lines => set({lines}, 'lines')} options={[2, 3, 4, 6, 8, 10].map(n => ({value: n, label: String(n)}))} />
          </div>
        </>
      ) : block.type === 'image' ? (
        <ImageForm api={api} block={block} />
      ) : null}

      <div className="rc-pdf-form-foot">
        <InsertMenu api={api} label="Insertar después" />
      </div>
    </div>
  );
}

function Text({label, value, onChange, rows = 2, hint, max = 8000}: {label: string; value: string; onChange: (v: string) => void; rows?: number; hint?: string; max?: number}) {
  return (
    <label className="rc-field">
      <span>{label}</span>
      <TextareaAutosize className="rc-textarea rc-pdf-text" minRows={rows} maxRows={16} maxLength={max} value={value} onChange={e => onChange(e.target.value)} />
      {hint ? <small className="rc-hint">{hint}</small> : null}
      {!value.trim() ? <small className="rc-pdf-warn">Vacío: el PDF del servidor no lo acepta.</small> : null}
    </label>
  );
}

function ListEditor({label, items, max, onChange}: {label: string; items: string[]; max: number; onChange: (items: string[], key: string) => void}) {
  return (
    <div className="rc-field">
      <span>{label}</span>
      <ol className="rc-pdf-list">
        {items.map((item, i) => (
          <li key={i}>
            <span className="rc-pdf-list-num">{i + 1}</span>
            <TextareaAutosize className="rc-textarea rc-pdf-text" aria-label={label + ' ' + (i + 1)} minRows={1} maxRows={6} maxLength={8000} value={item} onChange={e => onChange(items.map((v, j) => j === i ? e.target.value : v), 'item' + i)} />
            <button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label={'Quitar ítem ' + (i + 1)} disabled={items.length <= 1} onClick={() => onChange(items.filter((_, j) => j !== i), 'remove')}><Minus /></button>
          </li>
        ))}
      </ol>
      <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm rc-pdf-add" disabled={items.length >= max} onClick={() => onChange([...items, '…'], 'add')}><Plus aria-hidden="true" />Agregar ítem</button>
    </div>
  );
}

function TableEditor({block, onChange}: {block: Extract<Block, {type: 'table'}>; onChange: (patch: Partial<Block>, key: string) => void}) {
  const {headers, rows} = block;
  const cols = headers.length;
  const grid = {gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr)) 28px`};
  return (
    <div className="rc-field">
      <span>Tabla · {cols} columnas · {rows.length} filas</span>
      <div className="rc-pdf-table" style={grid} role="group" aria-label="Celdas de la tabla">
        {headers.map((h, c) => <input key={'h' + c} className="rc-input rc-pdf-cell rc-pdf-cell--head" aria-label={'Encabezado ' + (c + 1)} value={h} maxLength={8000} onChange={e => onChange({headers: headers.map((v, j) => j === c ? e.target.value : v)}, 'h' + c)} />)}
        <button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label="Quitar la última columna" disabled={cols <= 1} onClick={() => onChange({headers: headers.slice(0, -1), rows: rows.map(r => r.slice(0, -1))}, 'col-')}><Minus /></button>
        {rows.map((row, r) => (
          <RowCells key={r} row={row} r={r} onCell={(c, v) => onChange({rows: rows.map((x, i) => i === r ? x.map((y, j) => j === c ? v : y) : x)}, 'c' + r + ':' + c)} onRemove={rows.length > 1 ? () => onChange({rows: rows.filter((_, i) => i !== r)}, 'row-') : undefined} />
        ))}
      </div>
      <div className="rc-pdf-inline">
        <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" disabled={rows.length >= 30} onClick={() => onChange({rows: [...rows, headers.map(() => '…')]}, 'row+')}><Plus aria-hidden="true" />Fila</button>
        <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" disabled={cols >= 6} onClick={() => onChange({headers: [...headers, '…'], rows: rows.map(r => [...r, '…'])}, 'col+')}><Plus aria-hidden="true" />Columna</button>
      </div>
    </div>
  );
}

function RowCells({row, r, onCell, onRemove}: {row: string[]; r: number; onCell: (c: number, v: string) => void; onRemove?: () => void}) {
  return (
    <>
      {row.map((cell, c) => <input key={c} className="rc-input rc-pdf-cell" aria-label={`Fila ${r + 1}, columna ${c + 1}`} value={cell} maxLength={8000} onChange={e => onCell(c, e.target.value)} />)}
      <button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label={'Quitar fila ' + (r + 1)} disabled={!onRemove} onClick={onRemove}><Minus /></button>
    </>
  );
}

function ImageForm({api, block}: {api: EditorApi; block: Extract<Block, {type: 'image'}>}) {
  const src = block.assetId ? api.book.assets[block.assetId] : undefined;
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [batch, setBatch] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const askFirst = useCinemaUi(s => s.askFirst);
  const jobs = useCinema(s => s.data.jobs);
  const job = useMemo(() => batch ? jobs.find(j => j.batchId === batch) : undefined, [jobs, batch]);
  const set = (patch: Partial<Block>, key: string) => api.updateBlock(block.id, patch, block.id + ':' + key);

  async function apply(load: () => Promise<string>) {
    setBusy(true);
    try {
      api.setImage(block.id, await load());
    } catch (e) {
      toast(imageErrors[e instanceof Error ? e.message : ''] || 'No se pudo usar esa imagen.');
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    setBatch(await startGeneration({mode: 'create', prompt: block.prompt.trim(), aspect: '4:3', resolution: '1K', references: [], count: 1}));
  }

  return (
    <>
      <div className="rc-pdf-image">
        {src ? <img src={src} alt={block.alt} /> : <span>Sin archivo todavía</span>}
      </div>
      <div className="rc-pdf-inline rc-pdf-inline--wrap">
        <label className="rc-btn rc-btn--secondary rc-btn--sm">
          <Upload aria-hidden="true" />Subir
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void apply(() => blobToDataUrl(f)); }} />
        </label>
        <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" disabled={busy} onClick={() => setPicker(true)}><Images aria-hidden="true" />De Cinema</button>
        {src ? <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" disabled={busy} onClick={() => api.setImage(block.id, null)}>Quitar</button> : null}
      </div>

      <Text label="Descripción (pie de imagen)" value={block.alt} onChange={alt => set({alt}, 'alt')} />
      <Text label="Prompt para generarla" value={block.prompt} onChange={prompt => set({prompt}, 'prompt')} rows={3} />

      <div className="rc-pdf-generate">
        {job && isActive(job) ? (
          <span className="rc-job-status" role="status"><span className="rc-job-pulse" aria-hidden="true" />{job.state === 'generating' ? 'Generando' : job.state === 'sending' ? 'Enviando' : 'En cola'}<Elapsed since={job.createdAt} /></span>
        ) : job && isDone(job) ? (
          <div className="rc-pdf-generated">
            <img src={job.urls[0]} alt="" />
            <button type="button" className="rc-btn rc-btn--primary rc-btn--sm" disabled={busy} onClick={() => void apply(() => remoteToDataUrl(job.urls[0]))}><ImagePlus aria-hidden="true" />Usar en el libro</button>
          </div>
        ) : job ? (
          <p className="rc-pdf-warn" role="alert">No pude generarla. Revisá la tarjeta en Cinema Studio.</p>
        ) : null}
        <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" disabled={!block.prompt.trim() || Boolean(job && isActive(job))} onClick={() => askFirst ? setConfirm(true) : void generate()}>
          <Sparkles aria-hidden="true" />Generar con Cinema · 4:3 · 1K
        </button>
        <small className="rc-hint">Consume créditos de Kie. La imagen también queda en la galería de Cinema.</small>
        {api.server?.canSubmit ? (
          <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" disabled={api.server.busy} onClick={() => api.server?.submit('image', block.id)}>Regenerar con el compositor</button>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => { setConfirm(false); void generate(); }}
        title="¿Generar en Kie?"
        description="Es una tarea de imagen en Kie y consume créditos. El costo real aparece al terminar, cuando Kie lo informa."
        confirmLabel="Generar"
      >
        <dl className="rc-facts"><dt>Modelo</dt><dd>Nano Banana 2.1</dd><dt>Formato</dt><dd>4:3</dd><dt>Resolución</dt><dd>1K</dd></dl>
      </ConfirmDialog>
      <GalleryPicker open={picker} onClose={() => setPicker(false)} max={1} title="Imagen de Cinema" onChoose={urls => { if (urls[0]) void apply(() => remoteToDataUrl(urls[0])); }} />
    </>
  );
}
