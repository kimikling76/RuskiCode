'use client';
import {useEffect, useState} from 'react';
import {toast} from 'sonner';
import {Upload} from 'lucide-react';
import {Dialog} from '@/components/ui/dialog';
import {commitImport, previewImport, type ImportPictures} from '@/lib/kb/store';
import {fileKindName, type ImportFile, type ImportPlan, type ImportReport} from '@/lib/kb/import';
import {kindName, statusName, type KbEntry, type KbProject} from '@/lib/kb/model';

const MAX_FILE = 2_000_000;
/** An export of the base carries its pictures, so it may be much larger than a text file. */
const MAX_PACKAGE = 64_000_000;
type Preview = {plan: ImportPlan; entries: KbEntry[]; report: ImportReport; pictures: ImportPictures};

async function readFiles(list: FileList | File[]) {
  const files: ImportFile[] = [];
  const skipped: string[] = [];
  for (const f of [...list]) {
    if (!/\.(md|txt|json)$/i.test(f.name) || f.size > (/\.json$/i.test(f.name) ? MAX_PACKAGE : MAX_FILE)) { skipped.push(f.name); continue; }
    files.push({name: f.name, text: await f.text()});
  }
  return {files, skipped};
}

const count = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many);

/** Picks the package's text files, shows what importing them would do, and saves only after the person confirms. */
export function ImportButton({project}: {project: KbProject}) {
  const [files, setFiles] = useState<ImportFile[] | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!files) { setPreview(null); return; }
    let alive = true;
    previewImport(project, files).then(p => { if (alive) setPreview(p); }).catch(() => { if (alive) { toast('No se pudieron leer esos archivos.'); setFiles(null); } });
    return () => { alive = false; };
  }, [files, project]);

  async function pick(list: FileList | null) {
    if (!list?.length) return;
    const r = await readFiles(list);
    setSkipped(r.skipped);
    if (!r.files.length) { toast('Elegí archivos .md, .txt (hasta 2 MB) o .json (hasta 64 MB) del paquete del libro.'); return; }
    setFiles(r.files);
  }

  async function confirm() {
    if (!files) return;
    setBusy(true);
    try {
      const {report, saved, pictures} = await commitImport(project, files);
      toast(saved ? 'Importado: ' + count(report.created.length, 'dato nuevo', 'datos nuevos') + ', ' + count(report.updated.length, 'actualizado', 'actualizados') + (pictures.added ? ', ' + count(pictures.added, 'imagen', 'imágenes') : '') + '.' : 'Nada para cambiar: la base ya tenía todo eso.', {duration: 8000});
      setFiles(null);
    } catch {
      toast('No se pudo guardar la importación en este navegador.');
    } finally { setBusy(false); }
  }

  const byStatus = preview ? Object.entries(preview.entries.filter(e => preview.report.created.includes(e.id)).reduce<Record<string, number>>((m, e) => ({...m, [e.status]: (m[e.status] || 0) + 1}), {})) : [];
  const byKind = preview ? Object.entries(preview.entries.reduce<Record<string, number>>((m, e) => ({...m, [e.kind]: (m[e.kind] || 0) + 1}), {})) : [];

  return (
    <>
      <label className="rc-btn rc-btn--secondary">
        <Upload aria-hidden="true" />Importar archivos
        <input type="file" multiple accept=".md,.txt,.json,text/markdown,text/plain,application/json" className="sr-only" onChange={e => { const l = e.target.files; void pick(l).finally(() => { e.target.value = ''; }); }} />
      </label>
      <Dialog open={Boolean(files)} onClose={() => setFiles(null)} wide title="Importar al contexto del libro"
        description="Los archivos se leen como material de referencia: nada queda aprobado por estar en un archivo, y lo que ya aprobaste no se cambia.">
        <div className="rc-dialog-body rc-kb-import">
          {!preview ? <p className="rc-hint" role="status">Leyendo los archivos…</p> : (
            <>
              <ul className="rc-kb-import-files">
                {preview.plan.files.map(f => (
                  <li key={f.name}><strong>{f.name}</strong><span className="rc-hint">{fileKindName[f.kind]} · {count(f.patches, 'dato', 'datos')}</span></li>
                ))}
                {skipped.map(n => <li key={n}><strong>{n}</strong><span className="rc-hint">No se importa: solo .md o .txt de hasta 2 MB y .json de hasta 64 MB. Las imágenes y los PDF sueltos se agregan en cada personaje.</span></li>)}
              </ul>
              <p className="rc-kb-import-sum">
                {count(preview.report.created.length, 'dato nuevo', 'datos nuevos')} · {count(preview.report.updated.length, 'actualizado (con versión nueva)', 'actualizados (con versión nueva)')} · {count(preview.report.unchanged.length, 'sin cambios', 'sin cambios')}
              </p>
              {byKind.length ? <p className="rc-hint">{byKind.map(([k, n]) => kindName[k as KbEntry['kind']] + ': ' + n).join(' · ')}</p> : null}
              {byStatus.length ? <p className="rc-hint">Los nuevos entran como: {byStatus.map(([s, n]) => statusName[s as KbEntry['status']].toLowerCase() + ' ' + n).join(' · ')}.</p> : null}
              {preview.plan.files.some(f => f.kind === 'export') ? <p className="rc-hint rc-kb-warning">Este archivo es una base exportada: trae los estados que tenía (lo aprobado entra aprobado){preview.pictures.approved ? ' y ' + count(preview.pictures.approved, 'imagen aprobada', 'imágenes aprobadas') : ''}. Importalo solo si lo exportaste vos o sabés de dónde viene.</p> : null}
              {preview.pictures.added ? <p className="rc-hint">Imágenes de personajes: {preview.pictures.added} ({preview.pictures.approved} aprobadas). Se guardan en este navegador y se suben a tu cuenta con los datos.</p> : null}
              {preview.pictures.left.length ? <p className="rc-hint rc-kb-warning">No vienen en el archivo ni están en este navegador o tu cuenta, así que no se agregan: {preview.pictures.left.join(', ')}.</p> : null}
              {preview.pictures.bad.length ? <p className="rc-form-error">No coinciden con su huella (archivo dañado o cambiado) y no se importan: {preview.pictures.bad.join(', ')}.</p> : null}
              {preview.report.kept.length ? (
                <div className="rc-kb-import-kept">
                  <strong>Aprobados que el archivo contradice (no se cambian)</strong>
                  <ul>{preview.report.kept.map(k => <li key={k.id}>{k.title}: {k.fields.join(', ')} · según {k.file}</li>)}</ul>
                </div>
              ) : null}
              {preview.report.invalid.length ? <p className="rc-form-error">No se pudieron leer: {preview.report.invalid.map(i => i.id + ' (' + i.reason + ')').join('; ')}</p> : null}
              {preview.plan.warnings.map(w => <p key={w} className="rc-hint rc-kb-warning">{w}</p>)}
            </>
          )}
          <div className="rc-dialog-footer rc-dialog-footer--end">
            <button type="button" className="rc-btn rc-btn--ghost" onClick={() => setFiles(null)}>Cancelar</button>
            <button type="button" className="rc-btn rc-btn--primary" disabled={!preview || busy || !(preview.report.created.length + preview.report.updated.length)} onClick={() => void confirm()}>{busy ? 'Importando…' : 'Importar'}</button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
