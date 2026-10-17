-- Stage 5: sync between computers and protection against duplicate paid generations.
-- Additive only: creates one sequence and three tables. Does not change or delete existing data.

CREATE SEQUENCE IF NOT EXISTS "sync_seq";

CREATE TABLE IF NOT EXISTS "sync_item" (
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
);
CREATE INDEX IF NOT EXISTS "sync_item_userId_seq_idx" ON "sync_item"("userId", "seq");

CREATE TABLE IF NOT EXISTS "sync_asset" (
    "userId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sync_asset_pkey" PRIMARY KEY ("userId", "hash")
);

CREATE TABLE IF NOT EXISTS "generation_request" (
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "taskIds" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "generation_request_pkey" PRIMARY KEY ("requestId")
);
CREATE INDEX IF NOT EXISTS "generation_request_userId_createdAt_idx" ON "generation_request"("userId", "createdAt");
