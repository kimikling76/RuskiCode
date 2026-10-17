'use client';
import {useState} from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import {DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent} from '@dnd-kit/core';
import {SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {GripVertical, MoreHorizontal} from 'lucide-react';
import type {Block} from '@/lib/pipeline/types';
import {Menu, MenuTrigger, MenuContent, MenuItem, MenuSeparator} from '@/components/ui/menu';
import {ConfirmDialog} from '@/components/ui/dialog';
import {blockNames, blockSummary, type EditorApi} from './editor-api';
import {InsertMenu} from './insert-menu';

export function ChapterPanel({api}: {api: EditorApi}) {
  const index = api.selection.chapter;
  const chapter = api.book.chapters[index];
  const [remove, setRemove] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, {activationConstraint: {distance: 4}}), useSensor(KeyboardSensor, {coordinateGetter: sortableKeyboardCoordinates}));
  if (!chapter) return <p className="rc-hint rc-pdf-empty">Elegí una página de un capítulo para ver su estructura.</p>;
  const total = api.book.chapters.length;

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = chapter.blocks.findIndex(b => b.id === e.active.id);
    const to = chapter.blocks.findIndex(b => b.id === e.over!.id);
    api.reorderBlocks(index, from, to);
  }

  return (
    <div className="rc-pdf-form">
      <div className="rc-pdf-form-head">
        <span className="rc-pdf-kind">Capítulo {index + 1} de {total}</span>
        <Menu>
          <MenuTrigger asChild><button type="button" className="rc-icon-btn rc-icon-btn--sm" aria-label="Opciones del capítulo"><MoreHorizontal /></button></MenuTrigger>
          <MenuContent>
            <MenuItem disabled={index === 0} onSelect={() => api.moveChapter(index, -1)}>Mover antes</MenuItem>
            <MenuItem disabled={index === total - 1} onSelect={() => api.moveChapter(index, 1)}>Mover después</MenuItem>
            <MenuItem disabled={total >= 12} onSelect={() => api.duplicateChapter(index)}>Duplicar</MenuItem>
            {api.server?.canSubmit ? <MenuItem disabled={api.server.busy} onSelect={() => api.server?.submit('chapter', String(index))}>Reescribir con el compositor</MenuItem> : null}
            <MenuSeparator />
            <MenuItem danger disabled={total <= 1} onSelect={() => setRemove(true)}>Borrar capítulo</MenuItem>
          </MenuContent>
        </Menu>
      </div>
      <label className="rc-field">
        <span>Título del capítulo</span>
        <input className="rc-input" maxLength={8000} value={chapter.title} onChange={e => api.updateChapter(index, {title: e.target.value}, 'title' + index)} />
      </label>
      <label className="rc-field">
        <span>Resumen interno</span>
        <TextareaAutosize className="rc-textarea rc-pdf-text" minRows={2} maxRows={8} maxLength={8000} value={chapter.summary} onChange={e => api.updateChapter(index, {summary: e.target.value}, 'summary' + index)} />
        <small className="rc-hint">No se imprime. Sirve de contexto al asistente.</small>
      </label>

      <div className="rc-field">
        <span>Bloques · arrastrá para ordenar</span>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          accessibility={{
            screenReaderInstructions: {draggable: 'Para mover un bloque, apretá espacio, usá las flechas y apretá espacio otra vez para soltarlo. Escape cancela.'},
            announcements: {
              onDragStart: ({active}) => 'Moviendo ' + (chapter.blocks.findIndex(b => b.id === active.id) + 1),
              onDragOver: ({over}) => over ? 'Posición ' + (chapter.blocks.findIndex(b => b.id === over.id) + 1) : '',
              onDragEnd: ({over}) => over ? 'Soltado en la posición ' + (chapter.blocks.findIndex(b => b.id === over.id) + 1) : 'Soltado',
              onDragCancel: () => 'Cancelado',
            },
          }}
        >
          <SortableContext items={chapter.blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
            <ol className="rc-pdf-outline">
              {chapter.blocks.map((block, i) => (
                <OutlineRow key={block.id} block={block} n={i + 1} active={api.selection.blockId === block.id} onSelect={() => api.select(index, block.id)} />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      </div>
      <div className="rc-pdf-form-foot"><InsertMenu api={api} /></div>

      <ConfirmDialog
        open={remove}
        onClose={() => setRemove(false)}
        onConfirm={() => { api.deleteChapter(index); setRemove(false); }}
        title="¿Borrar este capítulo?"
        description="Se borran sus bloques. Podés deshacerlo con Deshacer mientras el editor siga abierto."
        confirmLabel="Borrar capítulo"
        tone="danger"
      />
    </div>
  );
}

function OutlineRow({block, n, active, onSelect}: {block: Block; n: number; active: boolean; onSelect: () => void}) {
  const {attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging} = useSortable({id: block.id});
  return (
    <li ref={setNodeRef} className="rc-pdf-outline-row" data-active={active ? 'true' : undefined} data-dragging={isDragging ? 'true' : undefined} style={{transform: CSS.Transform.toString(transform), transition}}>
      <button type="button" ref={setActivatorNodeRef} className="rc-icon-btn rc-icon-btn--sm rc-shot-handle" aria-label={'Mover el bloque ' + n} {...attributes} {...listeners}><GripVertical /></button>
      <button type="button" className="rc-pdf-outline-main" aria-current={active ? 'true' : undefined} onClick={onSelect}>
        <span className="rc-pdf-outline-kind">{blockNames[block.type]}</span>
        <span className="rc-pdf-outline-text">{blockSummary(block) || '—'}</span>
      </button>
    </li>
  );
}
