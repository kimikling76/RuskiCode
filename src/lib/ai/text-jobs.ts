import {database} from '@/lib/pipeline/database';
import type {Source} from './types';

// Text requests that run on the server (see /api/text-jobs). The answer is saved as it arrives, so the person can
// close the tab, lose the connection or open the chat on another computer and still get what Kie charged for.

/** The same statements as prisma/migrations/202611070001_text_jobs (tests keep them equal); they only add. */
export const textJobSchema = [
  `CREATE TABLE IF NOT EXISTS "text_job" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "credits" DOUBLE PRECISION,
    "sources" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "text_job_pkey" PRIMARY KEY ("id")
)`,
  `CREATE INDEX IF NOT EXISTS "text_job_userId_createdAt_idx" ON "text_job"("userId", "createdAt")`,
];

/** `running` while the model writes; `cut` when it stopped before the end (time limit, provider), with what arrived. */
export type TextJobStatus = 'running' | 'done' | 'cut' | 'error';
export type TextJob = {id: string; status: TextJobStatus; text: string; model: string; credits: number | null; sources: Source[] | null; error: string | null};

/** A job still «running» this long after it started was stopped by the platform (its time limit is 300 s). */
export const JOB_LIFETIME_MS = 320_000;

let ready: Promise<boolean> | null = null;
let failedAt = 0;
const missing = (e: unknown) => /42P01|relation "?text_job"? does not exist/.test(String((e as {message?: string})?.message || e) + JSON.stringify((e as {meta?: unknown})?.meta || ''));

/** Creates the table the first time it is needed (the production database gets no migrations on deploy). */
export function ensureTextJobs(): Promise<boolean> {
  if (!ready && Date.now() - failedAt < 60_000) return Promise.resolve(false);
  ready ??= (async () => {
    try {
      await database().$transaction(async tx => {
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(4747002)');
        for (const s of textJobSchema) await tx.$executeRawUnsafe(s);
      });
      return true;
    } catch (e) {
      console.error('[text-jobs] could not create the table', e);
      ready = null; failedAt = Date.now();
      return false;
    }
  })();
  return ready;
}

async function withTable<T>(run: () => Promise<T>): Promise<T> {
  try { return await run(); } catch (e) {
    if (missing(e) && await ensureTextJobs()) return run();
    throw e;
  }
}

/** Starts a job; false when one with that id already exists (a retry or a second tab: nothing is sent twice). */
export async function createJob(id: string, userId: string, purpose: string, model: string) {
  return withTable(async () => {
    const rows = await database().$queryRaw<{id: string}[]>`
      INSERT INTO "text_job" ("id", "userId", "purpose", "model", "status", "createdAt", "updatedAt")
      VALUES (${id}, ${userId}, ${purpose}, ${model}, 'running', now(), now())
      ON CONFLICT ("id") DO NOTHING RETURNING "id"`;
    // A week is enough to come back to a card; older answers are already in the chat.
    await database().$executeRaw`DELETE FROM "text_job" WHERE "userId" = ${userId} AND "createdAt" < now() - interval '7 days'`.catch(() => {});
    return rows.length > 0;
  });
}

export async function saveProgress(id: string, text: string) {
  await database().$executeRaw`UPDATE "text_job" SET "text" = ${text}, "updatedAt" = now() WHERE "id" = ${id} AND "status" = 'running'`;
}

export async function finishJob(id: string, status: Exclude<TextJobStatus, 'running'>, fields: {text: string; credits?: number; sources?: Source[]; error?: string}) {
  await database().$executeRaw`
    UPDATE "text_job" SET "status" = ${status}, "text" = ${fields.text}, "credits" = ${fields.credits ?? null},
      "sources" = ${fields.sources?.length ? JSON.stringify(fields.sources) : null}::jsonb, "error" = ${fields.error ?? null}, "updatedAt" = now()
    WHERE "id" = ${id}`;
}

type Row = {id: string; status: string; text: string; model: string; credits: number | null; sources: unknown; error: string | null; createdAt: Date};

/** The person's own job; a job left «running» past the platform's limit is reported as cut, with what was saved. */
export async function readJob(id: string, userId: string, now = Date.now()): Promise<TextJob | null> {
  const rows = await withTable(() => database().$queryRaw<Row[]>`
    SELECT "id", "status", "text", "model", "credits", "sources", "error", "createdAt" FROM "text_job" WHERE "id" = ${id} AND "userId" = ${userId}`);
  const r = rows[0];
  if (!r) return null;
  const stale = r.status === 'running' && now - new Date(r.createdAt).getTime() > JOB_LIFETIME_MS;
  return {
    id: r.id, model: r.model, text: r.text, credits: r.credits,
    status: stale ? (r.text.trim() ? 'cut' : 'error') : r.status as TextJobStatus,
    sources: Array.isArray(r.sources) ? r.sources as Source[] : null,
    error: stale ? 'STREAM_INTERRUPTED' : r.error,
  };
}
