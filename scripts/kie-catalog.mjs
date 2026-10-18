// Builds src/lib/ai/kie-catalog.ts from Kie's own documentation (docs.kie.ai), so the studio lists every model
// Kie documents, with the options its OpenAPI specification states. Nothing is guessed: a model whose screen the
// studio does not have yet (upscale, lip sync, music…) or whose required inputs it cannot give is listed, disabled,
// with the reason.
//
//   node scripts/kie-catalog.mjs              downloads docs.kie.ai/llms.txt and every model page
//   node scripts/kie-catalog.mjs <folder>     uses pages already downloaded there (files named like the URL path)
//
// Hand-written entries in src/lib/ai/models.ts (the models tested for real) take precedence over these.
import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

const KIE = 'https://api.kie.ai';
const DOCS = 'https://docs.kie.ai/';
// CATALOG_DATE: the day the saved pages were read, when generating from a folder of saved pages.
const today = process.env.CATALOG_DATE || new Date().toISOString().slice(0, 10);
const out = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src', 'lib', 'ai', 'kie-catalog.ts');

async function pages(folder) {
  if (folder) {
    const files = (await fs.readdir(folder)).filter(f => f.endsWith('.md'));
    return Promise.all(files.map(async f => ({url: DOCS + f.replaceAll('__', '/'), text: await fs.readFile(path.join(folder, f), 'utf8')})));
  }
  const index = await (await fetch(DOCS + 'llms.txt')).text();
  const urls = [...new Set(index.match(/https:\/\/docs\.kie\.ai\/[^)\s]+\.md/g) || [])].filter(u => !u.includes('/cn/') && !u.includes('callback'));
  const list = [];
  for (const url of urls) {
    const r = await fetch(url);
    if (r.ok) list.push({url, text: await r.text()});
  }
  return list;
}

