'use client';
// Book images travel as separate files, stored once per content hash.
// Inside a synced book an image is written as `sync-asset:<sha256>:<mime>`.

const PREFIX = 'sync-asset:';
const decoded = new Map<string, string>();

function bytesOf(dataUrl: string) {
  const comma = dataUrl.indexOf(',');
  const mime = dataUrl.slice(5, dataUrl.indexOf(';'));
  const raw = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return {bytes, mime};
}

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function failIfBad(r: Response) {
  if (r.ok) return;
  const body = await r.json().catch(() => ({}));
  throw Error(typeof body.error === 'string' ? body.error : 'SYNC_UNAVAILABLE');
}

/** Uploads the images the server does not have yet and returns the asset map with references instead of data. */
export async function encodeAssets(assets: Record<string, string>) {
  const out: Record<string, string> = {};
  const pending: {name: string; hash: string; bytes: Uint8Array; mime: string}[] = [];
  for (const [name, value] of Object.entries(assets)) {
    if (!value.startsWith('data:')) { out[name] = value; continue; }
    const {bytes, mime} = bytesOf(value);
    const hash = await sha256(bytes);
    decoded.set(hash, value);
    out[name] = PREFIX + hash + ':' + mime;
    pending.push({name, hash, bytes, mime});
  }
  for (let i = 0; i < pending.length; i += 50) {
    const chunk = pending.slice(i, i + 50);
    const r = await fetch('/api/sync/assets?missing=' + chunk.map(p => p.hash).join(','), {cache: 'no-store'});
    await failIfBad(r);
    const {missing} = await r.json() as {missing: string[]};
    for (const item of chunk.filter(p => missing.includes(p.hash))) {
      const up = await fetch('/api/sync/assets', {method: 'POST', headers: {'Content-Type': item.mime}, body: item.bytes as BodyInit});
      await failIfBad(up);
      const {hash} = await up.json() as {hash: string};
      if (hash !== item.hash) throw Error('ASSET_MISMATCH');
    }
  }
  return out;
}

function toDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(Error('ASSET_UNAVAILABLE'));
    reader.readAsDataURL(blob);
  });
}

/** Downloads referenced images and returns the asset map with data again, as the editor expects it. */
export async function decodeAssets(assets: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(assets)) {
    if (!value.startsWith(PREFIX)) { out[name] = value; continue; }
    const hash = value.slice(PREFIX.length).split(':')[0];
    let data = decoded.get(hash);
    if (!data) {
      const r = await fetch('/api/sync/assets?hash=' + hash);
      if (!r.ok) throw Error('ASSET_UNAVAILABLE');
      data = await toDataUrl(await r.blob());
      decoded.set(hash, data);
    }
    out[name] = data;
  }
  return out;
}
