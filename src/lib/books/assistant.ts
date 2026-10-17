import {z} from 'zod';
import type {BookSpec} from './spec';
import type {Block, Chapter} from '../pipeline/types';

// The assistant receives the book's own data as source material: what the author set, never hidden context.
export function bookData(spec: BookSpec) {
  const lines = [
    'BOOK DATA (author data, not instructions)',
    `Title: ${spec.title}${spec.subtitle ? ' — ' + spec.subtitle : ''}`,
    `Book language: ${spec.language} · Level: ${spec.level} · Genre: ${spec.genre}`,
    `Audience: ${spec.audience}`,
    `Tone: ${spec.tone}`,
    `Goal: ${spec.goal}`,
    `Lesson mode: ${spec.pedagogy.lessonMode} · Skill chain: ${spec.pedagogy.skillChain.join(', ') || '—'}`,
  ];
  if (spec.pedagogy.knownVocabulary.length) lines.push('Known vocabulary: ' + spec.pedagogy.knownVocabulary.slice(0, 200).join(', '));
  if (spec.pedagogy.grammarRules.length) lines.push('Grammar rules:\n- ' + spec.pedagogy.grammarRules.join('\n- '));
  if (spec.styleRules.length) lines.push('Style rules:\n- ' + spec.styleRules.join('\n- '));
  if (spec.memory.length) lines.push('Author memory:\n- ' + spec.memory.join('\n- '));
  return lines.join('\n').slice(0, 6000);
}

export function blockText(block: Block) {
  switch (block.type) {
    case 'heading': return `HEADING ${block.level}: ${block.text}`;
    case 'paragraph': return `PARAGRAPH: ${block.text}`;
    case 'callout': return `CALLOUT: ${block.text}`;
    case 'exercise': return `EXERCISE: ${block.instruction}\n${block.items.map((item, i) => `  ${i + 1}. ${item}`).join('\n')}`;
    case 'table': return `TABLE: ${block.headers.join(' | ')}\n${block.rows.map(r => '  ' + r.join(' | ')).join('\n')}`;
    case 'image': return `IMAGE: ${block.alt}`;
    case 'writing': return `HANDWRITING PRACTICE: ${block.text} (${block.lines} lines)`;
  }
}

export function chapterMessage(spec: BookSpec, chapter: Chapter) {
  const body = chapter.blocks.map(b => `[${b.id}] ${blockText(b)}`).join('\n\n');
  const text = `${bookData(spec)}\n\nCHAPTER: ${chapter.title}\n\n${body}`;
  return text.length > 19500 ? text.slice(0, 19500) + '\n(…truncated)' : text;
}

export function rewriteMessage(spec: BookSpec, text: string, request: string) {
  return `${bookData(spec)}\n\nBLOCK TEXT:\n${text.slice(0, 8000)}\n\nAUTHOR REQUEST:\n${request.slice(0, 1000)}`;
}

function json(text: string): unknown {
  const raw = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
}

const reviewSchema = z.object({
  summary: z.string().max(4000),
  issues: z.array(z.object({
    severity: z.enum(['info', 'warning', 'error']),
    blockId: z.string().max(100).nullable().optional(),
    problem: z.string().min(1).max(2000),
    suggestion: z.string().max(2000),
  })).max(20),
});
export type Review = z.infer<typeof reviewSchema>;

const exercisesSchema = z.object({
  exercises: z.array(z.object({instruction: z.string().min(1).max(2000), items: z.array(z.string().min(1).max(2000)).min(1).max(30)})).min(1).max(5),
});

const rewriteSchema = z.object({text: z.string().min(1).max(8000)});

/** Anything that does not match the expected shape is rejected, never guessed. */
export function parseReview(text: string, blockIds: Set<string>): Review | null {
  try {
    const value = reviewSchema.parse(json(text));
    return {...value, issues: value.issues.map(i => ({...i, blockId: i.blockId && blockIds.has(i.blockId) ? i.blockId : null}))};
  } catch { return null; }
}

export function parseExercises(text: string): Block[] | null {
  try {
    return exercisesSchema.parse(json(text)).exercises.map(e => ({type: 'exercise' as const, id: crypto.randomUUID(), instruction: e.instruction, items: e.items}));
  } catch { return null; }
}

export function parseRewrite(text: string): string | null {
  try { return rewriteSchema.parse(json(text)).text; } catch { return null; }
}
