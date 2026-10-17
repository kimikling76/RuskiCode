import {aspectRatios as nanoRatios, resolutions as nanoResolutions, maxReferences as nanoRefs, maxVariants as nanoVariants, outputFormat as nanoFormat} from '@/lib/cinema/capabilities';

import {docsText, docsImage, docsVideo, docsAudio} from './kie-catalog';
import {usableStatus} from './model-status';

// The studio's catalog of Kie.ai models.
//
// Kie does not have an endpoint that lists every model, but its documentation does: docs.kie.ai/llms.txt lists
// every page, and each page carries the model's OpenAPI specification. scripts/kie-catalog.mjs reads them and
// writes src/lib/ai/kie-catalog.ts. The few entries below are the models used for real from the studio: they
// take precedence over the generated ones.
//
// Status:
// - 'tested'     documentation checked and used for real from the studio. Enabled.
// - 'docs'       endpoint, request format and parameters taken from Kie's documentation, but no real operation
//                from the studio yet. Enabled, marked «Sin prueba real».
// - 'listed'     documented by Kie, but the studio has no screen for it yet (music, upscale, lip sync…) or cannot
//                give an input it requires (written in `missing`). Disabled, marked «Sin pantalla en el estudio».
// - 'unverified' something essential is not confirmed (written in `missing`). Disabled, marked «No verificado».
//
// Never fill an option, a price or a capability that the documentation does not state.
// No secrets here: this file is also used by the browser. Keys live only in the server's environment.

export type Category = 'text' | 'image' | 'video' | 'audio';
export type ModelStatus = 'tested' | 'docs' | 'listed' | 'unverified';

/** How the server talks to the model. */
export type Adapter =
  | 'openai-chat'          // POST …/v1/chat/completions, OpenAI format, SSE stream (GPT 5.2: one JSON answer)
  | 'anthropic-messages'   // POST /claude/v1/messages, Anthropic format with Bearer key, SSE stream
  | 'openai-responses'     // POST /codex|grok|openai/v1/responses, OpenAI Responses format
  | 'gemini-native'        // POST /gemini/v1/models/<model>:streamGenerateContent, Gemini format with Bearer key
  | 'kie-jobs'             // POST /api/v1/jobs/createTask + GET /api/v1/jobs/recordInfo
  | 'kie-dedicated';       // A family API with its own endpoints (not implemented)

type Base = {
  /** Internal id, stable: stored in chats, assistants and favorites. */
  id: string;
  name: string;
  provider: string;
  category: Category;
  /** The model string Kie expects. Empty when the endpoint itself names the model and the body has no `model`. */
  providerModel: string;
  endpoint: string;
  adapter: Adapter;
  docs: string;
  status: ModelStatus;
  /** When the documentation was last checked, and how. */
  checked: string;
  /** What is missing for the studio to use it (required when status is 'listed' or 'unverified'). */
  missing?: string;
  /** A price only if Kie publishes it; shown as an estimate, never as the real cost. */
  /** e.g. {credits: 6, per: 'por imagen', source: '<link to Kie\'s published price>'}. */
  price?: {credits: number; per: string; source: string};
};

/** What a chat message can carry besides text, as the model's documentation states it. */
export type TextInput = 'image' | 'pdf';
export type TextModel = Base & {category: 'text'; inputs?: readonly TextInput[]; stream?: boolean};

/** Options a generation model really accepts. Empty or absent means the interface does not offer it. */
export type MediaOptions = {
  /** Input field names in Kie's request. */
  fields: {
    prompt: string; images?: string; aspect?: string; resolution?: string; duration?: string; format?: string;
    /** The image field takes one URL, not a list. */
    imagesSingle?: boolean;
    /** The duration is a number in Kie's request, not a string. */
    durationNumber?: boolean;
  };
  aspectRatios: readonly string[];
  resolutions: readonly string[];
  /** What the «resolution» field really is for this model (Calidad, Tamaño); «Resolución» when absent. */
  resolutionLabel?: string;
  durations: readonly string[];
  outputFormat?: string;
  /** Required fields with a documented default, sent as documented. */
  fixed?: Record<string, unknown>;
  /** Reference images: 0 = none. */
  maxReferences: number;
  /** Variants per request. Kie creates one task per variant. */
  maxVariants: number;
  /** 'create' works from text alone; 'edit' needs reference images. */
  modes: readonly ('create' | 'edit')[];
};

export type ImageModel = Base & {category: 'image'; options: MediaOptions};
export type VideoModel = Base & {category: 'video'; options: MediaOptions};
export type AudioModel = Base & {category: 'audio'; options: MediaOptions};
export type CatalogModel = TextModel | ImageModel | VideoModel | AudioModel;

const KIE = 'https://api.kie.ai';

