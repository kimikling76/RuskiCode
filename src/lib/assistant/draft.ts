import {textToNodes} from '@/lib/books/import/text';
import {chaptersFrom, detectLanguage, nodesToBlocks, type ImportNode} from '@/lib/books/import/model';
import {newBook} from '@/lib/books/templates';
import {editableBookSchema, type EditableBook} from '@/lib/books/editable';
import type {Block} from '@/lib/pipeline/types';

// «Crear con IA» answers are Markdown. This turns one into the editor's blocks, the same way an imported
// Markdown file is read, with one addition: an instruction line followed by a numbered list is an exercise.
// Nothing is rewritten: the words stay as the model wrote them.

const instructionLike = (text: string) => text.length <= 400 && !text.includes('\n') && /[:：.!?]$|^\d+\.\s|упражнение|ejercicio/iu.test(text.trim());

export function draftToBlocks(markdown: string): {blocks: Block[]; notes: string[]} {
  const {nodes, notes} = textToNodes(markdown, true);
  const blocks: Block[] = [];
  const pending: ImportNode[] = [];
  const flush = () => { if (pending.length) blocks.push(...nodesToBlocks(pending.splice(0)).blocks); };
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i], next = nodes[i + 1];
    const lead = node.kind === 'paragraph' || (node.kind === 'heading' && node.level === 3) ? node.text.trim() : '';
    if (lead && next?.kind === 'list' && next.ordered && next.items.length && instructionLike(lead)) {
      flush();
      const items = next.items.map(t => t.trim()).filter(Boolean).slice(0, 30).map(t => t.slice(0, 8000));
      blocks.push({type: 'exercise', id: crypto.randomUUID(), instruction: lead.replace(/^#+\s*/, '').slice(0, 8000), items});
      i++;
      continue;
    }
    pending.push(node);
  }
  flush();
  return {blocks, notes};
}

/** Blocks a PDF page can carry (no images). */
export const pageBlocks = (blocks: Block[]) => blocks.filter((b): b is Exclude<Block, {type: 'image'}> => b.type !== 'image');

/** A new editable book made of the drafted blocks (chapters start at its top headings). */
export function bookFromBlocks(blocks: Block[], fallbackTitle: string): EditableBook {
  const heading = blocks.find((b): b is Extract<Block, {type: 'heading'}> => b.type === 'heading');
  const title = (heading?.text || fallbackTitle).replace(/\s+/g, ' ').trim().slice(0, 200) || 'Libro nuevo';
  const text = blocks.map(b => b.type === 'exercise' ? b.instruction + ' ' + b.items.join(' ') : b.type === 'table' ? b.headers.join(' ') + ' ' + b.rows.flat().join(' ') : b.type === 'image' ? b.alt : b.text).join(' ');
  const base = newBook({title, language: detectLanguage(text), level: 'A1', pageFormat: 'A4', goal: 'Creado con «Crear con IA». Revisar y completar.'});
  const {sections} = chaptersFrom(blocks, title);
  return editableBookSchema.parse({...base, chapters: sections.map(s => ({title: s.title.slice(0, 8000) || title, summary: '—', blocks: s.blocks}))});
}
