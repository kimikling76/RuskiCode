import test from 'node:test';
import assert from 'node:assert/strict';
import {videoModels, imageModels, enabledStatus} from '../src/lib/ai/models';
import {createJob, jobInput, CinemaError} from '../src/lib/cinema/kie-jobs';
import {isMP4, MAX_VIDEO_BYTES} from '../src/lib/cinema/video-reference';

const kling = videoModels.find(m => m.id === 'kling-4-0-reference-to-video')!;
const clip = 'https://tempfile.aiquickdraw.com/clip.mp4';

test('only explicitly verified catalog entries offer video references', () => {
  assert.ok(enabledStatus(kling));
  assert.deepEqual(kling.options.videoReferences, {max: 5, minSeconds: 2, maxSeconds: 30, mention: '@video_{n}'});
  assert.equal(kling.options.fields.videos, 'video_urls');
  assert.ok(imageModels.every(m => !m.options.fields.videos && !m.options.videoReferences));
  assert.ok(videoModels.filter(m => m.id !== kling.id).every(m => !m.options.videoReferences));
});

test('Kling receives image and video references in separate documented fields with whole mentions', () => {
  const input = jobInput(kling, {
    prompt: 'La niña de @image1 camina como en @Video1. No usar @video10.',
    references: ['https://tempfile.aiquickdraw.com/photo.png'], videoReferences: [clip, clip + '?second'],
    aspect: '16:9', resolution: '1080p', duration: '5',
  });
  assert.deepEqual(input.image_urls, ['https://tempfile.aiquickdraw.com/photo.png']);
  assert.deepEqual(input.video_urls, [clip, clip + '?second']);
  assert.equal(input.duration, 5);
  assert.equal(input.prompt, 'La niña de @image_1 camina como en @video_1. No usar video10.\n\nUse @video_2.');
  assert.ok(!Object.hasOwn(jobInput(kling, {prompt: 'Hola', references: []}), 'video_urls'));
});

test('video references are rejected on unsupported models and above the documented count', async () => {
  const other = videoModels.find(m => enabledStatus(m) && !m.options.videoReferences)!;
  let called = false;
  const transport = (async () => { called = true; throw Error('must not send'); }) as typeof fetch;
  for (const [model, videoReferences] of [[other, [clip]], [kling, Array(6).fill(clip)]] as const) {
    await assert.rejects(createJob(model, {prompt: 'Hola', references: [], videoReferences: [...videoReferences]}, transport),
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
  assert.equal(MAX_VIDEO_BYTES, 4_000_000);
});
