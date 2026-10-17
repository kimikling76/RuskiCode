import {aspectRatios as nanoRatios, resolutions as nanoResolutions, maxReferences as nanoRefs, maxVariants as nanoVariants, outputFormat as nanoFormat} from '@/lib/cinema/capabilities';

// The studio's catalog of Kie.ai models. One editable place: add a model here and it appears in the pickers.
//
// Kie does not document an endpoint that lists every model (only the Claude route has
// GET /anthropic/v1/models), so the catalog is written by hand from Kie's documentation.
//
// Status:
// - 'tested'     documentation checked and used for real from the studio. Enabled.
// - 'docs'       endpoint, request format and parameters confirmed in Kie's documentation, but no real
//                operation from the studio yet. Enabled, marked «Sin prueba real».
// - 'unverified' listed so it can be completed later; something essential is not confirmed (written in `missing`).
//                Disabled, marked «No verificado».
//
// Never fill an option, a price or a capability that the documentation does not state.
// No secrets here: this file is also used by the browser. Keys live only in the server's environment.

export type Category = 'text' | 'image' | 'video';
export type ModelStatus = 'tested' | 'docs' | 'unverified';

/** How the server talks to the model. */
export type Adapter =
  | 'openai-chat'          // POST …/v1/chat/completions, OpenAI format, SSE stream
  | 'anthropic-messages'   // POST /claude/v1/messages, Anthropic format with Bearer key, SSE stream
  | 'openai-responses'     // POST /codex/v1/responses, OpenAI Responses format
  | 'kie-jobs'             // POST /api/v1/jobs/createTask + GET /api/v1/jobs/recordInfo
  | 'kie-dedicated';       // A family API with its own endpoints (not implemented until verified)

type Base = {
  /** Internal id, stable: stored in chats, assistants and favorites. */
  id: string;
  name: string;
  provider: string;
  category: Category;
  /** The model string Kie expects. */
  providerModel: string;
  endpoint: string;
  adapter: Adapter;
  docs: string;
  status: ModelStatus;
  /** When the documentation was last checked, and how. */
  checked: string;
  /** What is still unconfirmed (required when status is 'unverified'). */
  missing?: string;
  /** A price only if Kie publishes it; shown as an estimate, never as the real cost. */
  /** e.g. {credits: 6, per: 'por imagen', source: '<link to Kie\'s published price>'}. */
  price?: {credits: number; per: string; source: string};
};

export type TextModel = Base & {category: 'text'};

/** Options a generation model really accepts. Empty or absent means the interface does not offer it. */
export type MediaOptions = {
  /** Input field names in Kie's request. */
  fields: {prompt: string; images?: string; aspect?: string; resolution?: string; duration?: string; format?: string};
  aspectRatios: readonly string[];
  resolutions: readonly string[];
  durations: readonly string[];
  outputFormat?: string;
  /** Reference images: 0 = none. */
  maxReferences: number;
  /** Variants per request. Kie creates one task per variant. */
  maxVariants: number;
  /** Whether it can edit an existing image (references required). */
  modes: readonly ('create' | 'edit')[];
};

export type ImageModel = Base & {category: 'image'; options: MediaOptions};
export type VideoModel = Base & {category: 'video'; options: MediaOptions};
export type CatalogModel = TextModel | ImageModel | VideoModel;

const KIE = 'https://api.kie.ai';
const CHECKED_SEARCH = '2026-10-17 · docs.kie.ai vía buscador web (el entorno no puede abrir docs.kie.ai)';
const noMedia: MediaOptions = {fields: {prompt: 'prompt'}, aspectRatios: [], resolutions: [], durations: [], maxReferences: 0, maxVariants: 1, modes: ['create']};