// Used for real from the studio since stage 1. Their documented inputs come from the generated entry for the same endpoint.
const tested: CatalogModel[] = [
  {
    id: 'kie-flash', name: 'Gemini 3.8 Flash', provider: 'Google', category: 'text', providerModel: 'gemini-3.8-flash',
    endpoint: KIE + '/gemini-3-8-flash-openai/v1/chat/completions', adapter: 'openai-chat',
    docs: 'https://docs.kie.ai/market/gemini/gemini-3-8-flash-openai', status: 'tested', checked: '2026-10-16 · en uso en el Chat desde la Etapa 1',
  },
  {
    id: 'kie-pro', name: 'Gemini 3.1 Pro', provider: 'Google', category: 'text', providerModel: 'gemini-3.1-pro',
    endpoint: KIE + '/gemini-3.1-pro/v1/chat/completions', adapter: 'openai-chat',
    docs: 'https://docs.kie.ai/market/gemini/gemini-3-1-pro', status: 'tested', checked: '2026-10-16 · en uso en el Chat desde la Etapa 1',
  },
  {
    id: 'nano-banana-2-1', name: 'Nano Banana 2.1', provider: 'Google', category: 'image', providerModel: 'nano-banana-2-1',
    endpoint: KIE + '/api/v1/jobs/createTask', adapter: 'kie-jobs', docs: 'https://docs.kie.ai/market/google/nanobanana-2-1', status: 'tested',
    checked: '2026-10-16 · en uso en libros y Cinema (ver src/lib/cinema/capabilities.ts)',
    options: {
      fields: {prompt: 'prompt', images: 'image_input', aspect: 'aspect_ratio', resolution: 'resolution', format: 'output_format'},
      // Same values as src/lib/cinema/capabilities.ts, where their sources are listed.
      aspectRatios: nanoRatios, resolutions: nanoResolutions, durations: [], outputFormat: nanoFormat, maxReferences: nanoRefs, maxVariants: nanoVariants, modes: ['create', 'edit'],
    },
  },
];

/** The generated entry a tested one replaces: same id, or the same endpoint and model. */
const twin = (h: CatalogModel, d: CatalogModel) => h.category === d.category && (h.id === d.id || h.endpoint === d.endpoint && (h.providerModel === d.providerModel || h.category === 'text' && !d.providerModel));

function merge<T extends CatalogModel>(category: Category, generated: T[]): T[] {
  const own = tested.filter(m => m.category === category) as T[];
  const merged = own.map(h => {
    const d = generated.find(g => twin(h, g));
    return h.category === 'text' && d?.category === 'text' ? {...h, inputs: d.inputs, stream: d.stream} as T : h;
  });
  return [...merged, ...generated.filter(g => !own.some(h => twin(h, g)))];
}

export const textModels: TextModel[] = merge('text', docsText);
export const imageModels: ImageModel[] = merge('image', docsImage);
export const videoModels: VideoModel[] = merge('video', docsVideo);
export const audioModels: AudioModel[] = merge('audio', docsAudio);

export const catalog: CatalogModel[] = [...textModels, ...imageModels, ...videoModels, ...audioModels];

export const findModel = (id: string) => catalog.find(m => m.id === id);
export {usableStatus};
export const enabledStatus = (m: CatalogModel) => usableStatus(m.status);

/** The view the browser gets: no endpoints, only what the pickers need. */
export type PublicModel = {
  id: string; name: string; provider: string; category: Category; status: ModelStatus; available: boolean;
  docs: string; missing?: string; options?: MediaOptions; price?: CatalogModel['price']; inputs?: readonly TextInput[];
};

export function publicModel(m: CatalogModel, keyConfigured: boolean): PublicModel {
  return {
    id: m.id, name: m.name, provider: m.provider, category: m.category, status: m.status,
    available: keyConfigured && enabledStatus(m), docs: m.docs, missing: m.missing,
    ...(m.category === 'text' ? {inputs: m.inputs || []} : {options: m.options}), price: m.price,
  };
}

/**
 * A short, factual list of what the image and video models accept, for assistants that write prompts.
 * The tested models in full; the rest of the enabled ones by name, so the list stays short.
 */
export function mediaSummary() {
  const lines: string[] = [];
  const media = [...imageModels, ...videoModels].filter(enabledStatus);
  for (const m of media.filter(m => m.status === 'tested')) {
    const o = m.options;
    const parts = [
      o.aspectRatios.length ? 'proporciones ' + o.aspectRatios.join(', ') : '',
      o.resolutions.length ? (o.resolutionLabel || 'resoluciones').toLowerCase() + ' ' + o.resolutions.join(', ') : '',
      o.durations.length ? 'duraciones ' + o.durations.join(', ') : '',
      o.maxReferences ? 'hasta ' + o.maxReferences + ' imágenes de referencia' : 'sin imágenes de referencia',
      'hasta ' + o.maxVariants + (o.maxVariants === 1 ? ' variante' : ' variantes'),
      o.modes.includes('edit') ? 'puede editar una imagen existente' : '',
    ].filter(Boolean);
    lines.push('- ' + m.name + ' (' + (m.category === 'image' ? 'imagen' : 'video') + '): ' + parts.join('; ') + '.');
  }
  for (const category of ['image', 'video'] as const) {
    const rest = media.filter(m => m.status === 'docs' && m.category === category);
    if (rest.length) lines.push('- Otros modelos de ' + (category === 'image' ? 'imagen' : 'video') + ' habilitados, sin prueba real desde el estudio (cada uno muestra sus opciones al elegirlo): ' + rest.map(m => m.name).join(', ') + '.');
  }
  if (!videoModels.some(enabledStatus)) lines.push('- Video: todavía no hay un modelo de video habilitado en el estudio.');
  return lines.join('\n');
}
