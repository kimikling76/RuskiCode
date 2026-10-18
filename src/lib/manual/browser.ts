'use client';
import type {ImageData} from './model';
import {putAsset, MAX_ASSET} from './store';

// Pictures added in the editor. A JPEG is kept byte for byte (the PDF carries it as it is); PNG keeps its
// transparency; anything else the browser can open (WebP, AVIF…) becomes PNG. Very large pictures are reduced to
// 3000 px on the long side (more than 450 ppi on a full A4 width).

const MAX_SIDE = 3000;

function jpegSize(bytes: Uint8Array): {width: number; height: number} | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) { i++; continue; }
    const marker = bytes[i + 1];
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    // Start of frame: baseline, extended, progressive (not DHT/DAC/JPG markers).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return {height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8]};
    }
    i += 2 + len;
  }
  return null;
}

/** CMYK JPEGs come out with wrong colours in some viewers: those are re-encoded. */
function jpegComponents(bytes: Uint8Array) {
  for (let i = 2; i + 9 < bytes.length;) {
    if (bytes[i] !== 0xff) { i++; continue; }
    const marker = bytes[i + 1];
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return bytes[i + 9];
    i += 2 + len;
  }
  return 0;
}

async function encode(file: Blob, keepAlpha: boolean): Promise<{bytes: Uint8Array; format: 'png' | 'jpeg'; width: number; height: number}> {
  const bitmap = await createImageBitmap(file).catch(() => { throw Error('IMAGE_TYPE'); });
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw Error('IMAGE_TYPE');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const type = keepAlpha ? 'image/png' : 'image/jpeg';
    let blob = await new Promise<Blob | null>(r => canvas.toBlob(r, type, 0.92));
    if (blob && blob.size > MAX_ASSET && keepAlpha) blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.9));
    if (!blob) throw Error('IMAGE_TYPE');
    if (blob.size > MAX_ASSET) throw Error('IMAGE_TOO_LARGE');
    return {bytes: new Uint8Array(await blob.arrayBuffer()), format: blob.type === 'image/png' ? 'png' : 'jpeg', width: canvas.width, height: canvas.height};
  } finally {
    bitmap.close();
  }
}

export async function imageFromFile(file: File): Promise<ImageData> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const jpeg = jpegSize(bytes);
  if (jpeg && bytes.byteLength <= MAX_ASSET && Math.max(jpeg.width, jpeg.height) <= MAX_SIDE && jpegComponents(bytes) !== 4) {
    return {asset: await putAsset(bytes), format: 'jpeg', ...jpeg};
  }
  const isPng = file.type === 'image/png' || (bytes[0] === 0x89 && bytes[1] === 0x50);
  const out = await encode(file, isPng || file.type === 'image/webp' || file.type === 'image/gif' || file.type === 'image/avif');
  return {asset: await putAsset(out.bytes), format: out.format, width: out.width, height: out.height};
}

export function download(bytes: Uint8Array, name: string, type = 'application/pdf') {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], {type}));
  const a = document.createElement('a');
  a.href = url;
  a.download = name.replace(/[\\/:*?"<>|]+/g, ' ').trim();
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Points ↔ millimetres, for the fields the author reads. */
export const toMm = (pt: number) => Math.round(pt / 72 * 25.4 * 10) / 10;
export const fromMm = (mm: number) => mm / 25.4 * 72;