const providers = [
  [/^(GPT|GPT Image|Codex)$/, 'OpenAI'], [/^Claude$/, 'Anthropic'], [/^(Gemini|Google|Veo3\.1 API|Gemini Omni)$/, 'Google'],
  [/^(Grok|Grok Imagine)$/, 'xAI'], [/^(Seedream|Bytedance|OmniHuman|Volcengine)$/, 'ByteDance'], [/^(Qwen|Wan)$/, 'Alibaba'],
  [/^Kling$/, 'Kuaishou'], [/^(Hailuo|MiniMax H3)$/, 'MiniMax'], [/^(Flux-2|Flux Kontext API)$/, 'Black Forest Labs'],
  [/^Deepseek$/, 'DeepSeek'], [/^Kimi$/, 'Moonshot AI'], [/^Runway API$/, 'Runway'], [/^4o Image API$/, 'OpenAI'],
];
const byModel = [[/^ai-music-api\//, 'Suno'], [/^runway/, 'Runway'], [/^grok/, 'xAI'], [/^elevenlabs\//, 'ElevenLabs']];
const providerOf = (family, model = '') => byModel.find(([re]) => re.test(model))?.[1] || providers.find(([re]) => re.test(family))?.[1] || family;

// Kie's page titles are written for its own menus ("Image Edit", "imagen4", "2.2 A14B …"): the family goes in front
// when the title does not say it, and slugs become words. The model string itself is never changed.
const families = [
  [/^qwen\//, 'Qwen'], [/^flux-2\//, 'Flux 2'], [/^ideogram\//, 'Ideogram'], [/^recraft\//, 'Recraft'], [/^topaz\//, 'Topaz'],
  [/^wan\//, 'Wan'], [/^kling/, 'Kling'], [/^veo/, 'Veo 3.1'], [/^runway/, 'Runway'], [/^elevenlabs\//, 'ElevenLabs'], [/^ai-music-api\//, 'Suno'],
  [/^google\/imagen4/, 'Imagen 4'], [/^bytedance\/v1-/, 'Bytedance'],
];
const renamed = {'4o-image-api': 'GPT-4o Image', 'flux1-kontext': 'Flux Kontext', 'runway': 'Runway · Generate AI Video', 'runway/gen4-aleph': 'Runway Aleph', 'veo-3-1': 'Veo 3.1', 'google/imagen4': 'Imagen 4', 'google/imagen4-fast': 'Imagen 4 Fast', 'google/imagen4-ultra': 'Imagen 4 Ultra', 'z-image': 'Z-Image'};
const small = new Set(['to', 'and', 'or', 'from', 'of', 'with', 'a']);
const words = t => t.replace(/(\d)-(\d)/g, '$1.$2').split('-').map((w, i) => i && small.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
function friendly(title, model) {
  if (renamed[model]) return renamed[model];
  let name = title.includes('/') && !title.includes(' ') ? title.split('/').pop() : title;
  name = name.split(/\s+/).map(t => /^[a-z0-9.]+(-[a-z0-9.]+)+$/i.test(t) ? words(t) : /^[a-z]+$/.test(t) && !small.has(t) ? t[0].toUpperCase() + t.slice(1) : t).join(' ');
  name = name.replace(/\s+-\s+/g, ' · ').replace(/^(Seedream)(\d)/, '$1 $2').replace(/GPT Image-(\d)/, 'GPT Image $1').replace(/\bGpt\b/g, 'GPT').replace(/ To /g, ' to ');
  const family = families.find(([re]) => re.test(model))?.[1];
  if (family && !name.toLowerCase().replace(/\s/g, '').includes(family.toLowerCase().split(' ')[0])) name = family + (/^\d/.test(name) ? ' ' : ' · ') + name;
  return name;
}

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const ratioLike = list => Array.isArray(list) && list.length && list.every(v => /^(\d+(\.\d+)?:\d+(\.\d+)?|auto|adaptive)$/i.test(String(v)));

function spec(text) {
  const m = text.match(/```yaml\n([\s\S]*?)\n```/);
  if (!m) return null;
  try { return YAML.parse(m[1]); } catch { return null; }
}

function resolver(s) {
  const schemas = s.components?.schemas || {};
  const r = node => node && node.$ref ? r(schemas[node.$ref.split('/').pop()] || {}) : node || {};
  return r;
}

function textEntry(page, s, opPath, op) {
  const r = resolver(s);
  const body = r(op.requestBody?.content?.['application/json']?.schema);
  const props = body.properties || {};
  const raw = JSON.stringify(body);
  const desc = op.description || '';
  const family = (op.tags || []).join(' ').split('/').pop().trim();
  const adapter = opPath.includes('/chat/completions') ? 'openai-chat' : opPath.includes('/claude/v1/messages') ? 'anthropic-messages'
    : opPath.endsWith('/responses') ? 'openai-responses' : opPath.includes(':streamGenerateContent') ? 'gemini-native' : null;
  if (!adapter) return null;
  const model = r(props.model);
  const providerModel = model.enum?.[0] || model.default || (Array.isArray(model.examples) ? model.examples[0] : '') || '';
  const native = adapter === 'gemini-native';
  const title = String(op.summary || '').trim();
  const name = title.replace(/\s*\((openai|response)\)\s*$/i, '').replace(/\s+/g, ' ').replace(/\bGpt\b/g, 'GPT') + (native ? ' (API de Gemini)' : '');
  const inputs = [];
  if (raw.includes('image_url') || raw.includes('input_image') || raw.includes('inline_data')) inputs.push('image');
  if (/pdf/i.test(raw + desc) || raw.includes('input_file') || raw.includes('inline_data')) inputs.push('pdf');
  const id = slug(providerModel || opPath.split('/').filter(Boolean)[native ? 3 : 0].replace(/:.*$/, '').replace(/-openai$/, '') + (native ? '-native' : ''));
  // Web search, only as the page documents it: Gemini's Google Search grounding (googleSearch) or OpenAI's web_search.
  // A page that says the model ignores it (Kimi K3) gets none.
  const noSearch = /does not support\**\s*web search|web_search`? (are|is) ignored/i.test(page.text);
  const webSearch = noSearch || adapter === 'anthropic-messages' ? undefined
    : raw.includes('googleSearch') ? 'googleSearch' : raw.includes('web_search') ? 'web_search'
      // Responses pages describe the tool in their components: {"type": "web_search"}.
      : adapter === 'openai-responses' && /"type":\s*"web_search"|-\s+web_search\b/.test(page.text) ? 'web_search' : undefined;
  return {
    id, name, provider: providerOf(family, providerModel), category: 'text', providerModel, endpoint: KIE + opPath, adapter,
    docs: page.url.replace(/\.md$/, ''), status: 'docs', checked: today + ' · docs.kie.ai (especificación de la página)',
    inputs, stream: 'stream' in props, ...(webSearch ? {webSearch} : {}),
  };
}

// The inputs the studio's image and video screens can give a model.
const arrayImageFields = ['image_input', 'image_urls', 'input_urls', 'reference_image_urls', 'image_url'];
const singleImageFields = ['image_url', 'first_frame_url'];

function mediaEntry(page, s, opPath, op, category) {
  const r = resolver(s);
  const body = r(op.requestBody?.content?.['application/json']?.schema);
  const props = body.properties || {};
  const model = r(props.model);
  const providerModel = model.enum?.[0] || model.default || (Array.isArray(model.examples) ? model.examples[0] : '');
  const family = (op.tags || []).join(' ').split('/').pop().trim();
  const title = String(op.summary || '').trim().replace(/^(Google|Qwen|Wan|Kling|Bytedance|Topaz|Recraft|Ideogram|Flux-2)\s*-\s*/i, '');
  const base = {
    id: slug(providerModel || title), name: friendly(title, String(providerModel || '')), provider: providerOf(family, String(providerModel || '')), category, providerModel: String(providerModel || ''),
    endpoint: KIE + opPath, adapter: opPath === '/api/v1/jobs/createTask' ? 'kie-jobs' : 'kie-dedicated',
    docs: page.url.replace(/\.md$/, ''), checked: today + ' · docs.kie.ai (especificación de la página)',
  };
  const listed = missing => ({...base, status: 'listed', missing, options: {fields: {prompt: 'prompt'}, aspectRatios: [], resolutions: [], durations: [], maxReferences: 0, maxVariants: 1, modes: ['create']}});
  if (base.adapter !== 'kie-jobs' || !providerModel) return listed('Usa una API propia de Kie que el estudio todavía no tiene.');
  if (category === 'audio') return listed('El estudio todavía no tiene una pantalla de audio o música.');

  const input = r(props.input);
  const fields = input.properties || {};
  const required = new Set(input.required || []);
  const f = k => fields[k] ? r(fields[k]) : null;
  if (!f('prompt')) return listed('No usa un prompt de texto: es una herramienta (mejorar resolución, quitar fondo, detección…) que el estudio todavía no tiene.');

  const used = new Set(['prompt']);
  const options = {fields: {prompt: 'prompt'}, aspectRatios: [], resolutions: [], durations: [], maxReferences: 0, maxVariants: category === 'image' ? 4 : 1, modes: ['create']};

  // Reference images.
  let imagesRequired = false;
  const arrayField = arrayImageFields.find(k => f(k)?.type === 'array');
  const singleField = arrayField ? null : singleImageFields.find(k => f(k)?.type === 'string');
  for (const k of [...arrayImageFields, ...singleImageFields, 'reference_image', 'image_references', 'first_frame_image_url', 'last_frame_url', 'last_frame_image_url']) {
    if (fields[k] && required.has(k) && k !== arrayField && k !== singleField) return listed('Pide «' + k + '», que la pantalla del estudio todavía no da.');
  }
  if (arrayField || singleField) {
    const k = arrayField || singleField;
    used.add(k);
    imagesRequired = required.has(k);
    // Video: the image is where the video starts (or its reference). A model that requires it is offered only
    // where an image can be given (/video-generation in the Chat); modes ['edit'] marks that.
    options.fields.images = k;
    if (singleField) options.fields.imagesSingle = true;
    options.maxReferences = arrayField ? Math.max(1, Number(f(k).maxItems) || 1) : 1;
    options.modes = imagesRequired ? ['edit'] : ['create', 'edit'];
  }

  // Shape, size, length and file type: only enumerated values are offered.
  const enumOf = k => f(k)?.enum?.map(String);
  const aspectKey = ['aspect_ratio', 'image_size', 'size'].find(k => ratioLike(enumOf(k)));
  if (aspectKey) { options.fields.aspect = aspectKey; options.aspectRatios = enumOf(aspectKey); used.add(aspectKey); }
  const sizeKey = ['resolution', 'quality', 'size', 'image_size'].find(k => !used.has(k) && enumOf(k)?.length && !ratioLike(enumOf(k)));
  if (sizeKey) {
    options.fields.resolution = sizeKey; options.resolutions = enumOf(sizeKey); used.add(sizeKey);
    if (sizeKey === 'quality') options.resolutionLabel = 'Calidad';
    if (sizeKey === 'size' || sizeKey === 'image_size') options.resolutionLabel = 'Tamaño';
  }
  if (f('duration')) {
    if (enumOf('duration')?.length) {
      options.fields.duration = 'duration'; options.durations = enumOf('duration'); used.add('duration');
      if (['integer', 'number'].includes(f('duration').type)) options.fields.durationNumber = true;
    } else if (required.has('duration')) return listed('Pide una duración, pero la documentación no enumera los valores permitidos.');
  }
  const formats = enumOf('output_format');
  if (formats?.length) {
    options.fields.format = 'output_format';
    options.outputFormat = ['png', 'mp4', 'jpeg', 'jpg'].find(v => formats.includes(v)) || formats[0];
    used.add('output_format');
  }

  // Anything else that is required must have a documented default (sent as is) or the model cannot be offered.
  const fixed = {};
  for (const k of required) {
    if (used.has(k)) continue;
    const v = f(k);
    if (v && v.default !== undefined) { fixed[k] = v.default; continue; }
    return listed('Pide «' + k + '», que la pantalla del estudio todavía no da.');
  }
  for (const k of ['aspect_ratio', 'resolution', 'duration', 'quality']) {
    if (required.has(k) && !used.has(k)) return listed('Pide «' + k + '» sin enumerar sus valores en la documentación.');
  }
  if (Object.keys(fixed).length) options.fixed = fixed;
  return {...base, status: 'docs', options};
}

const list = await pages(process.argv[2]);
const text = [], image = [], video = [], audio = [];
for (const page of list) {
  const s = spec(page.text);
  if (!s?.paths) continue;
  for (const [opPath, ops] of Object.entries(s.paths)) {
    const op = ops?.post;
    if (!op) continue;
    const tags = (op.tags || []).join(' ');
    if (/File Upload|Common|AI Agent/i.test(tags) || /get-task-detail|download-url|codex\/gpt-codex/.test(page.url)) continue;
    if (/Chat/.test(tags)) { const e = textEntry(page, s, opPath, op); if (e) text.push(e); continue; }
    const category = /Image/.test(tags) ? 'image' : /Video/.test(tags) ? 'video' : /Music/.test(tags) ? 'audio' : null;
    if (!category) continue;
    const e = mediaEntry(page, s, opPath, op, category);
    ({image, video, audio})[category].push(e);
  }
}
// Ids must be unique: a second page for the same model id keeps both, the second with its page as suffix.
const seen = new Set();
for (const e of [...text, ...image, ...video, ...audio]) {
  if (seen.has(e.id)) e.id = e.id + '-' + slug(e.docs.split('/').pop());
  seen.add(e.id);
}
const sort = arr => arr.sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name, 'en', {numeric: true}));
const dump = (name, type, arr) => `export const ${name}: ${type}[] = ${JSON.stringify(sort(arr), null, 1).replace(/\n\s*/g, ' ').replace(/\{ /g, '{').replace(/ \}/g, '}').replace(/\}, \{/g, '},\n  {').replace(/^\[ /, '[\n  ').replace(/ \]$/, ',\n]')};\n`;
const source = `// Generated by scripts/kie-catalog.mjs from docs.kie.ai on ${today}. Do not edit by hand:
// run the script again, or override an entry in src/lib/ai/models.ts.
import type {TextModel, ImageModel, VideoModel, AudioModel} from './models';

${dump('docsText', 'TextModel', text)}
${dump('docsImage', 'ImageModel', image)}
${dump('docsVideo', 'VideoModel', video)}
${dump('docsAudio', 'AudioModel', audio)}`;
await fs.writeFile(out, source);
console.log(`text ${text.length} · image ${image.length} (${image.filter(e => e.status === 'docs').length} usable) · video ${video.length} (${video.filter(e => e.status === 'docs').length} usable) · audio ${audio.length}`);
