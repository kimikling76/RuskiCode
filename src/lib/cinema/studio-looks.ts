// Cinema Studio → Estudio: the four looks of the composer (film, camera, palette, light) and the characters and places
// called with «@». None is a model parameter: each choice becomes a plain sentence added to the prompt, and the author
// sees it before sending.

export type LookKey = 'film' | 'camera' | 'palette' | 'light';
export type LookOption = {id: string; label: string; /** English, for the model; empty for «Auto». */ prompt: string};
export type Looks = Record<LookKey, string>;

export const lookNames: Record<LookKey, string> = {film: 'Película', camera: 'Cámara', palette: 'Paleta de color', light: 'Luz'};

const auto: LookOption = {id: 'auto', label: 'Auto', prompt: ''};

export const lookOptions: Record<LookKey, LookOption[]> = {
  film: [
    auto,
    {id: '35mm', label: 'Película 35 mm', prompt: 'Shot on 35mm film, natural grain.'},
    {id: '16mm', label: '16 mm con grano', prompt: 'Shot on 16mm film, visible grain, soft contrast.'},
    {id: 'digital', label: 'Digital limpio', prompt: 'Clean digital cinema look, sharp detail.'},
    {id: 'anamorphic', label: 'Anamórfico', prompt: 'Anamorphic lens look, wide aspect, oval bokeh, subtle lens flares.'},
    {id: 'bw', label: 'Blanco y negro', prompt: 'Black and white film, rich contrast.'},
  ],
  camera: [
    auto,
    {id: 'close', label: 'Primer plano', prompt: 'Close-up shot.'},
    {id: 'wide', label: 'Plano general', prompt: 'Wide establishing shot.'},
    {id: 'drone', label: 'Dron', prompt: 'Aerial drone shot.'},
    {id: 'dolly', label: 'Travelling', prompt: 'Slow dolly shot moving forward.'},
    {id: 'handheld', label: 'Cámara en mano', prompt: 'Handheld camera, slight natural shake.'},
    {id: 'low', label: 'Contrapicado', prompt: 'Low-angle shot looking up.'},
  ],
  palette: [
    auto,
    {id: 'warm', label: 'Cálida', prompt: 'Warm color palette.'},
    {id: 'cool', label: 'Fría', prompt: 'Cool color palette.'},
    {id: 'teal', label: 'Turquesa y naranja', prompt: 'Teal and orange color grading.'},
    {id: 'pastel', label: 'Pastel', prompt: 'Soft pastel color palette.'},
    {id: 'mono', label: 'Monocromo', prompt: 'Monochrome palette with one accent color.'},
    {id: 'vivid', label: 'Saturada', prompt: 'Vivid, saturated colors.'},
  ],
  light: [
    auto,
    {id: 'golden', label: 'Hora dorada', prompt: 'Golden hour sunlight.'},
    {id: 'neon', label: 'Neón', prompt: 'Neon lighting, colored reflections.'},
    {id: 'lowkey', label: 'Clave baja', prompt: 'Low-key lighting, deep shadows.'},
    {id: 'soft', label: 'Luz suave de día', prompt: 'Soft diffused daylight.'},
    {id: 'backlight', label: 'Contraluz', prompt: 'Strong backlight, silhouettes and rim light.'},
    {id: 'night', label: 'Noche azul', prompt: 'Blue night light, moonlit.'},
  ],
};

export const autoLooks = (): Looks => ({film: 'auto', camera: 'auto', palette: 'auto', light: 'auto'});
export const lookOption = (key: LookKey, id: string) => lookOptions[key].find(o => o.id === id) || auto;

/** Someone or somewhere called with «@»: its name, what the model is told about it, and its picture if it has one. */
export type Mention = {name: string; description: string; /** A reference the server accepts (Kie link or `asset:<sha256>`). */ reference?: string};

/** The `mentions` the text calls with «@», in the order of the scene. */
export function mentioned(text: string, mentions: Mention[]) {
  // The longest names are looked for first, so «@Борис Петрович» is not read as «@Борис».
  let rest = text;
  const found: {m: Mention; at: number}[] = [];
  for (const m of [...mentions].sort((a, b) => b.name.length - a.name.length)) {
    const tag = '@' + m.name;
    const at = m.name ? rest.indexOf(tag) : -1;
    if (at < 0) continue;
    found.push({m, at});
    rest = rest.split(tag).join(' '.repeat(tag.length));
  }
  return found.sort((a, b) => a.at - b.at).map(f => f.m);
}

/** The «@…» being written right before the caret, or null. */
export function mentionQuery(before: string) {
  const m = before.match(/(?:^|\s)@([^\s@]{0,40})$/);
  return m ? m[1] : null;
}

/**
 * What is sent to the model: the scene as written (with «@» taken off the names), then who and where with their
 * descriptions, then the chosen looks. Nothing is added when everything is «Auto» and nobody is called.
 */
/** `tag`: how the model names someone's picture in the prompt (Kling 4.0: `@image_2`), when it is sent. */
export function composePrompt(text: string, looks: Looks, called: Mention[], tag?: (m: Mention) => string | null) {
  let scene = text.trim();
  for (const m of [...called].sort((a, b) => b.name.length - a.name.length)) scene = scene.split('@' + m.name).join(m.name);
  const lines: string[] = [];
  const described = called.filter(m => m.description.trim() || tag?.(m));
  if (described.length) lines.push(described.map(m => {
    const t = tag?.(m);
    const about = m.description.trim().replace(/\s+/g, ' ');
    return m.name + (t ? ' (' + t + ')' : '') + (about ? ': ' + about : '.');
  }).join(' '));
  const style = (Object.keys(lookNames) as LookKey[]).map(k => lookOption(k, looks[k]).prompt).filter(Boolean).join(' ');
  if (style) lines.push(style);
  return lines.length ? scene + '\n\n' + lines.join('\n') : scene;
}

/** References to send: the ones the author chose, then the pictures of whoever is called, without repeats, up to `max`. */
export function referencesFor(chosen: string[], called: Mention[], max: number) {
  const all = [...chosen, ...called.flatMap(m => m.reference ? [m.reference] : [])];
  return [...new Set(all)].slice(0, Math.max(0, max));
}
