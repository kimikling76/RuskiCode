import {z} from 'zod';
import {database} from '@/lib/pipeline/database';
import {syncKinds} from './kinds';
import {ensureSyncTables} from './schema';

/** Biggest record accepted (serialized JSON). Book images travel separately as assets. */
export const MAX_ITEM_CHARS = 2_000_000;
/** Pull answers stop adding records past this size so they stay under the platform's response limit. */
const MAX_PULL_CHARS = 3_000_000;

export class SyncError extends Error {
  constructor(public code: string) { super(code); }
}

const keySchema = z.string().min(1).max(200).regex(/^[A-Za-z0-9:_.\-]+$/);

export const changeSchema = z.object({
  kind: z.enum(syncKinds),
  key: keySchema,
  base: z.number().int().min(0),
  deleted: z.boolean().optional(),
  data: z.unknown().optional(),
}).strict().refine(c => c.deleted ? c.data === undefined : c.data !== undefined && c.data !== null);

export const pushSchema = z.object({
  device: z.string().min(1).max(80),
  changes: z.array(changeSchema).min(1).max(100),
}).strict();

export type RemoteItem = {kind: string; key: string; data: unknown; deleted: boolean; version: number; seq: string; updatedAt: string; device: string | null};
export type PushResult =
  | {kind: string; key: string; status: 'ok'; version: number; seq: string}
  | {kind: string; key: string; status: 'conflict'; current: RemoteItem};

type Row = {kind: string; key: string; data: unknown; deleted: boolean; version: number; seq: bigint; updatedAt: Date; device: string | null};

function toItem(row: Row): RemoteItem {
  return {kind: row.kind, key: row.key, data: row.data, deleted: row.deleted, version: row.version, seq: row.seq.toString(), updatedAt: row.updatedAt.toISOString(), device: row.device};
}

/** Postgres answers 42P01 when the sync tables were not created yet (migration not applied). */
export function notReady(error: unknown) {
  const text = String((error as {message?: string})?.message || error) + JSON.stringify((error as {meta?: unknown})?.meta || '');
  return text.includes('42P01') || /relation "?(sync_item|sync_asset|generation_request)"? does not exist/.test(text);
}

const asSyncError = (e: unknown) => e instanceof SyncError ? e : new SyncError(notReady(e) ? 'SYNC_NOT_READY' : 'SYNC_UNAVAILABLE');

/** A missing table is created (see ./schema) and the operation tried once more: nothing was written the first time. */
async function run<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (e) {
    if (!(e instanceof SyncError) && notReady(e) && await ensureSyncTables()) {
      try { return await fn(); } catch (again) { throw asSyncError(again); }
    }
    throw asSyncError(e);
  }
}

/** Every record changed after `since`, oldest first, in pages that stay under the response size limit. */
export function pull(userId: string, since: bigint) {
  return run(async () => {
    const rows = await database().$queryRaw<Row[]>`
      SELECT "kind", "key", "data", "deleted", "version", "seq", "updatedAt", "device"
      FROM "sync_item" WHERE "userId" = ${userId} AND "seq" > ${since}
      ORDER BY "seq" ASC LIMIT 200`;
    const items: RemoteItem[] = [];
    let size = 0;
    for (const row of rows) {
      const item = toItem(row);
      size += JSON.stringify(item.data ?? null).length;
      if (items.length && size > MAX_PULL_CHARS) break;
      items.push(item);
    }
    const cursor = items.length ? items[items.length - 1].seq : since.toString();
    return {items, cursor, more: items.length < rows.length || rows.length === 200};
  });
}

async function current(userId: string, kind: string, key: string) {
  const rows = await database().$queryRaw<Row[]>`
    SELECT "kind", "key", "data", "deleted", "version", "seq", "updatedAt", "device"
    FROM "sync_item" WHERE "userId" = ${userId} AND "kind" = ${kind} AND "key" = ${key}`;
  return rows[0] ? toItem(rows[0]) : null;
}

/**
 * Writes each change only if the computer saw the latest version (`base`).
 * A stale write is never applied: the answer carries the newer record so the computer can keep both.
 */
