'use client';
import {useCallback, useEffect, useRef, useState} from 'react';
import {FileText, ImageIcon, X} from 'lucide-react';
import {attachmentLimits, attachmentSummary, type ChatAttachment} from '@/lib/personal-chat/attachments';
import {AttachError, attachFile, localPreview} from '@/lib/personal-chat/attach-browser';

export type AttachmentDraft = {id: string; name: string; image: boolean; status: 'reading' | 'ready' | 'error'; attachment?: ChatAttachment; error?: string};

const assetUrl = (a: ChatAttachment) => localPreview(a.hash) || '/api/sync/assets?hash=' + a.hash;

/** Files waiting in the composer: each one is read and stored as soon as it is added. */
export function useAttachments() {
  const [drafts, setDrafts] = useState<AttachmentDraft[]>([]);
  const current = useRef(drafts);
  current.current = drafts;
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const add = useCallback((files: File[]) => {
    if (!files.length) return;
    const room = attachmentLimits.perMessage - current.current.filter(d => d.status !== 'error').length;
    const taken = files.slice(0, Math.max(0, room));
    const draft = (f: File, extra: Partial<AttachmentDraft>): AttachmentDraft => ({id: crypto.randomUUID(), name: f.name || 'imagen', image: f.type.startsWith('image/'), status: 'reading', ...extra});
    const added = taken.map(f => draft(f, {}));
    const over = files.slice(taken.length).map(f => draft(f, {status: 'error', error: 'Hasta ' + attachmentLimits.perMessage + ' archivos por mensaje.'}));
    current.current = [...current.current, ...added, ...over];
    setDrafts(current.current);
    taken.forEach((file, i) => {
      const id = added[i].id;
      attachFile(file).then(
        attachment => { if (alive.current) setDrafts(ds => ds.map(d => d.id === id ? {...d, status: 'ready', attachment} : d)); },
        e => { if (alive.current) setDrafts(ds => ds.map(d => d.id === id ? {...d, status: 'error', error: e instanceof AttachError ? e.message : 'No se pudo leer el archivo.'} : d)); },
      );
    });
  }, []);

  const remove = useCallback((id: string) => setDrafts(ds => ds.filter(d => d.id !== id)), []);
  const clear = useCallback(() => setDrafts([]), []);
  const ready = drafts.flatMap(d => d.status === 'ready' && d.attachment ? [d.attachment] : []);
  return {drafts, add, remove, clear, ready, reading: drafts.some(d => d.status === 'reading')};
}

/** The files of a pasted or dropped DataTransfer. */
export function filesOf(data: DataTransfer | null) {
  return data ? [...data.files] : [];
}

export function AttachmentTray({drafts, onRemove}: {drafts: AttachmentDraft[]; onRemove: (id: string) => void}) {
  if (!drafts.length) return null;
  return (
    <ul className="rc-attach-tray" aria-label="Archivos adjuntos">
      {drafts.map(d => (
        <li key={d.id} className="rc-attach" data-state={d.status}>
          {d.attachment?.kind === 'image' ? <img src={assetUrl(d.attachment)} alt="" className="rc-attach-thumb" /> : (
            <span className="rc-attach-icon" aria-hidden="true">{d.image ? <ImageIcon /> : <FileText />}</span>
          )}
          <span className="rc-attach-text">
            <strong title={d.name}>{d.name}</strong>
            {d.status === 'reading' ? <small role="status">{d.image ? 'Preparando…' : 'Leyendo…'}</small>
              : d.status === 'error' ? <small className="rc-attach-error" role="alert">{d.error}</small>
                : <small>{attachmentSummary(d.attachment!)}{d.attachment!.truncated ? ' · se envía una parte' : ''}</small>}
          </span>
          <button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label={'Quitar ' + d.name} onClick={() => onRemove(d.id)}><X /></button>
        </li>
      ))}
    </ul>
  );
}

/** What a sent message carried: images as thumbnails, documents as a chip with what was read. */
export function MessageFiles({files}: {files: ChatAttachment[]}) {
  const images = files.filter(f => f.kind === 'image');
  const documents = files.filter(f => f.kind === 'document');
  return (
    <div className="rc-msg-files">
      {images.length ? (
        <ul className="rc-msg-images" aria-label="Imágenes adjuntas">
          {images.map(f => (
            <li key={f.hash}>
              <a href={assetUrl(f)} target="_blank" rel="noreferrer" aria-label={'Abrir la imagen ' + f.name}>
                <img src={assetUrl(f)} alt={f.name} loading="lazy" />
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {documents.map(f => (
        <div key={f.hash} className="rc-msg-doc">
          <FileText aria-hidden="true" />
          <span>
            <strong title={f.name}>{f.name}</strong>
            <small>
              {attachmentSummary(f)}
              {f.emptyPages ? ' · ' + f.emptyPages + (f.emptyPages === 1 ? ' página sin texto' : ' páginas sin texto') : ''}
              {f.truncated ? ' · se envían los primeros ' + attachmentLimits.documentChars.toLocaleString('es-AR') + ' caracteres' : ''}
            </small>
          </span>
        </div>
      ))}
    </div>
  );
}
