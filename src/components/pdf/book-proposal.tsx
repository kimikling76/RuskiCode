'use client';
import {AlertTriangle} from 'lucide-react';
import type {Block} from '@/lib/pipeline/types';
import type {BookChange} from '@/lib/assistant/book-actions';
import {Dialog} from '@/components/ui/dialog';
import {blockNames} from './editor-api';

/** A block as it will read in the book (the book's own design applies once it is on the page). */
function BlockView({block}: {block: Block}) {
  switch (block.type) {
    case 'heading': return <p className="rc-proposal-heading" data-level={block.level}>{block.text}</p>;
    case 'paragraph': case 'callout': return <p className={block.type === 'callout' ? 'rc-proposal-callout' : undefined}>{block.text}</p>;
    case 'exercise': return <div><p><strong>{block.instruction}</strong></p><ol>{block.items.map((x, i) => <li key={i}>{x}</li>)}</ol></div>;
    case 'table': return (
      <table className="rc-proposal-table"><thead><tr>{block.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>{block.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table>
    );
    case 'image': return <p className="rc-hint">Imagen por generar: «{block.prompt}»</p>;
    case 'writing': return <p>{block.text} <span className="rc-hint">({block.lines} renglones)</span></p>;
  }
}

export function BookProposalDialog({title, changes, warnings, applying, onApply, onDiscard}: {
  title: string; changes: BookChange[] | null; warnings: string[]; applying: boolean; onApply: () => void; onDiscard: () => void;
}) {
  if (!changes) return null;
  return (
    <Dialog open onClose={() => { if (!applying) onDiscard(); }} title={title} description="Esto es lo que cambia en el libro. Nada se aplica hasta que confirmes." wide>
      <div className="rc-dialog-body rc-doc-preview">
        {changes.map((c, i) => (
          <section key={i} className="rc-proposal">
            {c.kind === 'update' || c.kind === 'image' ? (
              <>
                <h3>{c.kind === 'image' ? 'Prompt de la imagen' : c.label}</h3>
                <p className="rc-pdf-before-after"><span className="rc-pdf-before"><span>Antes</span>{c.before}</span><span className="rc-pdf-after"><span>Después</span>{c.after}</span></p>
                {c.kind === 'image' ? <p className="rc-hint">Al aplicar se guarda el prompt; la imagen se genera después desde el bloque, con un modelo de imagen («Generar con Cinema»), y consume créditos de Kie.</p> : null}
              </>
            ) : (
              <>
                <h3>{c.kind === 'chapter' ? 'Página nueva: «' + c.title + '» · ' + c.where : 'Bloques nuevos · ' + c.where}</h3>
                <ol className="rc-proposal-blocks">
                  {c.blocks.map(b => <li key={b.id}><span className="rc-pdf-kind">{blockNames[b.type]}</span><BlockView block={b} /></li>)}
                </ol>
              </>
            )}
          </section>
        ))}
        {warnings.length ? <ul className="rc-doc-preview-warn" aria-label="Para revisar">{warnings.map(w => <li key={w}><AlertTriangle aria-hidden="true" />{w}</li>)}</ul> : null}
        <p className="rc-hint">Antes de aplicar se guarda una versión del libro. Después podés deshacer (⌘Z) o volver a esa versión.</p>
        <div className="rc-dialog-footer rc-dialog-footer--end">
          <button type="button" className="rc-btn rc-btn--ghost" disabled={applying} onClick={onDiscard}>Descartar</button>
          <button type="button" className="rc-btn rc-btn--primary" disabled={applying} onClick={onApply}>{applying ? 'Aplicando…' : 'Aplicar'}</button>
        </div>
      </div>
    </Dialog>
  );
}
