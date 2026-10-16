'use client';
// Images in the editable book are data URLs (the composer never fetches remote files).
// Large photos are scaled down here instead of being rejected.

const MAX_SIDE = 1800;
const MAX_CHARS = 3_900_000; // the project schema allows 4,000,000 characters per image

async function bitmapFrom(blob: Blob) {
  if (!/^image\/(png|jpeg|webp)$/.test(blob.type)) throw Error('IMAGE_TYPE');
  return createImageBitmap(blob);
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bitmap = await bitmapFrom(blob);
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw Error('IMAGE_CANVAS');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    // PNG keeps line art and transparency; fall back to JPEG when it is too heavy.
    let data = canvas.toDataURL('image/png');
    for (const quality of [0.9, 0.82, 0.72]) {
      if (data.length <= MAX_CHARS) break;
      data = canvas.toDataURL('image/jpeg', quality);
    }
    if (data.length > MAX_CHARS) throw Error('IMAGE_TOO_LARGE');
    return data;
  } finally {
    bitmap.close();
  }
}

/** A Kie-hosted image from the Cinema gallery, fetched through the same authenticated proxy as downloads. */
export async function remoteToDataUrl(url: string) {
  const r = await fetch('/api/cinema/download?url=' + encodeURIComponent(url) + '&name=libro');
  if (!r.ok) throw Error('IMAGE_DOWNLOAD');
  return blobToDataUrl(await r.blob());
}
