import test from 'node:test';
import assert from 'node:assert/strict';
import {videoModels, imageModels, enabledStatus} from '../src/lib/ai/models';
import {createJob, jobInput, CinemaError} from '../src/lib/cinema/kie-jobs';
import {isMP4} from '../src/lib/cinema/video-reference';
import {MAX_VIDEO_BYTES, VIDEO_PART_BYTES, videoRefSchema} from '../src/lib/cinema/video-refs';

// First written for the Kling-only version of reference videos (#33); kept with the catalog fields of the
// version for every model that documents videos (see docs/VIDEOS_DE_REFERENCIA.md).

const kling = videoModels.find(m => m.id === 'kling-4-0-reference-to-video')!;
const clip = 'https://tempfile.aiquickdraw.com/clip.mp4';

test('only catalog entries whose Kie page documents a video field offer video references', () => {
  assert.ok(enabledStatus(kling));
  assert.equal(kling.options.fields.videos, 'video_urls');
  assert.equal(kling.options.maxVideos, 5);
  assert.deepEqual(kling.options.videoSeconds, [2, 30]);
  assert.equal(kling.options.videoMention, '@video_{n}');
  assert.ok(imageModels.every(m => !m.options.fields.videos && !m.options.maxVideos));
  // A video model offers videos exactly when it has the field and a count.
  for (const m of videoModels) assert.equal(Boolean(m.options.fields.videos), Boolean(m.options.maxVideos), m.id);
});

test('Kling receives image and video references in separate documented fields with whole mentions', () => {
  const input = jobInput(kling, {
    prompt: 'La niña de @image1 camina como en @Video1. No usar @video10.',
    references: ['https://tempfile.aiquickdraw.com/photo.png'], videos: [clip, clip + '?second'],
    aspect: '16:9', resolution: '1080p', duration: '5',
  });
  assert.deepEqual(input.image_urls, ['https://tempfile.aiquickdraw.com/photo.png']);
  assert.deepEqual(input.video_urls, [clip, clip + '?second']);
  assert.equal(input.duration, 5);
  assert.equal(input.prompt, 'La niña de @image_1 camina como en @video_1. No usar video10.\n\nUse @video_2.');
  assert.ok(!Object.hasOwn(jobInput(kling, {prompt: 'Hola', references: []}), 'video_urls'));
});

test('video references are rejected on unsupported models and above the documented count', async () => {
  const other = videoModels.find(m => enabledStatus(m) && !m.options.fields.videos)!;
  let called = false;
  const transport = (async () => { called = true; throw Error('must not send'); }) as typeof fetch;
  for (const [model, videos] of [[other, [clip]], [kling, Array(6).fill(clip)]] as const) {
    await assert.rejects(createJob(model, {prompt: 'Hola', references: [], videos: [...videos]}, transport),
      (error: unknown) => error instanceof CinemaError && error.code === 'INVALID_PARAMETERS');
  }
  assert.equal(called, false);
});

test('MP4 uploads require a valid bounded ftyp box and an MP4-compatible brand', () => {
  const ftyp = new Uint8Array(24);
  new DataView(ftyp.buffer).setUint32(0, 24);
  ftyp.set(new TextEncoder().encode('ftypisom'), 4);
  ftyp.set(new TextEncoder().encode('mp42avc1'), 16);
  assert.equal(isMP4(ftyp), true);
  assert.equal(isMP4(new TextEncoder().encode('<html>not a video</html>')), false);
  assert.equal(isMP4(ftyp.subarray(0, 20)), false);
  ftyp.set(new TextEncoder().encode('avif'), 8);
  ftyp.set(new TextEncoder().encode('avifavif'), 16);
  assert.equal(isMP4(ftyp), false);
  // Videos travel in parts under the studio's 4 MB per request; the whole file may be up to 50 MB.
  assert.ok(VIDEO_PART_BYTES < 4_000_000);
  assert.equal(MAX_VIDEO_BYTES, 50_000_000);
  // A video the first version stored whole in the studio is still accepted.
  assert.ok(videoRefSchema.safeParse('asset:' + 'a'.repeat(64)).success);
});
