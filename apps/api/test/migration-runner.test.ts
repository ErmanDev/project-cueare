import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { Pool } from 'pg';

import {
  assertMigrationsCurrent,
  getMigrationStatus,
  runMigrations,
  verifyMigrations,
} from '../src/db/migration-runner.ts';
import { currentSchemaBaseline } from '../src/db/migrations/0001-current-schema-baseline.ts';
import { databaseMigrations } from '../src/db/migrations/manifest.ts';
import type { DatabaseMigration } from '../src/db/migrations/types.ts';
import { closeTestDatabase, openTestDatabase } from './support/database.ts';

const schema = 'migration_runner_test';
const concurrentSchema = 'migration_runner_concurrent_test';

describe('versioned database migrations', () => {
  let pool: Pool | null = null;

  beforeAll(async () => {
    pool = await openTestDatabase(schema);
  });

  afterAll(async () => {
    if (pool) await pool.query(`DROP SCHEMA IF EXISTS ${concurrentSchema} CASCADE`);
    await closeTestDatabase(pool ?? undefined, schema);
  });

  it('records the baseline and is idempotent on repeated execution', async () => {
    if (!pool) return;
    const initial = await getMigrationStatus(pool, schema);
    expect(initial.map(({ version, state }) => ({ version, state }))).toEqual([
      { version: 1, state: 'applied' },
      { version: 2, state: 'applied' },
    ]);

    const repeated = await runMigrations(pool, schema);
    expect(repeated[0]?.state).toBe('applied');
    const rows = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM ${schema}."SchemaMigrations"`,
    );
    expect(rows.rows[0]?.count).toBe(databaseMigrations.length);
  });

  it('serializes concurrent runners with one recorded application', async () => {
    if (!pool) return;
    await pool.query(`DROP SCHEMA IF EXISTS ${concurrentSchema} CASCADE`);
    await expect(assertMigrationsCurrent(pool, concurrentSchema)).rejects.toThrow(
      'Run "bun run migrate:up" before starting the API.',
    );
    const [first, second] = await Promise.all([
      runMigrations(pool, concurrentSchema),
      runMigrations(pool, concurrentSchema),
    ]);
    expect(first[0]?.state).toBe('applied');
    expect(second[0]?.state).toBe('applied');
    const rows = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM ${concurrentSchema}."SchemaMigrations"
       WHERE "migrationVersion" = 1`,
    );
    expect(rows.rows[0]?.count).toBe(1);
  });

  it('detects an altered applied migration checksum', async () => {
    if (!pool) return;
    const altered: DatabaseMigration = {
      ...currentSchemaBaseline,
      checksumMaterial: 'simulated post-application edit',
    };
    await expect(verifyMigrations(pool, schema, [altered, ...databaseMigrations.slice(1)])).rejects.toThrow(
      'checksum_mismatch',
    );
  });

  it('rolls back a failed migration without recording it', async () => {
    if (!pool) return;
    const failing: DatabaseMigration = {
      version: 3,
      name: 'forced_failure',
      sourceUrls: [import.meta.url],
      async up(db) {
        await db.query('CREATE TABLE "MigrationFailureMarker" ("id" INTEGER)');
        throw new Error('intentional migration failure');
      },
    };

    await expect(runMigrations(pool, schema, [...databaseMigrations, failing])).rejects.toThrow(
      'intentional migration failure',
    );
    const marker = await pool.query<{ relation: string | null }>(
      'SELECT to_regclass($1)::text AS relation',
      [`${schema}."MigrationFailureMarker"`],
    );
    const recorded = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM ${schema}."SchemaMigrations"
       WHERE "migrationVersion" = 3`,
    );
    expect(marker.rows[0]?.relation).toBeNull();
    expect(recorded.rows[0]?.count).toBe(0);
  });
});
