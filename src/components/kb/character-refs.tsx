'use client';
import {useEffect, useState} from 'react';
import {toast} from 'sonner';
import {FileText, ImagePlus, Star} from 'lucide-react';
import {editEntry} from '@/lib/kb/store';
import {MAX_REF_FILE, refBytes, refMimes, storeRefFile} from '@/lib/kb/files';
import type {EntryOf, KbRef} from '@/lib/kb/model';

const kindNames: Record<KbRef['kind'], string> = {sheet: 'Ficha', scene: 'Escena', turnaround: 'Vistas (giro)', 'pdf-sheet': 'Ficha en PDF', other: 'Otra'};
const reviewNames: Record<KbRef['review'], string> = {approved: 'Aprobada', observed: 'Sin revisar', rejected: 'Rechazada'};
const verifiedNames: Record<KbRef['verified'], string> = {
  manifest: 'Coincide con el manifiesto (sha256)',
  mismatch: 'No coincide con el archivo del manifiesto',
  unlisted: 'El manifiesto no tiene huella para este personaje',
};
const mb = (n: number) => (n / 1_000_000).toLocaleString('es-AR', {maximumFractionDigits: 2}) + ' MB';
export const isImage = (r: Pick<KbRef, 'mime'>) => r.mime.startsWith('image/');

