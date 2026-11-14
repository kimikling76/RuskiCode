import {catalog, enabledStatus, type CatalogModel, type Category} from '@/lib/ai/models';

// Data for the design prototype (/workspace/diseno). The model list is the studio's real catalog, so the picker is
// tried with its real size; everything else here is an example. Nothing in the prototype talks to Kie.

export type ProtoModel = {id: string; name: string; provider: string; category: Category; fact: string; fresh: boolean; ready: boolean; featured: boolean; options?: {aspects: string[]; resolutions: string[]; durations: string[]; resolutionLabel: string; refs: number; videos: number; audios: number; frames: number}};

const list = (xs: readonly string[] | undefined) => (xs ? [...xs] : []);

/** One line of facts the catalog really has: what the model takes and how far it goes. Never what it is «good for». */
function fact(m: CatalogModel) {
  if (m.category === 'text') {
    const sees = m.inputs?.includes('image') ? (m.inputs.includes('pdf') ? 've imágenes y PDF' : 've imágenes') : 'solo texto';
    return [m.provider, sees, m.webSearch ? 'busca en la web' : ''].filter(Boolean).join(' · ');
  }
  if (m.category === 'audio') return m.provider + ' · audio';
  const o = m.options;
  const refs = o.maxReferences ? 'hasta ' + o.maxReferences + (o.maxReferences === 1 ? ' referencia' : ' referencias') : 'solo desde texto';
  const top = o.durations.length ? 'hasta ' + Math.max(...o.durations.map(d => parseInt(d, 10) || 0)) + ' s' : o.resolutions.length ? o.resolutions[o.resolutions.length - 1] : '';
  return [m.provider, refs, top].filter(Boolean).join(' · ');
}

export const models: ProtoModel[] = catalog.map(m => ({
  id: m.id, name: m.name.replace(/\s*·\s*kie(\.ai)?\s*$/i, ''), provider: m.provider, category: m.category, fact: fact(m),
  // «Nuevo»: read from the catalog this month.
  fresh: /^2026-11/.test(m.checked), ready: enabledStatus(m), featured: m.status === 'tested',
  ...(m.category === 'image' || m.category === 'video' ? {options: {
    aspects: list(m.options.aspectRatios), resolutions: list(m.options.resolutions), durations: list(m.options.durations),
    resolutionLabel: m.options.resolutionLabel || 'Resolución', refs: m.options.maxReferences || 0,
    videos: (m.options as {maxVideos?: number}).maxVideos || 0, audios: (m.options as {maxAudios?: number}).maxAudios || 0,
    frames: (m.options as {frames?: unknown[]}).frames?.length || 0,
  }} : {}),
}));

export const categoryNames: Record<Category, string> = {text: 'Texto', image: 'Imagen', video: 'Video', audio: 'Audio'};
const preferred: Partial<Record<Category, RegExp>> = {video: /^veo-3-1$/};
export const firstOf = (category: Category) => models.find(m => m.category === category && m.ready && preferred[category]?.test(m.id)) || models.find(m => m.category === category && m.featured && m.ready) || models.find(m => m.category === category && m.ready) || models.find(m => m.category === category)!;

/** Example prices, only so the button can be felt with a number and without one. The real site uses its estimator. */
const examplePrice: Record<Category, number> = {text: 1.5, image: 6, video: 80, audio: 4};
export const priceOf = (m: ProtoModel, count = 1) => (m.featured ? Math.round(examplePrice[m.category] * count * 10) / 10 : null);

/** The four section pigments (icon painting): vermilion, ochre, lazurite, green. */
export const sections = [
  {id: 'chat', letter: 'Ч', ru: 'Чат', es: 'Chat y asistentes', tone: 'lazur'},
  {id: 'kino', letter: 'К', ru: 'Кино', es: 'Estudio de cine: imagen y video', tone: 'kinovar'},
  {id: 'pages', letter: 'С', ru: 'Страницы', es: 'PDF Studio y el Manual', tone: 'ohra'},
  {id: 'cast', letter: 'Г', ru: 'Герои', es: 'Contexto del libro', tone: 'zelen'},
] as const;
export type SectionId = (typeof sections)[number]['id'];

export const projects = ['Unidad de ejemplo 1', 'Alfabeto de ejemplo', 'Unidad de ejemplo 2'];
export const chats = ['Ejercicios para la unidad', 'Revisión del ruso', 'Ideas para una escena'];
export const elements = ['Personaje de ejemplo A', 'Personaje de ejemplo B', 'Lugar de ejemplo'];

/** `src`/`fallback`: one of the person's own pictures, read from their gallery (Kie's link, then the studio's copy). */
export type Tile = {id: string; letter: string; tone: number; state: 'done' | 'working' | 'failed'; prompt: string; cost?: number | null; src?: string; fallback?: string};
export const letters = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ';
export const seedTiles: Tile[] = [
  {id: 't1', letter: 'А', tone: 0, state: 'done', prompt: 'Una calle con nieve, de noche', cost: 6},
  {id: 't2', letter: 'Б', tone: 1, state: 'failed', prompt: 'Una plaza al amanecer', cost: 0},
  {id: 't3', letter: 'В', tone: 2, state: 'done', prompt: 'Una cocina con luz de tarde', cost: 6},
  {id: 't4', letter: 'Г', tone: 3, state: 'done', prompt: 'Un aula vacía', cost: 6},
  {id: 't5', letter: 'Д', tone: 1, state: 'failed', prompt: 'Un tren en la estación', cost: null},
  {id: 't6', letter: 'Е', tone: 0, state: 'done', prompt: 'Un mercado con frutas', cost: 6},
];
