// What Cinema Studio may ask Kie for. Shared by the UI and the server validation:
// the interface never shows an option the server would not accept.
//
// Sources (checked 2026-10-16):
// - Model id, endpoint and the input fields (prompt, image_input, aspect_ratio, resolution,
//   output_format): docs.kie.ai/market/google/nanobanana-2-1 and the production book pipeline
//   (src/lib/pipeline/kie-images.ts, which already sends 4:3 · 2K · png).
// - "auto" and "1K": the official 2.1 request example.
// - The remaining ratios: the ratio table that docs.kie.ai publishes for the same family
//   (Nano Banana 2 Lite). The 2.1 table itself could not be opened from the build environment;
//   if Kie rejects one, the task fails with a visible error and the value should be removed here.
// - "4K": kie.ai/nano-banana-2 (family product page).
// - Task states, error codes, creditsConsumed and the 14-day retention: docs.kie.ai/market/common/get-task-detail
//   and docs.kie.ai (Getting Started).

export const imageModel = {id: 'nano-banana-2-1', name: 'Nano Banana 2.1', provider: 'Google'} as const;

export const aspectRatios = ['auto', '1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16', '5:4', '4:5', '21:9'] as const;
// Other catalog models may accept other values; the catalog entry of each model is the source of truth.
export type AspectRatio = (typeof aspectRatios)[number] | (string & {});

export const resolutions = ['1K', '2K', '4K'] as const;
export type Resolution = (typeof resolutions)[number] | (string & {});

export const outputFormat = 'png';
export const maxReferences = 4;
export const maxVariants = 4;
export const retentionDays = 14;

export const taskStates = ['waiting', 'queuing', 'generating', 'success', 'fail'] as const;
export type TaskState = (typeof taskStates)[number];

export function ratioValue(aspect: AspectRatio) {
  if (aspect === 'auto') return 1;
  const [w, h] = aspect.split(':').map(Number);
  return w / h;
}