/** A blob URL for a reference, made from its stored bytes; null while loading or when the file is missing. */
export function useRefUrl(ref: Pick<KbRef, 'hash' | 'chunks' | 'mime'> | null) {
  const [url, setUrl] = useState<string | null | 'missing'>(null);
  useEffect(() => {
    if (!ref) { setUrl(null); return; }
    let alive = true;
    let made: string | null = null;
    refBytes(ref).then(bytes => {
      if (!alive) return;
      if (!bytes) { setUrl('missing'); return; }
      made = URL.createObjectURL(new Blob([bytes as BlobPart], {type: ref.mime}));
      setUrl(made);
    }, () => { if (alive) setUrl('missing'); });
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [ref?.hash]); // eslint-disable-line react-hooks/exhaustive-deps
  return url;
}

export function RefThumb({file: r, label}: {file: KbRef; label: string}) {
  const url = useRefUrl(r);
  if (url === 'missing') return <span className="rc-kb-thumb rc-kb-thumb--missing">Archivo no disponible en esta computadora</span>;
  if (!isImage(r)) return <span className="rc-kb-thumb rc-kb-thumb--file"><FileText aria-hidden="true" />{url ? <a href={url} target="_blank" rel="noreferrer">Abrir PDF</a> : 'PDF'}</span>;
  return url ? <img className="rc-kb-thumb" src={url} alt={label} /> : <span className="rc-kb-thumb rc-skeleton" />;
}

/** The pictures of a character: originals kept as they are, reviewed by the author, one chosen as the main reference. */
export function CharacterRefs({entry}: {entry: EntryOf<'character'>}) {
  const d = entry.data;
  const [busy, setBusy] = useState(false);
  const refs = [...d.refs].sort((a, b) => Number(b.hash === d.mainRef) - Number(a.hash === d.mainRef) || a.addedAt - b.addedAt);

  async function change(next: KbRef[], mainRef: string | undefined, note: string) {
    const {mainRef: _old, ...rest} = d;
    try { await editEntry(entry.project, entry.id, {data: {...rest, refs: next, ...(mainRef ? {mainRef} : {})}}, note); }
    catch { toast('No se pudo guardar en este navegador.'); }
  }

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const added: KbRef[] = [];
    try {
      for (const f of [...files]) {
        const mime = (refMimes as readonly string[]).includes(f.type) ? f.type as KbRef['mime'] : /\.pdf$/i.test(f.name) ? 'application/pdf' : null;
        if (!mime) { toast('«' + f.name + '»: solo PNG, JPEG, WebP o PDF.'); continue; }
        if (f.size > MAX_REF_FILE) { toast('«' + f.name + '» pesa más de ' + mb(MAX_REF_FILE) + '.'); continue; }
        const kind: KbRef['kind'] = mime === 'application/pdf' ? 'pdf-sheet' : d.manifest?.referenceKind.includes('scene') ? 'scene' : 'sheet';
        const ref = await storeRefFile(f.name, mime, new Uint8Array(await f.arrayBuffer()), d.manifest?.sha256 ?? null, kind);
        if (d.refs.some(r => r.hash === ref.hash) || added.some(r => r.hash === ref.hash)) { toast('«' + f.name + '» ya está en la biblioteca.'); continue; }
        added.push(ref);
      }
      if (added.length) {
        await change([...d.refs, ...added], d.mainRef, 'Agregado: ' + added.map(r => r.name).join(', ').slice(0, 250));
        const v = added.find(r => r.verified === 'manifest');
        toast(v ? '«' + v.name + '» coincide con el manifiesto. Revisala y aprobala si es la vigente.' : 'Archivo agregado sin revisar.', {duration: 7000});
      }
    } catch (e) {
      toast(e instanceof Error && e.message === 'FILE_TOO_LARGE' ? 'El archivo es demasiado grande.' : 'No se pudo guardar el archivo en este navegador.');
    } finally { setBusy(false); }
  }

  const update = (hash: string, patch: Partial<KbRef>, note: string) => {
    const next = d.refs.map(r => r.hash === hash ? {...r, ...patch} : r);
    const main = patch.review === 'rejected' && d.mainRef === hash ? undefined : d.mainRef;
    void change(next, main, note);
  };

  return (
    <section className="rc-kb-block rc-kb-refs" aria-labelledby={'refs-' + entry.id}>
      <h3 id={'refs-' + entry.id}>Imágenes de referencia</h3>
      <p className="rc-hint">Se guardan sin cambios. Solo una imagen aprobada puede ser la principal, y solo las aprobadas que elijas se envían a un modelo de imagen.</p>
      {d.missing && !d.refs.length ? <p className="rc-kb-warning">Este personaje no tiene imagen verificada. Si agregás una, queda sin revisar hasta que la apruebes.</p> : null}
      {refs.length ? (
        <ul className="rc-kb-ref-list">
          {refs.map(r => (
            <li key={r.hash} className="rc-kb-ref" data-main={r.hash === d.mainRef || undefined} data-review={r.review}>
              <RefThumb file={r} label={'Referencia de ' + entry.title + ': ' + r.name} />
              <div className="rc-kb-ref-info">
                <strong>{r.hash === d.mainRef ? <><Star aria-hidden="true" />Principal · </> : null}{r.name}</strong>
                <span className="rc-hint">{reviewNames[r.review]} · {mb(r.size)}{r.chunks ? ' · guardado en ' + r.chunks.length + ' partes' : ''}</span>
                <span className="rc-hint" data-verified={r.verified}>{verifiedNames[r.verified]} · sha256 {r.hash.slice(0, 12)}…</span>
                <label className="rc-kb-ref-kind"><span className="sr-only">Tipo de referencia</span>
                  <select className="rc-input" value={r.kind} onChange={e => update(r.hash, {kind: e.target.value as KbRef['kind']}, 'Tipo de «' + r.name + '»: ' + kindNames[e.target.value as KbRef['kind']])}>
                    {Object.entries(kindNames).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
                  </select>
                </label>
                <span className="rc-kb-actions">
                  {r.review !== 'approved' ? <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" onClick={() => update(r.hash, {review: 'approved'}, 'Aprobada la imagen «' + r.name + '»')}>Aprobar</button> : null}
                  {r.review === 'approved' && isImage(r) && r.hash !== d.mainRef ? <button type="button" className="rc-btn rc-btn--primary rc-btn--sm" onClick={() => void change(d.refs, r.hash, 'Referencia principal: «' + r.name + '»')}>Usar como principal</button> : null}
                  {r.review !== 'rejected' ? <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => update(r.hash, {review: 'rejected'}, 'Rechazada la imagen «' + r.name + '»')}>Rechazar</button> : null}
                  {r.review !== 'observed' ? <button type="button" className="rc-btn rc-btn--ghost rc-btn--sm" onClick={() => update(r.hash, {review: 'observed'}, 'Imagen «' + r.name + '» a revisar')}>Volver a revisar</button> : null}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="rc-hint">Todavía no hay imágenes guardadas para este personaje.</p>}
      <label className="rc-btn rc-btn--secondary rc-btn--sm" aria-disabled={busy}>
        <ImagePlus aria-hidden="true" />{busy ? 'Guardando…' : 'Agregar imágenes o la ficha en PDF'}
        <input type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf,.pdf" className="sr-only" disabled={busy} onChange={e => { const l = e.target.files; void add(l).finally(() => { e.target.value = ''; }); }} />
      </label>
      {d.manifest?.sha256 ? <p className="rc-hint">El manifiesto espera «{d.manifest.asset}» con sha256 {d.manifest.sha256.slice(0, 12)}…: al agregar el archivo se comprueba si es el mismo.</p> : null}
    </section>
  );
}
