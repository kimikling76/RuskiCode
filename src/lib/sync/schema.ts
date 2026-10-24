import {database} from '@/lib/pipeline/database';

/**
 * The tables of stage 5: sync between computers, the studio's files, and the record of paid generations. These are the
 * same statements as prisma/migrations/202610170001_sync/migration.sql (tests/sync-schema.test.ts keeps them equal), all
 * «IF NOT EXISTS»: they only add what is missing and never change or delete data. The production database never had
 * that migration applied, so the server creates the tables the first time it needs one.
 */
export const syncSchema = [
  `CREATE SEQUENCE IF NOT EXISTS "sync_seq"`,
  `CREATE TABLE IF NOT EXISTS "sync_item" (
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "data" JSONB,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "seq" BIGINT NOT NULL,
    "device" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sync_item_pkey" PRIMARY KEY ("userId", "kind", "key")
)`,
  `CREATE INDEX IF NOT EXISTS "sync_item_userId_seq_idx" ON "sync_item"("userId", "seq")`,
  `CREATE TABLE IF NOT EXISTS "sync_asset" (
    "userId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sync_asset_pkey" PRIMARY KEY ("userId", "hash")
)`,
  `CREATE TABLE IF NOT EXISTS "generation_request" (
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "taskIds" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "generation_request_pkey" PRIMARY KEY ("requestId")
)`,
  `CREATE INDEX IF NOT EXISTS "generation_request_userId_createdAt_idx" ON "generation_request"("userId", "createdAt")`,
];

let ready: Promise<boolean> | null = null;
let failedAt = 0;

/**
 * Creates whatever stage 5 table is missing, once per server instance; true when they all exist now. A failure (for
 * example, a database role that cannot create tables) is retried at most once a minute, not on every request.
 */
export function ensureSyncTables(): Promise<boolean> {
  if (!ready && Date.now() - failedAt < 60_000) return Promise.resolve(false);
  ready ??= (async () => {
    try {
      await database().$transaction(async tx => {
        // One server at a time: two instances starting together do not race on the same CREATE TABLE.
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(4747001)');
        for (const statement of syncSchema) await tx.$executeRawUnsafe(statement);
      });
      console.info('[sync] the stage 5 tables are ready');
      return true;
    } catch (e) {
      console.error('[sync] could not create the stage 5 tables', e);
      ready = null;
      failedAt = Date.now();
      return false;
    }
  })();
  return ready;
}
