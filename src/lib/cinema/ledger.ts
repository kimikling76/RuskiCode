import {database} from '@/lib/pipeline/database';
import {notReady} from '@/lib/sync/server';
import {ensureSyncTables} from '@/lib/sync/schema';

// Each paid generation request carries a client request id. Retrying the same id never creates new tasks:
// if they were created, the same task ids come back; if the first attempt is still unclear, it is refused.

export type LedgerState =
  | {state: 'new'}
  | {state: 'created'; taskIds: string[]}
  | {state: 'pending'}
  | {state: 'unavailable'};

type Row = {status: string; taskIds: unknown};

/**
 * Reserves the request id. A missing table is created first (see sync/schema); 'unavailable' means it still cannot be
 * used, and the caller falls back to the old one-shot limit.
 */
export async function beginRequest(userId: string, requestId: string, model: string, retried = false): Promise<LedgerState> {
  try {
    const inserted = await database().$queryRaw<{requestId: string}[]>`
      INSERT INTO "generation_request" ("requestId", "userId", "model", "status", "createdAt", "updatedAt")
      VALUES (${requestId}, ${userId}, ${model}, 'pending', now(), now())
      ON CONFLICT ("requestId") DO NOTHING
      RETURNING "requestId"`;
    if (inserted.length) return {state: 'new'};
    const rows = await database().$queryRaw<Row[]>`
      SELECT "status", "taskIds" FROM "generation_request" WHERE "requestId" = ${requestId} AND "userId" = ${userId}`;
    const row = rows[0];
    if (!row) return {state: 'pending'};
    const taskIds = Array.isArray(row.taskIds) ? row.taskIds.filter((t): t is string => typeof t === 'string') : [];
    if (row.status === 'created' && taskIds.length) return {state: 'created', taskIds};
    if (row.status === 'failed') {
      // The earlier attempt was refused by Kie before creating anything: trying again is safe.
      await database().$executeRaw`UPDATE "generation_request" SET "status" = 'pending', "error" = NULL, "updatedAt" = now() WHERE "requestId" = ${requestId}`;
      return {state: 'new'};
    }
    return {state: 'pending'};
  } catch (e) {
    if (!retried && notReady(e) && await ensureSyncTables()) return beginRequest(userId, requestId, model, true);
    return {state: 'unavailable'};
  }
}

/** Saves progress after each task so a crash midway still remembers what was paid for. */
export async function recordRequest(requestId: string, status: 'pending' | 'created' | 'failed' | 'uncertain', taskIds: string[], error?: string) {
  try {
    await database().$executeRaw`
      UPDATE "generation_request" SET "status" = ${status}, "taskIds" = ${JSON.stringify(taskIds)}::jsonb, "error" = ${error ?? null}, "updatedAt" = now()
      WHERE "requestId" = ${requestId}`;
  } catch {}
}
