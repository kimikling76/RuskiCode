import {editableBookSchema, type EditableBook} from '@/lib/books/editable';
import type {Block} from '@/lib/pipeline/types';
import type {BookAction} from './edit-plan';

// Applies a checked assistant plan to a copy of the book, so the author sees exactly what changes
// before confirming. The real book only changes when the editor commits the result.

export type BookChange =
  | {kind: 'insert'; where: string; blocks: Block[]}
  | {kind: 'chapter'; where: string; title: string; blocks: Block[]}
  | {kind: 'update'; blockId: string; label: string; before: string; after: string}
  | {kind: 'image'; blockId: string; before: string; after: string};

const textOf = (b: Block) => b.type === 'exercise' ? b.instruction + '\n' + b.items.map((x, i) => i + 1 + '. ' + x).join('\n')
  : b.type === 'table' ? [b.headers.join(' | '), ...b.rows.map(r => r.join(' | '))].join('\n')
    : b.type === 'image' ? b.prompt : b.text;

export class BookPlanError extends Error {}

export function applyBookActions(book: EditableBook, actions: BookAction[]): {book: EditableBook; changes: BookChange[]} {
  const next: EditableBook = structuredClone(book);
  const changes: BookChange[] = [];
  const find = (id: string) => {
    for (const chapter of next.chapters) {
      const i = chapter.blocks.findIndex(b => b.id === id);
      if (i >= 0) return {chapter, i};
    }
    throw new BookPlanError('Un bloque de la propuesta ya no existe: el libro cambió. Pedila de nuevo.');
  };
  for (const a of actions) {
    switch (a.tool) {
      case 'insert_blocks': {
        const chapter = next.chapters[a.chapter];
        if (!chapter) throw new BookPlanError('El capítulo de la propuesta ya no existe.');
        const at = a.after ? chapter.blocks.findIndex(b => b.id === a.after) + 1 : chapter.blocks.length;
        if (a.after && at === 0) throw new BookPlanError('El bloque de la propuesta ya no existe: el libro cambió. Pedila de nuevo.');
        chapter.blocks.splice(at, 0, ...a.blocks);
        changes.push({kind: 'insert', where: `Capítulo ${a.chapter + 1} · ${a.after ? 'después del bloque elegido' : 'al final'}`, blocks: a.blocks});
        break;
      }
      case 'add_chapter': {
        const at = Math.min(a.at, next.chapters.length);
        next.chapters.splice(at, 0, {title: a.title, summary: '—', blocks: a.blocks});
        changes.push({kind: 'chapter', where: at === 0 ? 'Al principio del libro' : 'Después del capítulo ' + at, title: a.title, blocks: a.blocks});
        break;
      }
      case 'update_text': {
        const {chapter, i} = find(a.blockId);
        const block = chapter.blocks[i];
        if (block.type !== 'heading' && block.type !== 'paragraph' && block.type !== 'callout' && block.type !== 'writing') throw new BookPlanError('La propuesta cambia un bloque que no es de texto.');
        changes.push({kind: 'update', blockId: block.id, label: 'Texto', before: block.text, after: a.text});
        chapter.blocks[i] = {...block, text: block.type === 'writing' ? a.text.slice(0, 200) : a.text};
        break;
      }
      case 'update_exercise': {
        const {chapter, i} = find(a.blockId);
        const block = chapter.blocks[i];
        if (block.type !== 'exercise') throw new BookPlanError('La propuesta trata como ejercicio a un bloque que no lo es.');
        const updated = {...block, instruction: a.instruction, items: a.items};
        changes.push({kind: 'update', blockId: block.id, label: 'Ejercicio', before: textOf(block), after: textOf(updated)});
        chapter.blocks[i] = updated;
        break;
      }
      case 'update_table': {
        const {chapter, i} = find(a.blockId);
        const block = chapter.blocks[i];
        if (block.type !== 'table') throw new BookPlanError('La propuesta trata como tabla a un bloque que no lo es.');
        const updated = {...block, headers: a.headers, rows: a.rows};
        changes.push({kind: 'update', blockId: block.id, label: 'Tabla', before: textOf(block), after: textOf(updated)});
        chapter.blocks[i] = updated;
        break;
      }
      case 'replace_image': {
        const {chapter, i} = find(a.blockId);
        const block = chapter.blocks[i];
        if (block.type !== 'image') throw new BookPlanError('La propuesta trata como imagen a un bloque que no lo es.');
        changes.push({kind: 'image', blockId: block.id, before: block.prompt, after: a.prompt});
        chapter.blocks[i] = {...block, prompt: a.prompt, alt: a.alt};
        break;
      }
    }
  }
  if (next.chapters.length > 12) throw new BookPlanError('El libro admite hasta 12 capítulos: la propuesta no entra.');
  if (next.chapters.some(c => c.blocks.length > 100)) throw new BookPlanError('Un capítulo admite hasta 100 bloques: la propuesta no entra.');
  const valid = editableBookSchema.safeParse(next);
  if (!valid.success) throw new BookPlanError('La propuesta no cumple el formato del libro (por ejemplo, textos vacíos o tablas desparejas).');
  return {book: valid.data, changes};
}

/** The block list the assistant reads: id, type and its text. */
export function blockViews(blocks: Block[]) {
  return blocks.map(b => ({id: b.id, type: b.type, text: textOf(b).slice(0, 9000)}));
}
