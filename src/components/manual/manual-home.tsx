'use client';
import {useEffect, useState} from 'react';
import {useRouter} from 'next/navigation';
import {toast} from 'sonner';
import {Plus} from 'lucide-react';
import {createUnitFrom, deleteUnit, importUnitPdf, restoreUnit} from '@/lib/manual/store';
import type {ImportReport} from '@/lib/manual/segment';
import type {Unit} from '@/lib/manual/model';
import {Dialog} from '@/components/ui/dialog';

const plural = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many);

/** What the import did, in words. */
export function importSummary(r: ImportReport) {
  const parts = [plural(r.editablePages, 'página editable', 'páginas editables')];
  if (r.conservedPages) parts.push(plural(r.conservedPages, 'página conservada tal cual', 'páginas conservadas tal cual'));
  const hidden = r.pages.reduce((n, p) => n + p.hidden + p.covers, 0);
  if (hidden) parts.push(plural(hidden, 'parche oculto limpiado', 'parches ocultos limpiados') + ' sin cambiar cómo se ve');
  return parts.join(' · ');
}

/** Imports a unit's PDF keeping its design, then opens it. `busy` says what is being read. */
export function useManualImport() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  async function importUnit(file: File) {
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
  return {busy, importUnit};
}

/** Units that can lend their design to a new one: the ones with an exercise header. */
export const designModels = (units: Unit[]) => units.filter(u => u.template.exerciseHeader);

/** Deletes a unit with a short undo. */
export async function removeUnit(unit: Unit) {
  const saved = await deleteUnit(unit.id);
  if (saved) toast('Unidad borrada', {action: {label: 'Deshacer', onClick: () => { void restoreUnit(saved); }}, duration: 8000});
}

export function NewUnitDialog({open, models, onClose, onCreated}: {open: boolean; models: Unit[]; onClose: () => void; onCreated: (id: string) => void}) {
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