export const textModels: TextModel[] = [
  {
    id: 'kie-flash', name: 'Gemini 3.8 Flash', provider: 'Google', category: 'text', providerModel: 'gemini-3.8-flash',
    endpoint: KIE + '/gemini-3-8-flash-openai/v1/chat/completions', adapter: 'openai-chat',
    docs: 'https://docs.kie.ai/market/gemini/gemini-3-8-flash-openai', status: 'tested', checked: '2026-10-16 · en uso en el Chat desde la Etapa 1',
  },
  {
    id: 'kie-pro', name: 'Gemini 3.1 Pro', provider: 'Google', category: 'text', providerModel: 'gemini-3.1-pro',
    endpoint: KIE + '/gemini-3.1-pro/v1/chat/completions', adapter: 'openai-chat',
    // Its own docs page was not found by search; this is Kie's chat catalog page.
    docs: 'https://kie.ai/market/chat', status: 'tested', checked: '2026-10-16 · en uso en el Chat desde la Etapa 1',
  },
  {
    id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'Anthropic', category: 'text', providerModel: 'claude-sonnet-4-6',
    endpoint: KIE + '/claude/v1/messages', adapter: 'anthropic-messages',
    docs: 'https://docs.kie.ai/market/claude/claude-sonnet-4-6', status: 'docs', checked: CHECKED_SEARCH,
  },
  {
    id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', provider: 'Anthropic', category: 'text', providerModel: 'claude-sonnet-4-5',
    endpoint: KIE + '/claude/v1/messages', adapter: 'anthropic-messages',
    docs: 'https://docs.kie.ai/market/claude/claude-sonnet-4-5', status: 'docs', checked: CHECKED_SEARCH,
  },
  {
    id: 'claude-sonnet-5', name: 'Claude Sonnet 5', provider: 'Anthropic', category: 'text', providerModel: 'claude-sonnet-5',
    endpoint: KIE + '/claude/v1/messages', adapter: 'anthropic-messages',
    docs: 'https://docs.kie.ai/market/claude/cluade-sonnet-5', status: 'docs', checked: CHECKED_SEARCH,
  },
  {
    id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', provider: 'Anthropic', category: 'text', providerModel: 'claude-sonnet-5-5',
    endpoint: KIE + '/claude/v1/messages', adapter: 'anthropic-messages',
    docs: 'https://docs.kie.ai/market/claude/cluade-sonnet-5-5', status: 'docs', checked: CHECKED_SEARCH,
  },
  {
    id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', provider: 'Anthropic', category: 'text', providerModel: 'claude-haiku-4-5',
    endpoint: KIE + '/claude/v1/messages', adapter: 'anthropic-messages',
    docs: 'https://kie.ai/claude-haiku-4-5', status: 'docs', checked: CHECKED_SEARCH,
  },
  {
    id: 'claude-opus-5-5', name: 'Claude Opus 5.5', provider: 'Anthropic', category: 'text', providerModel: 'claude-opus-5-5',
    endpoint: KIE + '/claude/v1/messages', adapter: 'anthropic-messages',
    docs: 'https://kie.ai/claude-opus-5-5', status: 'unverified', checked: CHECKED_SEARCH,
    missing: 'No se encontró su página en docs.kie.ai: falta confirmar el identificador del modelo.',
  },
  {
    id: 'claude-opus-5', name: 'Claude Opus 5', provider: 'Anthropic', category: 'text', providerModel: 'claude-opus-5',
    endpoint: KIE + '/claude/v1/messages', adapter: 'anthropic-messages',
    docs: 'https://kie.ai/claude-opus-5', status: 'unverified', checked: CHECKED_SEARCH,
    missing: 'No se encontró su página en docs.kie.ai: falta confirmar el identificador del modelo.',
  },
  {
    id: 'gemini-3-pro', name: 'Gemini 3 Pro', provider: 'Google', category: 'text', providerModel: 'gemini-3-pro',
    endpoint: KIE + '/gemini-3-pro/v1/chat/completions', adapter: 'openai-chat',
    docs: 'https://docs.kie.ai/market/gemini/gemini-3-pro', status: 'unverified', checked: CHECKED_SEARCH,
    missing: 'Falta confirmar el texto exacto del campo «model».',
  },
  {
    id: 'gpt-5-2', name: 'GPT-5.2', provider: 'OpenAI', category: 'text', providerModel: 'gpt-5-2',
    endpoint: KIE + '/gpt-5-2/v1/chat/completions', adapter: 'openai-chat',
    docs: 'https://docs.kie.ai/market/chat/gpt-5-2', status: 'unverified', checked: CHECKED_SEARCH,
    missing: 'Falta confirmar el texto exacto del campo «model» y cómo informa el consumo.',
  },
  {
    id: 'gpt-5-4', name: 'GPT-5.4', provider: 'OpenAI', category: 'text', providerModel: 'gpt-5-4',
    endpoint: KIE + '/codex/v1/responses', adapter: 'openai-responses',
    docs: 'https://docs.kie.ai/market/chat/gpt-5-4', status: 'unverified', checked: CHECKED_SEARCH,
    missing: 'Falta confirmar los nombres de los eventos de streaming de Kie para la API «responses».',
  },
  {
    id: 'gpt-5-5', name: 'GPT-5.5', provider: 'OpenAI', category: 'text', providerModel: 'gpt-5-5',
    endpoint: KIE + '/codex/v1/responses', adapter: 'openai-responses',
    docs: 'https://docs.kie.ai/market/chat/gpt-5-5', status: 'unverified', checked: CHECKED_SEARCH,
    missing: 'Falta confirmar los nombres de los eventos de streaming de Kie para la API «responses».',
  },
  {
    id: 'gpt-5-6-luna', name: 'GPT-5.6 Luna', provider: 'OpenAI', category: 'text', providerModel: 'gpt-5-6-luna',
    endpoint: KIE + '/codex/v1/responses', adapter: 'openai-responses',
    docs: 'https://docs.kie.ai/market/chat/gpt-5-6-luna', status: 'unverified', checked: CHECKED_SEARCH,
    missing: 'Falta confirmar los nombres de los eventos de streaming de Kie para la API «responses».',
  },
];

