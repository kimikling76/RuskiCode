/** Reject mislabeled files before storing/uploading them. MP4 is an ISO-BMFF file with an ftyp box. */
export function isMP4(bytes: Uint8Array) {
  if (bytes.length < 16) return false;
  const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  const text = (a: number, b: number) => String.fromCharCode(...bytes.subarray(a, b));
  if (size < 16 || size > bytes.length || text(4, 8) !== 'ftyp') return false;
  const brands = [text(8, 12)];
  for (let offset = 16; offset + 4 <= size; offset += 4) brands.push(text(offset, offset + 4));
  return brands.some(b => /^(isom|iso[2-9]|mp4[12]|avc1|M4V )$/.test(b));
}
