import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {syncSchema} from '../src/lib/sync/schema';

const normal = (sql: string) => sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim();

test('the tables the server creates are exactly those of the stage 5 migration, and only add', () => {
  const migration = readFileSync(new URL('../prisma/migrations/202610170001_sync/migration.sql', import.meta.url), 'utf8');
  const statements = normal(migration).split(';').map(s => s.trim()).filter(Boolean);
  assert.deepEqual(syncSchema.map(normal), statements);
  for (const s of syncSchema) assert.match(s, /^CREATE (SEQUENCE|TABLE|INDEX) IF NOT EXISTS /);
});