const jobs = (path = '/api/v1/jobs/createTask') => KIE + path;

export const imageModels: ImageModel[] = [
  {
    id: 'nano-banana-2-1', name: 'Nano Banana 2.1', provider: 'Google', category: 'image', providerModel: 'nano-banana-2-1',
    endpoint: jobs(), adapter: 'kie-jobs', docs: 'https://docs.kie.ai/market/google/nanobanana-2-1', status: 'tested',
    checked: '2026-10-16 · en uso en libros y Cinema (ver src/lib/cinema/capabilities.ts)',
    options: {
      fields: {prompt: 'prompt', images: 'image_input', aspect: 'aspect_ratio', resolution: 'resolution', format: 'output_format'},
      // Same values as src/lib/cinema/capabilities.ts, where their sources are listed.
      aspectRatios: nanoRatios, resolutions: nanoResolutions, durations: [], outputFormat: nanoFormat, maxReferences: nanoRefs, maxVariants: nanoVariants, modes: ['create', 'edit'],
    },
  },
  {
    id: 'nano-banana-pro', name: 'Nano Banana Pro', provider: 'Google', category: 'image', providerModel: 'nano-banana-pro',
    endpoint: jobs(), adapter: 'kie-jobs', docs: 'https://docs.kie.ai/market/google/pro-image-to-image', status: 'unverified', checked: CHECKED_SEARCH,
    missing: 'El ejemplo oficial solo muestra 1:1 y 1K; falta la lista completa de proporciones y resoluciones.',
    options: {...noMedia, fields: {prompt: 'prompt', images: 'image_input', aspect: 'aspect_ratio', resolution: 'resolution', format: 'output_format'}},
  },
  {
    id: 'nano-banana-2', name: 'Nano Banana 2', provider: 'Google', category: 'image', providerModel: 'nano-banana-2',
    endpoint: jobs(), adapter: 'kie-jobs', docs: 'https://docs.kie.ai/market/google/nanobanana2', status: 'unverified', checked: CHECKED_SEARCH,
    missing: 'Falta confirmar el identificador y la lista de opciones.', options: noMedia,
  },
  {
    id: 'google-nano-banana', name: 'Nano Banana', provider: 'Google', category: 'image', providerModel: 'google/nano-banana',
    endpoint: jobs(), adapter: 'kie-jobs', docs: 'https://docs.kie.ai/market/google/nano-banana', status: 'unverified', checked: CHECKED_SEARCH,
    missing: 'Falta confirmar el identificador y la lista de opciones.', options: noMedia,
  },
  {
    id: 'gpt-image-2', name: 'GPT Image 2', provider: 'OpenAI', category: 'image', providerModel: 'gpt-image-2-text-to-image',
    endpoint: jobs(), adapter: 'kie-jobs', docs: 'https://docs.kie.ai/market/gpt/gpt-image-2-text-to-image', status: 'unverified', checked: CHECKED_SEARCH,
    missing: 'El ejemplo oficial solo muestra aspect_ratio «auto»; falta la lista de valores.', options: noMedia,
  },
  {
    id: 'gpt-image-2-edit', name: 'GPT Image 2 · editar', provider: 'OpenAI', category: 'image', providerModel: 'gpt-image-2-image-to-image',
    endpoint: jobs(), adapter: 'kie-jobs', docs: 'https://docs.kie.ai/market/gpt/gpt-image-2-image-to-image', status: 'unverified', checked: CHECKED_SEARCH,
    missing: 'Las opciones solo aparecen en una copia no oficial de la documentación.', options: noMedia,
  },
  {
    id: 'gpt-image-1-5-edit', name: 'GPT Image 1.5 · editar', provider: 'OpenAI', category: 'image', providerModel: 'gpt-image/1.5-image-to-image',
    endpoint: jobs(), adapter: 'kie-jobs', docs: 'https://docs.kie.ai/market/gpt-image/1-5-image-to-image', status: 'unverified', checked: CHECKED_SEARCH,
    missing: 'Falta confirmar los campos de entrada.', options: noMedia,
  },
  {
    id: 'seedream-4', name: 'Seedream 4.0', provider: 'ByteDance', category: 'image', providerModel: 'bytedance/seedream-v4-text-to-image',
    endpoint: jobs(), adapter: 'kie-jobs', docs: 'https://docs.kie.ai/market/seedream/seedream-v4-text-to-image', status: 'unverified', checked: CHECKED_SEARCH,
    missing: 'Falta la lista oficial de valores de image_size e image_resolution y el máximo de max_images.', options: noMedia,
  },
  {
    id: 'seedream-4-edit', name: 'Seedream 4.0 · editar', provider: 'ByteDance', category: 'image', providerModel: 'bytedance/seedream-v4-edit',
    endpoint: jobs(), adapter: 'kie-jobs', docs: 'https://docs.kie.ai/market/seedream/seedream-v4-edit', status: 'unverified', checked: CHECKED_SEARCH,
    missing: 'Falta la lista oficial de valores de image_size e image_resolution.', options: noMedia,
  },
  {
    id: 'seedream-3', name: 'Seedream 3.0', provider: 'ByteDance', category: 'image', providerModel: 'bytedance/seedream',
    endpoint: jobs(), adapter: 'kie-jobs', docs: 'https://docs.kie.ai/market/seedream/seedream', status: 'unverified', checked: CHECKED_SEARCH,
    missing: 'Falta la lista oficial de valores de image_size.', options: noMedia,
  },
  {
    id: 'qwen-image', name: 'Qwen Image', provider: 'Alibaba', category: 'image', providerModel: 'qwen/text-to-image',
    endpoint: jobs(), adapter: 'kie-jobs', docs: 'https://docs.kie.ai/market/qwen/text-to-image', status: 'unverified', checked: CHECKED_SEARCH,
    missing: 'Falta confirmar los campos de entrada y sus valores.', options: noMedia,
  },
  {
    id: 'qwen-image-edit', name: 'Qwen Image · editar', provider: 'Alibaba', category: 'image', providerModel: 'qwen/image-to-image',
    endpoint: jobs(), adapter: 'kie-jobs', docs: 'https://docs.kie.ai/market/qwen/image-to-image', status: 'unverified', checked: CHECKED_SEARCH,
    missing: 'Falta confirmar los campos de entrada y sus valores.', options: noMedia,
  },
  {
    id: 'flux-2-pro', name: 'Flux 2 Pro', provider: 'Black Forest Labs', category: 'image', providerModel: 'flux-2/pro-text-to-image',
    endpoint: jobs(), adapter: 'kie-jobs', docs: 'https://docs.kie.ai/market/flux2/pro-text-to-image', status: 'unverified', checked: CHECKED_SEARCH,
    missing: 'El ejemplo muestra aspect_ratio y resolution «1K», pero falta la lista de valores.', options: noMedia,
  },
  {
    id: 'flux-2-pro-edit', name: 'Flux 2 Pro · editar', provider: 'Black Forest Labs', category: 'image', providerModel: 'flux-2/pro-image-to-image',
    endpoint: jobs(), adapter: 'kie-jobs', docs: 'https://docs.kie.ai/market/flux2/pro-image-to-image', status: 'unverified', checked: CHECKED_SEARCH,
    missing: 'Falta la lista de valores de proporción y resolución.', options: noMedia,
  },
  {
    id: 'grok-imagine-edit', name: 'Grok Imagine · editar', provider: 'xAI', category: 'image', providerModel: 'grok-imagine/image-to-image',
    endpoint: jobs(), adapter: 'kie-jobs', docs: 'https://docs.kie.ai/market/grok-imagine/image-to-image', status: 'unverified', checked: CHECKED_SEARCH,
    missing: 'Falta confirmar el identificador y los campos de entrada.', options: noMedia,
  },
  {
    id: 'flux-kontext', name: 'Flux Kontext', provider: 'Black Forest Labs', category: 'image', providerModel: 'flux-kontext-pro',
    endpoint: KIE + '/api/v1/flux/kontext/generate', adapter: 'kie-dedicated', docs: 'https://docs.kie.ai/flux-kontext-api/generate-or-edit-image', status: 'unverified', checked: CHECKED_SEARCH,
    missing: 'Usa una API propia (no createTask): falta su adaptador y confirmar sus campos.', options: noMedia,
  },
];

