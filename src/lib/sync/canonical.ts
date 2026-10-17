/**
 * The same JSON text for the same data, whatever the key order. The database (jsonb) reorders keys,
 * so change detection compares this form, never raw JSON.stringify output.
 */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(v => v === undefined || typeof v === 'function' ? 'null' : canonical(v)).join(',') + ']';
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).filter(k => record[k] !== undefined && typeof record[k] !== 'function').sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonical(record[k])).join(',') + '}';
}

/** A short fingerprint of a string (cyrb53). Used to notice changes, not for security. */
export function fingerprint(text: string) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0') + text.length.toString(36);
}

export const tokenOf = (value: unknown) => fingerprint(canonical(value));
