import type {MediaOptions} from '@/lib/ai/models';

// Shared by the server (what Kie receives) and the composers (what «Ver lo que se envía» shows), so both say the same.

const wordChar = /[\p{L}\p{N}_]/u;

/** How the author names the images sent, in order: «@image1», «@image2»… (also written «@image_1», in any case). */
export const authorImageName = (n: number) => '@image' + n;
const authorImage = /@image_?(\d{1,2})(?![\p{L}\p{N}_])/giu;

/** How the author names the videos sent, in order: «@video1», «@video2»… */
export const authorVideoName = (n: number) => '@video' + n;
const authorVideo = /@video_?(\d{1,2})(?![\p{L}\p{N}_])/giu;

/** The names a model's page gives to the files sent: `@image_{n}` numbered from 1, or one fixed name. */
function namesFor(template: string, sent: number) {
  return !template || !sent ? [] : template.includes('{n}') ? Array.from({length: sent}, (_, i) => template.replace('{n}', String(i + 1))) : [template];
}

/**
 * The prompt as the model expects it.
 * - «@image1», «@image2»… (how the author names the images sent, in order) become the model's own names when its page
 *   documents them (Kling 4.0: `@image_1`, or `@first_frame` for a single starting image), or else «image 1», «image 2».
 *   «@video1», «@video2»… are the videos sent, the same way (`@video_1` in Kling 4.0, or else «video 1»).
 * - Where the page says every «@» must name something sent, any other «@» is dropped (the word stays), since Kie would
 *   reject the request; and each file sent but not named is named in a last sentence, so the model knows to use it.
 */
export function mentionPrompt(prompt: string, options: Pick<MediaOptions, 'mention' | 'strictMentions' | 'videoMention'>, sent: number, videos = 0) {
  const template = options.mention || '';
  const videoTemplate = options.videoMention || '';
  const own = (tpl: string, word: string) => (n: number) => tpl.includes('{n}') ? tpl.replace('{n}', String(n)) : tpl && n === 1 ? tpl : !tpl ? word + ' ' + n : null;
  const imageName = own(template, 'image'), videoName = own(videoTemplate, 'video');
  let text = prompt.replace(authorImage, (whole, digits: string) => {
    const n = Number(digits);
    return n >= 1 && n <= sent ? imageName(n) ?? whole : whole;
  }).replace(authorVideo, (whole, digits: string) => {
    const n = Number(digits);
    return n >= 1 && n <= videos ? videoName(n) ?? whole : whole;
  });
  if (!template && !videoTemplate && !options.strictMentions) return text;
  const names = [...namesFor(template, sent), ...namesFor(videoTemplate, videos)];
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