export const videoModels: VideoModel[] = [
  {
    id: 'veo-3-1', name: 'Veo 3.1', provider: 'Google', category: 'video', providerModel: 'veo-3-1',
    endpoint: jobs(), adapter: 'kie-jobs', docs: 'https://docs.kie.ai/veo3-api/generate-veo-3-video', status: 'unverified', checked: CHECKED_SEARCH,
    missing: 'La documentación muestra dos endpoints distintos (createTask y /api/v1/veo/generate); falta confirmar cuál vale hoy y sus opciones.', options: noMedia,
  },
  {
    id: 'kling-3', name: 'Kling 3.0', provider: 'Kuaishou', category: 'video', providerModel: 'kling-3.0/video',
    endpoint: jobs(), adapter: 'kie-jobs', docs: 'https://docs.kie.ai/market/kling/kling-3-0', status: 'unverified', checked: CHECKED_SEARCH,
    missing: 'Los campos (prompt, image_urls, sound, duration, aspect_ratio) están confirmados; faltan sus valores permitidos.',
    options: {...noMedia, fields: {prompt: 'prompt', images: 'image_urls', aspect: 'aspect_ratio', duration: 'duration'}},
  },
  {
    id: 'hailuo-02-standard', name: 'Hailuo 02 Standard', provider: 'MiniMax', category: 'video', providerModel: 'hailuo/02-text-to-video-standard',
    endpoint: jobs(), adapter: 'kie-jobs', docs: 'https://docs.kie.ai/market/hailuo/02-text-to-video-standard', status: 'unverified', checked: CHECKED_SEARCH,
    missing: 'Falta confirmar los campos de entrada y sus valores (duración, resolución).', options: noMedia,
  },
];

