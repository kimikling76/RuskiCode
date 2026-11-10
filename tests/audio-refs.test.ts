import test from 'node:test';
import assert from 'node:assert/strict';
import {findModel, videoModels, enabledStatus} from '../src/lib/ai/models';
import {jobInput} from '../src/lib/cinema/kie-jobs';
import {mentionPrompt} from '../src/lib/cinema/mentions';
import {audioProblem, audioRules, uploadedAudioSchema, AUDIO_PART_BYTES} from '../src/lib/cinema/audio-refs';
import type {VideoModel} from '../src/lib/ai/models';

// Reference audio: music, a voice, or what the person in the image says, for the video models whose page takes it.

const model = (id: string) => { const m = findModel(id); assert.ok(m && m.category === 'video', id); return m as VideoModel; };
const a = (n: number) => 'https://tempfile.redpandaai.co/kieai/ruskicode/chat/' + n + '.mp3';

test('the catalog reads each model\'s audio field and its rules from its page', () => {
  const seedance = model('bytedance-seedance-2').options;
  assert.deepEqual([seedance.fields.audios, seedance.maxAudios, seedance.audioRole, seedance.audioSeconds, seedance.audioTotalSeconds, seedance.audioMaxMB, seedance.audioFormats], ['reference_audio_urls', 3, 'reference', [2, 15], 15, 15, ['mp3', 'wav']]);
  assert.equal(model('minimax-h3-reference-to-video').options.audioNeedsMedia, true);
  assert.equal(model('wan-3-0-video').options.audioMention, 'Audio{n}');
  const r2v = model('wan-2-7-r2v').options;
  assert.deepEqual([r2v.fields.audios, r2v.fields.audiosSingle, r2v.audioRole, r2v.audioSeconds], ['reference_voice', true, 'voice', [1, 10]]);
  // The avatars needed an audio the studio could not give: now they can be used, always with an image and an audio.
  for (const id of ['omnihuman-1-5', 'infinitalk-from-audio', 'kling-ai-avatar-pro', 'kling-ai-avatar-standard']) {
    const m = model(id);
    assert.ok(enabledStatus(m), id);
    assert.equal(m.options.audiosRequired, true, id);
    assert.equal(m.options.audioRole, 'driving', id);
    assert.deepEqual(m.options.modes, ['edit'], id + ' needs its image');
  }
  // Every model that takes audio names the field and how many.
  for (const m of videoModels) if (m.options.fields.audios) assert.ok((m.options.maxAudios || 0) >= 1, m.id);
});

test('the audio goes in the model\'s own field, as a list or one link, and the prompt names it', () => {
  const seedance = model('bytedance-seedance-2');
  assert.deepEqual(jobInput(seedance, {prompt: 'Baila con @audio1', duration: '5', aspect: '16:9', resolution: '480p', references: [], audios: [a(1), a(2)]}).reference_audio_urls, [a(1), a(2)]);
  assert.match(String(jobInput(seedance, {prompt: 'Baila con @audio1', duration: '5', references: [], audios: [a(1)]}).prompt), /^Baila con audio 1/);
  const wan = model('wan-3-0-video');
  assert.match(String(jobInput(wan, {prompt: 'Canta como @audio2 y @audio1', references: [], audios: [a(1), a(2)]}).prompt), /^Canta como Audio2 y Audio1/);
  const r2v = model('wan-2-7-r2v');
  assert.equal(jobInput(r2v, {prompt: 'Habla', references: [], audios: [a(1)]}).reference_voice, a(1));
  const avatar = model('kling-ai-avatar-pro');
  const input = jobInput(avatar, {prompt: 'Saluda', references: ['https://tempfile.aiquickdraw.com/face.png'], audios: [a(1)]});
  assert.equal(input.image_url, 'https://tempfile.aiquickdraw.com/face.png');
  assert.equal(input.audio_url, a(1));
  // Never to a model that does not take audio, nor more than it takes.
  assert.throws(() => jobInput(model('kling-4-0-keyframe-to-video'), {prompt: 'x', duration: '5', references: [], audios: [a(1)]}), /INVALID_PARAMETERS/);
  assert.throws(() => jobInput(r2v, {prompt: 'x', references: [], audios: [a(1), a(2)]}), /INVALID_PARAMETERS/);
  assert.equal(mentionPrompt('Con @audio3', {}, 0, 0, false, 2), 'Con @audio3', 'an audio not sent stays as written');
});

test('the rules of each page are checked before anything is sent, in plain words', () => {
  const o = model('bytedance-seedance-2').options;
  const mp3 = (seconds: number, size = 1_000_000) => ({mime: 'audio/mpeg' as const, size, seconds, name: 'voz.mp3'});
  assert.equal(audioProblem(o, [mp3(5), mp3(8)]), '');
  assert.match(audioProblem(o, [mp3(1)]), /dura 1 s: este modelo acepta de 2 a 15 segundos/);
  assert.match(audioProblem(o, [mp3(9), mp3(9)]), /suman 18 s: este modelo acepta hasta 15 s entre todos/);
  assert.match(audioProblem(o, [mp3(5, 20_000_000)]), /pesa 20 MB: este modelo acepta hasta 15 MB/);
  assert.match(audioProblem(o, [{mime: 'audio/ogg', size: 1000, seconds: 5, name: 'x.ogg'}]), /es OGG: este modelo acepta MP3, WAV/);
  assert.match(audioProblem(o, [mp3(3), mp3(3), mp3(3), mp3(3)]), /hasta 3 audios/);
  assert.equal(audioRules(o), 'MP3, WAV · hasta 15 MB · de 2 a 15 s cada uno · hasta 15 s entre todos.');
  assert.ok(uploadedAudioSchema.safeParse({sha: 'a'.repeat(64), mime: 'audio/mpeg', size: AUDIO_PART_BYTES + 1, parts: ['b'.repeat(64), 'c'.repeat(64)]}).success);
  assert.ok(!uploadedAudioSchema.safeParse({sha: 'a'.repeat(64), mime: 'audio/flac', size: 10, parts: ['b'.repeat(64)]}).success);
});
