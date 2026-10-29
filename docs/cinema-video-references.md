# Cinema Studio: agregar video

Cinema Studio → Video now offers **Agregar video** alongside the existing image references. It opens the existing accessible picker, extended for video uploads and finished gallery clips. Applying the selection chooses the compatible model shown in the dialog; the selected model remains visible before generation. Uploading or selecting does not create a paid Kie task.

## Verified provider support

Only **Kling 4.0 Reference to Video** offers video input in this delivery. Its official page documents optional `input.video_urls`, up to five clips of 2–30 seconds each, named `@video_1`, `@video_2`, etc. Image references remain separate in `input.image_urls`. Author shorthand `@video1` is translated to the documented name, alongside existing image mentions.

Sources checked October 29, 2026:

- https://docs.kie.ai/market/kling/v4-reference-to-video
- https://docs.kie.ai/file-upload-api/upload-file-stream

No new models, prices, credits, environment variables, dependencies, endpoints, or database migrations were added. Other models keep their existing capabilities. Switching to an incompatible model with videos attached disables generation and asks the person to change the model or remove the clips.

## Uploads and persistence

Local uploads accept MP4, **4,000,000 bytes maximum per file**. This is the studio's existing asset-upload limit, below Vercel's request size limit, not a claimed Kie limit. The browser checks the file signature and actual media duration before upload; the server checks the signature, existing upload size limit, session, origin and rate limit. Kie performs the final media compatibility validation. Duration of gallery clips is read before selection; expired or unreadable links show an error.

Original bytes are stored through the existing private `/api/sync/assets` route. They reach Kie's authenticated file-stream upload API only when generating. No credentials enter the browser. New `videoReferences` metadata is optional for older jobs and retained in the existing persisted/synced job record, retry and “Repetir con estos ajustes”. Video references can be previewed with native controls and removed. Several references scroll in one row on small screens.

## Verification

- `npm ci`: completed, no new project dependency.
- `npm run typecheck`: passed.
- `npm test`: 190 tests, 189 passed, one existing PDF pagination browser test skipped because `CHROMIUM_EXECUTABLE_PATH` was not set.
- `npm run build`: passed (production app contains no QA route).
- Four new unit tests cover documented capabilities, distinct image/video payloads and mentions, unsupported/oversized reference lists, and MP4 signature validation.
- `scripts/cinema-video-qa.mjs`: runs the actual updated components in a temporary source copy. Only that copy contains `/cinema-video-qa`; API/storage responses and gallery media are intercepted in isolated browser contexts. No mock provider, fixture route or example video is added to production source.
- Screenshots at **390×480**, **768×900**, **1280×900**: upload, native preview, prompt and Generate controls. Checks include invalid/oversized files rejected before upload, exact uploaded bytes, no generation before confirmation, original video reference in request payload, stored jobs after reload, gallery selection without re-upload, removal, keyboard open/Escape, reduced motion and absence of horizontal page overflow. Desktop also checks failure + retry preserving the reference.
- Axe WCAG A/AA/2.1 AA: no violations in the tested attached-video screen at those three sizes. No browser page errors.
- Mobile overflow from existing absolutely positioned hidden setting labels was exposed by the longer toolbar; positioning the setting buttons fixes their containing block without changing their behavior.

The browser exercise uses mocked API responses: it does **not** prove a live upload to the production database, cross-computer synchronization or an actual paid Kie generation. No paid generation, production deployment or merge was performed. Authentication and existing image generation tests remain in the passing suite. There is no lint script in this repository.

### Reproduce browser checks

Install axe outside the project:

```sh
npm install --prefix /tmp/ruskicode-qa --no-save axe-core
```

Create an original local test clip (requires ffmpeg, not a project dependency):

```sh
ffmpeg -y -f lavfi -i testsrc2=size=320x180:rate=12 -t 3 -c:v libx264 -pix_fmt yuv420p -movflags +faststart /tmp/ruskicode-reference.mp4
node scripts/cinema-video-qa.mjs /path/to/chromium /tmp/ruskicode-reference.mp4
```

Results and screenshots are written to `docs/cinema-video-qa/`.

## Manual review

1. Open Cinema Studio → Video in the branch preview.
2. Choose **Agregar video**, upload a 2–30 second MP4 below 4 MB, then **Usar**. The dialog names the compatible model.
3. Play the preview, write a prompt mentioning `@video1`, and inspect the model before generating.
4. With **Preguntar antes** active, verify that generating asks for confirmation and includes the video count. Cancel to avoid spending credits.
5. Remove the clip and check the existing text-only/image-reference flow. With a clip attached, switching to an unsupported model must show the compatibility notice and disable Generate.
6. If you choose to run a paid task, check the real result and **Repetir con estos ajustes**; the same video references must return. Download important results before their provider links expire.