export const catalog: CatalogModel[] = [...textModels, ...imageModels, ...videoModels];

export const findModel = (id: string) => catalog.find(m => m.id === id);
export const enabledStatus = (m: CatalogModel) => m.status !== 'unverified';

/** The view the browser gets: no endpoints, only what the pickers need. */
export type PublicModel = {
  id: string; name: string; provider: string; category: Category; status: ModelStatus; available: boolean;
  docs: string; missing?: string; options?: MediaOptions; price?: CatalogModel['price'];
};

export function publicModel(m: CatalogModel, keyConfigured: boolean): PublicModel {
  return {
    id: m.id, name: m.name, provider: m.provider, category: m.category, status: m.status,
    available: keyConfigured && enabledStatus(m), docs: m.docs, missing: m.missing,
    options: m.category === 'text' ? undefined : m.options, price: m.price,
  };
}

/** A short, factual list of what the enabled image and video models accept, for assistants that write prompts. */
export function mediaSummary() {
  const lines: string[] = [];
  for (const m of [...imageModels, ...videoModels].filter(enabledStatus)) {
    const o = m.options;
    const parts = [
      o.aspectRatios.length ? 'proporciones ' + o.aspectRatios.join(', ') : '',
      o.resolutions.length ? 'resoluciones ' + o.resolutions.join(', ') : '',
      o.durations.length ? 'duraciones ' + o.durations.join(', ') : '',
      o.maxReferences ? 'hasta ' + o.maxReferences + ' imágenes de referencia' : 'sin imágenes de referencia',
      'hasta ' + o.maxVariants + (o.maxVariants === 1 ? ' variante' : ' variantes'),
      o.modes.includes('edit') ? 'puede editar una imagen existente' : '',
    ].filter(Boolean);
    lines.push('- ' + m.name + ' (' + (m.category === 'image' ? 'imagen' : 'video') + '): ' + parts.join('; ') + '.');
  }
  if (!videoModels.some(enabledStatus)) lines.push('- Video: todavía no hay un modelo de video verificado en el estudio.');
  return lines.join('\n');
}
