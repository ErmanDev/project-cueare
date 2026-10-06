import type { Pool } from 'pg';

import { getConfig } from '../../src/config.ts';
import { runMigrations } from '../../src/db/migration-runner.ts';
import { createPool } from '../../src/db/pool.ts';

function requiredInThisEnvironment(): boolean {
  return process.env.TEST_DATABASE_REQUIRED === 'true' || process.env.CI === 'true';
}

function assertSchemaName(schema: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
    throw new Error(`Invalid test schema name: ${schema}`);
  }
}

/**
 * Creates a clean test schema. Only connection failures may be skipped locally;
 * a reachable database with a broken schema bootstrap always fails the suite.
 */
export async function openTestDatabase(schema: string): Promise<Pool | null> {
  assertSchemaName(schema);
  const pool = createPool(getConfig().database, schema);
  try {
    await pool.query('SELECT 1');
  } catch (cause) {
    await pool.end().catch(() => undefined);
    if (requiredInThisEnvironment()) {
      throw new Error('PostgreSQL is required for integration tests but is unavailable.', {
        cause,
      });
    }
    console.warn(`PostgreSQL unavailable; skipping integration schema "${schema}".`);
    return null;
  }

  try {
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await runMigrations(pool, schema);
    return pool;
  } catch (error) {
    await pool.end().catch(() => undefined);
    throw error;
  }
}

export async function closeTestDatabase(pool: Pool | undefined, schema: string): Promise<void> {
  if (!pool) return;
  assertSchemaName(schema);
  try {
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  } finally {
    await pool.end();
  }
}
