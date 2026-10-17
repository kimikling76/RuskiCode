'use client';
import {useEffect, useState, type ReactNode} from 'react';
import {ArrowDownToLine, FilePlus2, FileText, Layers, MessageSquarePlus, RotateCw, ScanText, Trash2, Type, Replace, Scissors} from 'lucide-react';
import {toast} from 'sonner';
import {operationInfo, ocrLanguages, ocrLanguageNames, pageRanges, MAX_PDF_BYTES, type OperationId} from '@/lib/stirling/operations';
import {creditEstimate} from '@/lib/stirling/client';
import {isPdf} from '@/lib/books/originals';
import {parsePages} from './doc-view';

export type ToolRequest = {op: OperationId; params: Record<string, unknown>; label: string; second?: ArrayBuffer; preview?: boolean};

function Tool({icon, op, title, children, open, onToggle}: {icon: ReactNode; op: OperationId; title?: string; children: ReactNode; open: boolean; onToggle: () => void}) {
  return (
    <section className="rc-doc-tool" data-open={open ? 'true' : undefined}>
      <button type="button" className="rc-doc-tool-head" aria-expanded={open} onClick={onToggle}>
        {icon}<span>{title || operationInfo[op].label}</span><small>{creditEstimate(op)}</small>
      </button>
      {open ? <div className="rc-doc-tool-body"><p className="rc-hint">{operationInfo[op].effect}</p>{children}</div> : null}
    </section>
  );
}

/**
 * The page tools, each one a Stirling PDF operation through this site's server.
 * Structure changes apply at once and can be undone; replacing text always shows the real result first.
 */
