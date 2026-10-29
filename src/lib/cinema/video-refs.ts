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
export const videoRefSchema = z.union([z.string().url().max(2000), uploadedVideoSchema]);
export type VideoRef = z.infer<typeof videoRefSchema>;

/** The limit for one model: its page's, when smaller than the studio's. */
export const videoLimitBytes = (maxMB?: number) => Math.min(MAX_VIDEO_BYTES, maxMB ? Math.floor(maxMB * 1_000_000) : MAX_VIDEO_BYTES);
