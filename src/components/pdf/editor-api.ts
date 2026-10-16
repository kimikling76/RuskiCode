import type {BookSpec} from '@/lib/books/spec';
import type {EditableBook} from '@/lib/books/editable';
import type {Block, Chapter} from '@/lib/pipeline/types';
import type {TemplateId} from '@/lib/books/templates';

export type Selection = {chapter: number; blockId: string | null};

/** Every edit the inspector can make. `key` groups fast typing into one undo step. */
export type EditorApi = {
  book: EditableBook;
  selection: Selection;
  select: (chapter: number, blockId: string | null) => void;
  updateBlock: (id: string, patch: Partial<Block>, key?: string) => void;
  moveBlock: (id: string, by: number) => void;
  reorderBlocks: (chapter: number, from: number, to: number) => void;
  duplicateBlock: (id: string) => void;
  deleteBlock: (id: string) => void;
  insertBlocks: (blocks: Block[]) => void;
  insertTemplate: (template: TemplateId) => void;
  updateChapter: (index: number, patch: Partial<Chapter>, key?: string) => void;
  addChapter: (kind: 'unit' | 'empty') => void;
  moveChapter: (index: number, by: number) => void;
  duplicateChapter: (index: number) => void;
  deleteChapter: (index: number) => void;
  updateSpec: (patch: Partial<BookSpec>, key?: string) => void;
  setImage: (blockId: string, data: string | null) => void;
  server: null | {canSubmit: boolean; busy: boolean; submit: (action: 'render' | 'chapter' | 'image', target?: string) => void};
};

export const blockNames: Record<Block['type'], string> = {
  heading: 'Título',
  paragraph: 'Párrafo',
  callout: 'Recuadro',
  exercise: 'Ejercicio',
  table: 'Tabla',
  image: 'Imagen',
  writing: 'Caligrafía',
};

export function blockSummary(block: Block) {
  const text = block.type === 'exercise' ? block.instruction : block.type === 'table' ? block.headers.join(' · ') : block.type === 'image' ? block.alt : block.text;
  return text.replace(/\s+/g, ' ').slice(0, 90);
}