export function DocTools({count, active, selected, busy, unavailable, run}: {
  count: number; active: number; selected: Set<number>; busy: boolean; unavailable: string | null; run: (r: ToolRequest) => void;
}) {
  const [open, setOpen] = useState<string | null>('pages');
  const chosen = selected.size ? [...selected].map(i => i + 1) : [active + 1];
  const [pagesText, setPagesText] = useState(pageRanges(chosen).replace(/–/g, '-'));
  useEffect(() => { setPagesText(pageRanges(chosen).replace(/–/g, '-')); }, [active, selected]); // eslint-disable-line react-hooks/exhaustive-deps
  const pages = parsePages(pagesText, count);
  const [after, setAfter] = useState(String(active + 1));
  useEffect(() => { setAfter(String(active + 1)); }, [active]);
  const afterNum = /^\d+$/.test(after) && Number(after) <= count ? Number(after) : null;
  const [note, setNote] = useState('');
  const [stamp, setStamp] = useState({text: '', position: 3, size: 16, color: '#216B5C'});
  const [edits, setEdits] = useState([{find: '', replace: ''}]);
  const [langs, setLangs] = useState<string[]>(['rus', 'eng']);
  const [force, setForce] = useState(false);
  const toggle = (id: string) => setOpen(o => o === id ? null : id);
  const off = busy || Boolean(unavailable);
  const pagesLabel = pages ? (pages.length === 1 ? 'la página ' + pages[0] : 'las páginas ' + pageRanges(pages)) : '';

  const pagesField = (
    <label className="rc-field"><span>Páginas</span>
      <input className="rc-input" value={pagesText} onChange={e => setPagesText(e.target.value)} inputMode="numeric" aria-invalid={!pages} aria-describedby="doc-pages-hint" />
      <small id="doc-pages-hint" className="rc-hint">{pages ? 'Por ejemplo «1, 3-5». Elegilas también en las miniaturas (Ctrl o Mayús + clic).' : 'Escribí números de página que existan, como «2» o «3-5».'}</small>
    </label>
  );
  const afterField = (
    <label className="rc-field"><span>Después de la página</span>
      <input className="rc-input" value={after} onChange={e => setAfter(e.target.value)} inputMode="numeric" aria-invalid={afterNum === null} />
      <small className="rc-hint">0 = al principio.</small>
    </label>
  );

  async function insertPdf(file: File | undefined) {
    if (!file || afterNum === null) return;
    if (file.size > MAX_PDF_BYTES) { toast('Ese PDF pesa más de 4 MB, el máximo que pasa por el servidor.'); return; }
    const bytes = await file.arrayBuffer();
    if (!isPdf(bytes)) { toast('Ese archivo no es un PDF.'); return; }
    run({op: 'insert-pdf', params: {after: afterNum}, label: 'Insertar «' + file.name.replace(/\.pdf$/i, '') + '» después de la página ' + afterNum, second: bytes});
  }

  return (
    <div className="rc-pdf-form rc-doc-tools">
      {unavailable ? <p className="rc-notice" role="status"><span className="rc-dot" aria-hidden="true" />{unavailable}</p> : null}

      <Tool icon={<Layers aria-hidden="true" />} op="move" title="Páginas: rotar, mover, borrar, extraer" open={open === 'pages'} onToggle={() => toggle('pages')}>
        {pagesField}
        <div className="rc-pdf-inline rc-pdf-inline--wrap">
          <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" disabled={off || !pages} onClick={() => run({op: 'rotate', params: {pages, angle: 90}, label: 'Rotar ' + pagesLabel})}><RotateCw aria-hidden="true" />Rotar 90°</button>
          <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" disabled={off || !pages || pages.length >= count} onClick={() => run({op: 'remove', params: {pages}, label: 'Borrar ' + pagesLabel})}><Trash2 aria-hidden="true" />Borrar</button>
          <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" disabled={off || !pages} onClick={() => run({op: 'extract', params: {pages}, label: 'Extraer ' + pagesLabel, preview: true})}><Scissors aria-hidden="true" />Extraer a un PDF nuevo</button>
        </div>
        {afterField}
        <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" disabled={off || !pages || afterNum === null} onClick={() => run({op: 'move', params: {pages, after: afterNum}, label: 'Mover ' + pagesLabel + ' después de la página ' + afterNum})}>Mover ahí</button>
      </Tool>

      <Tool icon={<FilePlus2 aria-hidden="true" />} op="insert-pdf" open={open === 'insert'} onToggle={() => toggle('insert')}>
        {afterField}
        <label className="rc-btn rc-btn--secondary rc-btn--sm" aria-disabled={off || afterNum === null}>
          Elegir el PDF…
          <input type="file" accept="application/pdf,.pdf" className="sr-only" disabled={off || afterNum === null} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; void insertPdf(f); }} />
        </label>
      </Tool>

      <Tool icon={<MessageSquarePlus aria-hidden="true" />} op="note" open={open === 'note'} onToggle={() => toggle('note')}>
        <label className="rc-field"><span>Nota en la página {active + 1}</span>
          <textarea className="rc-textarea" rows={3} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} />
        </label>
        <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" disabled={off || !note.trim()} onClick={() => { run({op: 'note', params: {page: active + 1, text: note.trim()}, label: 'Nota en la página ' + (active + 1)}); setNote(''); }}>Agregar nota</button>
      </Tool>

      <Tool icon={<Type aria-hidden="true" />} op="stamp" open={open === 'stamp'} onToggle={() => toggle('stamp')}>
        <label className="rc-field"><span>Texto</span><input className="rc-input" maxLength={300} value={stamp.text} onChange={e => setStamp({...stamp, text: e.target.value})} /></label>
        {pagesField}
        <div className="rc-doc-stamp-row">
          <label className="rc-field"><span>Lugar</span>
            <select className="rc-input" value={stamp.position} onChange={e => setStamp({...stamp, position: Number(e.target.value)})}>
              {['Arriba a la izquierda', 'Arriba al centro', 'Arriba a la derecha', 'Medio izquierda', 'Centro', 'Medio derecha', 'Abajo a la izquierda', 'Abajo al centro', 'Abajo a la derecha'].map((l, i) => <option key={l} value={i + 1}>{l}</option>)}
            </select>
          </label>
          <label className="rc-field"><span>Tamaño</span><input className="rc-input" type="number" min={6} max={96} value={stamp.size} onChange={e => setStamp({...stamp, size: Math.max(6, Math.min(96, Number(e.target.value) || 16))})} /></label>
          <label className="rc-field"><span>Color</span><input className="rc-input rc-doc-color" type="color" value={stamp.color} onChange={e => setStamp({...stamp, color: e.target.value})} /></label>
        </div>
        <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" disabled={off || !stamp.text.trim() || !pages} onClick={() => run({op: 'stamp', params: {pages, text: stamp.text.trim(), position: stamp.position, size: stamp.size, color: stamp.color, opacity: 1}, label: 'Texto superpuesto en ' + pagesLabel})}>Superponer</button>
      </Tool>

      <Tool icon={<Replace aria-hidden="true" />} op="replace-text" open={open === 'replace'} onToggle={() => toggle('replace')}>
        {edits.map((e, i) => (
          <div key={i} className="rc-doc-edit-row">
            <label className="rc-field"><span>Buscar</span><input className="rc-input" lang="ru" maxLength={500} value={e.find} onChange={ev => setEdits(edits.map((x, j) => j === i ? {...x, find: ev.target.value} : x))} /></label>
            <label className="rc-field"><span>Reemplazar por</span><input className="rc-input" lang="ru" maxLength={500} value={e.replace} onChange={ev => setEdits(edits.map((x, j) => j === i ? {...x, replace: ev.target.value} : x))} /></label>
          </div>
        ))}
        <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" disabled={edits.length >= 10} onClick={() => setEdits([...edits, {find: '', replace: ''}])}>Otro reemplazo</button>
        {pagesField}
        <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" disabled={off || !pages || !edits.some(e => e.find.trim())} onClick={() => run({op: 'replace-text', params: {pages, edits: edits.filter(e => e.find.trim()).map(e => ({find: e.find, replace: e.replace}))}, label: 'Reemplazar texto en ' + pagesLabel, preview: true})}>Ver vista previa</button>
      </Tool>

      <Tool icon={<ScanText aria-hidden="true" />} op="ocr" open={open === 'ocr'} onToggle={() => toggle('ocr')}>
        <fieldset className="rc-doc-langs"><legend>Idiomas del documento</legend>
          {ocrLanguages.map(l => (
            <label key={l} className="rc-check"><input type="checkbox" checked={langs.includes(l)} onChange={e => setLangs(e.target.checked ? [...langs, l].slice(0, 3) : langs.filter(x => x !== l))} />{ocrLanguageNames[l]}</label>
          ))}
        </fieldset>
        <label className="rc-check"><input type="checkbox" checked={force} onChange={e => setForce(e.target.checked)} />Rehacer también las páginas que ya tienen texto</label>
        <p className="rc-hint">El ruso necesita su archivo de idioma en el servidor de Stirling. Las tildes de acento del ruso no se reconocen bien.</p>
        <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" disabled={off || !langs.length} onClick={() => run({op: 'ocr', params: {languages: langs, force}, label: 'Reconocer texto (OCR)', preview: true})}>Reconocer texto</button>
      </Tool>

      <Tool icon={<FileText aria-hidden="true" />} op="to-word" open={open === 'word'} onToggle={() => toggle('word')}>
        <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" disabled={off} onClick={() => run({op: 'to-word', params: {}, label: 'Convertir a Word'})}><ArrowDownToLine aria-hidden="true" />Descargar .docx</button>
      </Tool>
    </div>
  );
}
