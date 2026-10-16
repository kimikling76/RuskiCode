'use client';
import {useMemo, useState} from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import {Check, RotateCcw, Trash2} from 'lucide-react';
import {useNotes} from '@/store/book-notes';
import {Segmented} from '@/components/cinema/controls';
import {Tip} from '@/components/ui/tooltip';
import {blockSummary, type EditorApi} from './editor-api';

const when = new Intl.DateTimeFormat('es-AR', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});

/** Notes anchored to blocks, from the author or saved from the assistant. Stored in this browser. */
export function NotesPanel({api, bookKey, onGoToBlock}: {api: EditorApi; bookKey: string; onGoToBlock: (id: string) => void}) {
  const all = useNotes(s => s.notes);
  const add = useNotes(s => s.add);
  const update = useNotes(s => s.update);
  const remove = useNotes(s => s.remove);
  const [scope, setScope] = useState<'chapter' | 'book'>('chapter');
  const [showResolved, setShowResolved] = useState(false);
  const [text, setText] = useState('');
  const {chapter, blockId} = api.selection;
  const blocks = useMemo(() => new Map(api.book.chapters.flatMap((c, i) => c.blocks.map(b => [b.id, {block: b, chapter: i}] as const))), [api.book.chapters]);
  const notes = all.filter(n => n.book === bookKey && (scope === 'book' || n.chapter === chapter) && (showResolved || !n.resolved));
  const anchor = blockId ? blocks.get(blockId)?.block : undefined;

  function save() {
    if (!text.trim()) return;
    add([{id: crypto.randomUUID(), book: bookKey, blockId: anchor ? blockId : null, chapter: Math.max(0, chapter), text: text.trim(), author: 'Vos', createdAt: Date.now()}]);
    setText('');
  }

  return (
    <div className="rc-pdf-form">
      <Segmented name="notes-scope" label="Mostrar notas" value={scope} onChange={setScope} options={[{value: 'chapter', label: 'Este capítulo'}, {value: 'book', label: 'Todo el libro'}]} />
      <label className="rc-field">
        <span>{anchor ? 'Nota sobre: ' + blockSummary(anchor).slice(0, 50) : 'Nota sobre el capítulo'}</span>
        <TextareaAutosize className="rc-textarea rc-pdf-text" minRows={2} maxRows={8} maxLength={2000} value={text} onChange={e => setText(e.target.value)} placeholder="Qué revisar o cambiar" />
      </label>
      <div className="rc-pdf-inline">
        <button type="button" className="rc-btn rc-btn--secondary rc-btn--sm" disabled={!text.trim() || chapter < 0} onClick={save}>Agregar nota</button>
        <label className="rc-check rc-pdf-check"><input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} /><span>Mostrar resueltas</span></label>
      </div>
      <p className="rc-hint">Las notas se guardan en este navegador; todavía no se comparten.</p>

      {notes.length ? (
        <ul className="rc-pdf-notes">
          {notes.map(note => {
            const target = note.blockId ? blocks.get(note.blockId) : undefined;
            return (
              <li key={note.id} data-resolved={note.resolved ? 'true' : undefined} data-severity={note.severity}>
                <div className="rc-pdf-note-head">
                  <span>{note.author}{note.severity ? ' · ' + (note.severity === 'error' ? 'Error' : note.severity === 'warning' ? 'A revisar' : 'Sugerencia') : ''} · {when.format(new Date(note.createdAt))}</span>
                  <span className="rc-pdf-form-actions">
                    <Tip label={note.resolved ? 'Reabrir' : 'Marcar como resuelta'}>
                      <button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label={note.resolved ? 'Reabrir nota' : 'Marcar como resuelta'} onClick={() => update(note.id, {resolved: !note.resolved})}>{note.resolved ? <RotateCcw /> : <Check />}</button>
                    </Tip>
                    <Tip label="Borrar"><button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label="Borrar nota" onClick={() => remove(note.id)}><Trash2 /></button></Tip>
                  </span>
                </div>
                {target ? (
                  <button type="button" className="rc-pdf-note-anchor" onClick={() => onGoToBlock(note.blockId!)}>{blockSummary(target.block).slice(0, 60) || '—'}</button>
                ) : note.blockId ? <span className="rc-hint">El bloque ya no existe.</span> : <span className="rc-hint">Capítulo {note.chapter + 1}</span>}
                <p>{note.text}</p>
                {note.suggestion ? <p className="rc-pdf-suggestion">{note.suggestion}</p> : null}
              </li>
            );
          })}
        </ul>
      ) : <p className="rc-hint rc-pdf-empty">Sin notas {scope === 'chapter' ? 'en este capítulo' : 'en el libro'}.</p>}
    </div>
  );
}
