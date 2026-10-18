'use client';
import {useEffect, useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {toast} from 'sonner';
import {ChevronRight, LayoutTemplate, Plus, Trash2, Upload} from 'lucide-react';
import {createUnitFrom, deleteUnit, importUnitPdf, listUnits, restoreUnit} from '@/lib/manual/store';
import type {ImportReport} from '@/lib/manual/segment';
import type {Unit} from '@/lib/manual/model';
import {libraryEvents} from '@/lib/books/library';
import {ConfirmDialog, Dialog} from '@/components/ui/dialog';

const dateFormat = new Intl.DateTimeFormat('es-AR', {day: 'numeric', month: 'short', year: 'numeric'});
const plural = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many);

/** What the import did, in words. */
export function importSummary(r: ImportReport) {
  const parts = [plural(r.editablePages, 'página editable', 'páginas editables')];
  if (r.conservedPages) parts.push(plural(r.conservedPages, 'página conservada tal cual', 'páginas conservadas tal cual'));
  const hidden = r.pages.reduce((n, p) => n + p.hidden + p.covers, 0);
  if (hidden) parts.push(plural(hidden, 'parche oculto limpiado', 'parches ocultos limpiados') + ' sin cambiar cómo se ve');
  return parts.join(' · ');
}

/** The «Manual» section of PDF Studio: units of the book, imported keeping their design or made from one. */
export function ManualSection() {
  const router = useRouter();
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<Unit | null>(null);

  useEffect(() => {
    const load = () => { listUnits().then(setUnits).catch(() => setUnits([])); };
    load();
    libraryEvents?.addEventListener('synced', load);
    libraryEvents?.addEventListener('change', load);
    return () => { libraryEvents?.removeEventListener('synced', load); libraryEvents?.removeEventListener('change', load); };
  }, []);

  async function importFile(file?: File) {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { toast('Elegí un PDF de la unidad.'); return; }
    setBusy('Leyendo «' + file.name + '»…');
    try {
      const {id, report} = await importUnitPdf(file.name, new Uint8Array(await file.arrayBuffer()));
      toast('Unidad importada: ' + importSummary(report) + '.', {duration: 9000});
      router.push('/workspace/manual?id=' + id);
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      toast(/password|encrypt/i.test(code) ? 'Ese PDF tiene contraseña. Guardalo sin contraseña e importalo de nuevo.' : 'No se pudo leer ese PDF como unidad del manual.', {duration: 9000});
    } finally { setBusy(null); }
  }

  async function confirmRemove() {
    if (!removing) return;
    const saved = await deleteUnit(removing.id);
    setRemoving(null);
    if (saved) toast('Unidad borrada', {action: {label: 'Deshacer', onClick: () => { void restoreUnit(saved); }}, duration: 8000});
  }

  const models = (units || []).filter(u => u.template.exerciseHeader);

  return (
    <section className="rc-page-section rc-man-home">
      <h2>Manual</h2>
      <p className="rc-hint rc-pdf-home-note">Las unidades del libro con su diseño intacto. Corregís el texto, movés y reemplazás imágenes, y agregás ejercicios que salen con el mismo diseño de la unidad. Las páginas que no tocás se exportan iguales al original.</p>
      <div className="rc-pdf-home-actions">
        <label className="rc-btn rc-btn--secondary" aria-disabled={Boolean(busy)}>
          <Upload aria-hidden="true" />{busy ? 'Importando…' : 'Importar unidad (PDF)'}
          <input type="file" accept="application/pdf,.pdf" className="sr-only" disabled={Boolean(busy)} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; void importFile(f); }} />
        </label>
        <button type="button" className="rc-btn rc-btn--ghost" disabled={!models.length} onClick={() => setCreating(true)}><LayoutTemplate aria-hidden="true" />Nueva unidad con el diseño</button>
      </div>
      {busy ? <p className="rc-hint" role="status">{busy}</p> : null}
      {!models.length && units?.length === 0 ? <p className="rc-hint">Para crear unidades nuevas con el diseño del manual, primero importá una unidad: su diseño es la plantilla.</p> : null}
      {units === null ? (
        <div className="rc-history-loading" role="status" aria-label="Cargando unidades"><span className="rc-skeleton" /></div>
      ) : units.length ? (
        <ul className="rc-project-list">
          {units.map(u => (
            <li key={u.id} className="rc-pdf-project-row">
              <Link href={'/workspace/manual?id=' + u.id} className="rc-project-row">
                <span className="rc-project-name">{u.title}</span>
                <span className="rc-project-type">{plural(u.pages.length, 'página', 'páginas')} · {dateFormat.format(new Date(u.updatedAt))}</span>
                <ChevronRight aria-hidden="true" />
              </Link>
              <button type="button" className="rc-icon-btn" aria-label={'Borrar ' + u.title} onClick={() => setRemoving(u)}><Trash2 aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      ) : null}
      <NewUnitDialog open={creating} models={models} onClose={() => setCreating(false)} onCreated={id => router.push('/workspace/manual?id=' + id)} />
      <ConfirmDialog
        open={Boolean(removing)} onClose={() => setRemoving(null)} onConfirm={() => void confirmRemove()} tone="danger" confirmLabel="Borrar unidad"
        title={'¿Borrar «' + (removing?.title || '') + '»?'} description="Se borra de tu cuenta con sus versiones, también en tus otras computadoras. Si querés conservarla, exportá el PDF antes."
      />
    </section>
  );
}

function NewUnitDialog({open, models, onClose, onCreated}: {open: boolean; models: Unit[]; onClose: () => void; onCreated: (id: string) => void}) {
  const [model, setModel] = useState('');
  const [title, setTitle] = useState('');
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const first = models[0];
    setModel(first?.id || '');
    const n = Math.max(0, ...models.map(m => Number(m.number) || 0)) + 1;
    setNumber(String(n));
    setTitle('Урок ' + n);
  }, [open, models]);
  async function create() {
    const m = models.find(x => x.id === model);
    if (!m) return;
    setBusy(true);
    try { onCreated(await createUnitFrom(m, title, number.trim() || undefined)); onClose(); }
    catch { toast('No se pudo crear la unidad en este navegador.'); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onClose={onClose} title="Nueva unidad con el diseño del manual" description="Arranca con una página con el pie y la pestaña de la unidad modelo. Los ejercicios que agregues salen con su mismo encabezado, colores y medidas.">
      <form className="rc-dialog-body" onSubmit={e => { e.preventDefault(); void create(); }}>
        <label className="rc-field"><span>Diseño de</span>
          <select className="rc-input" value={model} onChange={e => setModel(e.target.value)}>
            {models.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
        </label>
        <label className="rc-field"><span>Título</span><input className="rc-input" required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label className="rc-field"><span>Número de unidad</span><input className="rc-input" maxLength={10} value={number} onChange={e => setNumber(e.target.value)} /><small className="rc-hint">Va en la pestaña lateral y en los códigos de audio ({(number || '1') + '.01'}, {(number || '1') + '.02'}…).</small></label>
        <div className="rc-dialog-footer rc-dialog-footer--end">
          <button type="button" className="rc-btn rc-btn--ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="rc-btn rc-btn--primary" disabled={busy || !title.trim() || !model}><Plus aria-hidden="true" />Crear unidad</button>
        </div>
      </form>
    </Dialog>
  );
}
