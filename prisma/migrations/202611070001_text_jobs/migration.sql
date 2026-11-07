-- Text requests that run on the server, so closing the tab does not lose a paid answer.
-- Additive only: creates one table and one index. Does not change or delete existing data.

CREATE TABLE IF NOT EXISTS "text_job" (
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
);

CREATE INDEX IF NOT EXISTS "text_job_userId_createdAt_idx" ON "text_job"("userId", "createdAt");