export function push(userId: string, device: string, changes: z.infer<typeof changeSchema>[]) {
  return run(async () => {
    const results: PushResult[] = [];
    for (const change of changes) {
      const deleted = Boolean(change.deleted);
      const json = deleted ? null : JSON.stringify(change.data);
      if (json && json.length > MAX_ITEM_CHARS) throw new SyncError('ITEM_TOO_LARGE');
      let written: {version: number; seq: bigint}[];
      if (change.base === 0) {
        written = await database().$queryRaw`
          INSERT INTO "sync_item" ("userId", "kind", "key", "data", "deleted", "version", "seq", "device", "createdAt", "updatedAt")
          VALUES (${userId}, ${change.kind}, ${change.key}, ${json}::jsonb, ${deleted}, 1, nextval('sync_seq'), ${device}, now(), now())
          ON CONFLICT ("userId", "kind", "key") DO NOTHING
          RETURNING "version", "seq"`;
      } else {
        written = await database().$queryRaw`
          UPDATE "sync_item" SET "data" = ${json}::jsonb, "deleted" = ${deleted}, "version" = "version" + 1,
            "seq" = nextval('sync_seq'), "device" = ${device}, "updatedAt" = now()
          WHERE "userId" = ${userId} AND "kind" = ${change.kind} AND "key" = ${change.key} AND "version" = ${change.base}
          RETURNING "version", "seq"`;
        if (!written.length && !(await current(userId, change.kind, change.key))) {
          // The server no longer has it (for example, a fresh database): the computer's copy is the only one.
          written = await database().$queryRaw`
            INSERT INTO "sync_item" ("userId", "kind", "key", "data", "deleted", "version", "seq", "device", "createdAt", "updatedAt")
            VALUES (${userId}, ${change.kind}, ${change.key}, ${json}::jsonb, ${deleted}, ${change.base + 1}, nextval('sync_seq'), ${device}, now(), now())
            ON CONFLICT ("userId", "kind", "key") DO NOTHING
            RETURNING "version", "seq"`;
        }
      }
      if (written.length) {
        results.push({kind: change.kind, key: change.key, status: 'ok', version: written[0].version, seq: written[0].seq.toString()});
      } else {
        const now = await current(userId, change.kind, change.key);
        if (!now) throw new SyncError('SYNC_UNAVAILABLE');
        results.push({kind: change.kind, key: change.key, status: 'conflict', current: now});
      }
    }
    return results;
  });
}

// text/plain: the text of a document attached in the Chat, read in the browser.
// application/octet-stream: an image of a manual unit exactly as its PDF stored it (still encoded); it is only
// ever read back by the editor, never shown by the browser on its own.
export const assetMimes = ['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'application/pdf', 'text/plain', 'application/octet-stream'] as const;
export const MAX_ASSET_BYTES = 4_000_000;

export function putAsset(userId: string, hash: string, mime: string, bytes: Uint8Array) {
  return run(async () => {
    await database().$executeRaw`
      INSERT INTO "sync_asset" ("userId", "hash", "mime", "size", "data", "createdAt")
      VALUES (${userId}, ${hash}, ${mime}, ${bytes.length}, ${Buffer.from(bytes)}, now())
      ON CONFLICT ("userId", "hash") DO NOTHING`;
  });
}

export function getAsset(userId: string, hash: string) {
  return run(async () => {
    const rows = await database().$queryRaw<{mime: string; data: Uint8Array}[]>`
      SELECT "mime", "data" FROM "sync_asset" WHERE "userId" = ${userId} AND "hash" = ${hash}`;
    return rows[0] || null;
  });
}

/** Removes files of this person (the parts of a reference video, once Kie has the video). */
export function deleteAssets(userId: string, hashes: string[]) {
  return run(async () => {
    if (!hashes.length) return;
    await database().$executeRaw`DELETE FROM "sync_asset" WHERE "userId" = ${userId} AND "hash" = ANY(${hashes})`;
  });
}

export function missingAssets(userId: string, hashes: string[]) {
  return run(async () => {
    if (!hashes.length) return [];
    const rows = await database().$queryRaw<{hash: string}[]>`
      SELECT "hash" FROM "sync_asset" WHERE "userId" = ${userId} AND "hash" = ANY(${hashes})`;
    const have = new Set(rows.map(r => r.hash));
    return hashes.filter(h => !have.has(h));
  });
}
