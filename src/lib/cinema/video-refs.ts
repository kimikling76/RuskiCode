import {z} from 'zod';

// Reference videos. A video from the gallery goes as its Kie link. A video from this computer is too big for one
// request to the studio (Vercel takes about 4 MB per request), so the browser sends it in parts to the person's file
// store; the generation request names the parts, and the server joins them, checks the whole file against its
// SHA-256, gives it to Kie's file upload (a temporary link, 24 h) and deletes the parts.

/** Largest video the studio passes on, whatever a model's page allows: the server holds it whole in memory once. */
export const MAX_VIDEO_BYTES = 50_000_000;
/** Size of each part (the file store takes up to 4 000 000 bytes per file). */
export const VIDEO_PART_BYTES = 3_900_000;
export const videoMimes = ['video/mp4', 'video/quicktime'] as const;

const hash = z.string().regex(/^[a-f0-9]{64}$/);
/** A video from this computer, already sent in parts. */
export const uploadedVideoSchema = z.object({
  sha: hash,
  mime: z.enum(videoMimes),
  size: z.number().int().min(1).max(MAX_VIDEO_BYTES),
  parts: z.array(hash).min(1).max(Math.ceil(MAX_VIDEO_BYTES / VIDEO_PART_BYTES)),
}).strict().refine(v => v.parts.length === Math.ceil(v.size / VIDEO_PART_BYTES), {message: 'parts do not match the size'});
export type UploadedVideo = z.infer<typeof uploadedVideoSchema>;
/** A gallery link, a video sent in parts, or an MP4 stored whole in the studio by the first version (`asset:<sha256>`). */
export const videoRefSchema = z.union([z.string().url().max(2000), z.string().regex(/^asset:[a-f0-9]{64}$/), uploadedVideoSchema]);
export type VideoRef = z.infer<typeof videoRefSchema>;

/** The limit for one model: its page's, when smaller than the studio's. */
export const videoLimitBytes = (maxMB?: number) => Math.min(MAX_VIDEO_BYTES, maxMB ? Math.floor(maxMB * 1_000_000) : MAX_VIDEO_BYTES);

/** The part of a video to use, for models that take clips: from `start` to `ends`, in seconds. */
export const clipSchema = z.object({start: z.number().min(0).max(600), ends: z.number().min(0).max(600)}).strict().refine(c => c.ends > c.start);
export type Clip = z.infer<typeof clipSchema>;

/** What is wrong with a clip for a model ('' when it fits): the end after the start, its length, the video's. */
export function clipProblem(c: Clip, o: {videoClipSeconds?: number; videoSeconds?: readonly [number, number]}, seconds?: number) {
  if (!(c.ends > c.start)) return 'El final tiene que ser después del comienzo.';
  if (o.videoClipSeconds && c.ends - c.start > o.videoClipSeconds + 1e-6) return 'El tramo dura ' + (c.ends - c.start).toLocaleString('es-AR') + ' s: este modelo toma hasta ' + o.videoClipSeconds + ' s.';
  const end = seconds || o.videoSeconds?.[1];
  if (end && c.ends > end + 1e-6) return 'El final pasa el largo del video (' + end.toLocaleString('es-AR') + ' s).';
  return '';
}

/** The clip a video starts with: from the beginning, as long as the model takes (or the video lasts). */
export const defaultClip = (o: {videoClipSeconds?: number}, seconds?: number): Clip => ({start: 0, ends: Math.min(o.videoClipSeconds || 10, seconds || Infinity)});

/** Videos a model can still take: its own count, and with the images, its slots (a Gemini Omni video takes two). */
export const videoRoom = (o: {maxVideos?: number; maxMedia?: number; videoSlots?: number}, images: number) =>
  Math.max(0, Math.min(o.maxVideos || 0, o.maxMedia ? Math.floor((o.maxMedia - images) / (o.videoSlots || 1)) : Infinity));
