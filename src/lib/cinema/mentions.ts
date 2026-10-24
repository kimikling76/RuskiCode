import type {MediaOptions} from '@/lib/ai/models';

// Shared by the server (what Kie receives) and the composers (what «Ver lo que se envía» shows), so both say the same.

const wordChar = /[\p{L}\p{N}_]/u;

/**
 * The prompt for a model whose page documents how it names the images in it (Kling 4.0: `@image_1`, `@first_frame`).
 * Where the page says every «@» must name something sent, any other «@» is dropped (the word stays), since Kie would
 * reject the request; and each image sent but not named is named in a last sentence, so the model knows to use it.
 */
export function mentionPrompt(prompt: string, options: Pick<MediaOptions, 'mention' | 'strictMentions'>, sent: number) {
  if (!options.mention && !options.strictMentions) return prompt;
  const template = options.mention || '';
  const names = !template || !sent ? [] : template.includes('{n}') ? Array.from({length: sent}, (_, i) => template.replace('{n}', String(i + 1))) : [template];
  // A name is matched whole: «@image_1» is not the start of «@image_10».
  const namedAt = (text: string, i: number) => names.find(n => text.startsWith(n, i) && !wordChar.test(text[i + n.length] || ''));
  let text = prompt;
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
