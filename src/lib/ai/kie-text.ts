import type {ModelConfig} from './catalog';
import {textModels, enabledStatus, type TextModel} from './models';

/** Kie text models this server can use right now: enabled in the catalog and the key is configured. */
export function availableText() {
  return process.env.KIE_API_KEY ? textModels.filter(enabledStatus) : [];
}

/** «Auto» keeps its earlier meaning: the fast Gemini model, or the first available one. */
export function resolveText(id: string) {
  const all = availableText();
  return id === 'auto' ? all.find(m => m.id === 'kie-flash') || all[0] : all.find(m => m.id === id);
}

/** The provider configuration the streaming adapters expect, built from a catalog entry. */
export function textConfig(m: TextModel): ModelConfig {
  const provider = m.adapter === 'anthropic-messages' ? 'anthropic' : m.adapter === 'openai-responses' ? 'responses' : 'compatible';
  return {
    id: m.id, name: m.name, provider, keyEnv: 'KIE_API_KEY', model: m.providerModel, endpoint: m.endpoint,
    bearer: true, kie: true, taskScore: {book: 0, image: 0, video: 0, general: 0}, supportsTools: false, supportsVision: false,
  };
}
