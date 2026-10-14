CREATE TABLE "BookJob" ("id" TEXT PRIMARY KEY, "projectId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'queued', "state" JSONB NOT NULL, "error" TEXT, "revision" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE INDEX "BookJob_projectId_createdAt_idx" ON "BookJob"("projectId", "createdAt");
CREATE TABLE "BookArtifact" ("id" TEXT PRIMARY KEY, "bookId" TEXT NOT NULL REFERENCES "BookJob"("id") ON DELETE CASCADE, "name" TEXT NOT NULL, "mime" TEXT NOT NULL, "data" BYTEA NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX "BookArtifact_bookId_name_key" ON "BookArtifact"("bookId", "name");
