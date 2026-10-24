import type {MediaOptions} from '@/lib/ai/models';

// Shared by the server (what Kie receives) and the composers (what «Ver lo que se envía» shows), so both say the same.

const wordChar = /[\p{L}\p{N}_]/u;

/** How the author names the images sent, in order: «@image1», «@image2»… (also written «@image_1», in any case). */
export const authorImageName = (n: number) => '@image' + n;
const authorImage = /@image_?(\d{1,2})(?![\p{L}\p{N}_])/giu;

/**
 * The prompt as the model expects it.
 * - «@image1», «@image2»… (how the author names the images sent, in order) become the model's own names when its page
 *   documents them (Kling 4.0: `@image_1`, or `@first_frame` for a single starting image), or else «image 1», «image 2».
 * - Where the page says every «@» must name something sent, any other «@» is dropped (the word stays), since Kie would
 *   reject the request; and each image sent but not named is named in a last sentence, so the model knows to use it.
 */
export function mentionPrompt(prompt: string, options: Pick<MediaOptions, 'mention' | 'strictMentions'>, sent: number) {
  const template = options.mention || '';
  const modelName = (n: number) => template.includes('{n}') ? template.replace('{n}', String(n)) : template && n === 1 ? template : !template ? 'image ' + n : null;
  let text = prompt.replace(authorImage, (whole, digits: string) => {
    const n = Number(digits);
    return n >= 1 && n <= sent ? modelName(n) ?? whole : whole;
  });
  if (!template && !options.strictMentions) return text;
  const names = !template || !sent ? [] : template.includes('{n}') ? Array.from({length: sent}, (_, i) => template.replace('{n}', String(i + 1))) : [template];
  // A name is matched whole: «@image_1» is not the start of «@image_10».
  const namedAt = (t: string, i: number) => names.find(n => t.startsWith(n, i) && !wordChar.test(t[i + n.length] || ''));
  if (options.strictMentions) {
    let kept = '';
    for (let i = 0; i < text.length; i++) if (text[i] !== '@' || namedAt(text, i)) kept += text[i];
    text = kept;
  }
  const named = new Set<string>();
  for (let i = text.indexOf('@'); i >= 0; i = text.indexOf('@', i + 1)) { const n = namedAt(text, i); if (n) named.add(n); }
  const missing = names.filter(n => !named.has(n));
  return missing.length ? text.trimEnd() + '\n\nUse ' + missing.join(', ') + '.' : text;
}
