import crypto from 'node:crypto';
import fs from 'node:fs/promises';

import type pg from 'pg';

import { getConfig } from '../config.ts';
import type { Queryable } from '../types.ts';
import { databaseMigrations } from './migrations/manifest.ts';
import type {
  DatabaseMigration,
  MigrationStatus,
} from './migrations/types.ts';

type AppliedMigrationRow = {
  migrationVersion: number;
  name: string;
  checksum: string;
  appliedAtUtc: Date;
  executionDurationMs: number;
};

function assertSchemaIdentifier(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return name;
}

function quoteIdentifier(name: string): string {
  return `"${assertSchemaIdentifier(name)}"`;
}

function validateManifest(migrations: readonly DatabaseMigration[]): void {
  let previous = 0;
  const names = new Set<string>();
  for (const migration of migrations) {
    if (!Number.isInteger(migration.version) || migration.version <= previous) {
      throw new Error('Migration versions must be positive integers in ascending order.');
    }
    if (!/^[a-z0-9_]+$/.test(migration.name) || names.has(migration.name)) {
      throw new Error(`Invalid or duplicate migration name: ${migration.name}`);
    }
    if (!migration.sourceUrls.length) {
      throw new Error(`Migration ${migration.version} has no checksum source.`);
    }
    previous = migration.version;
    names.add(migration.name);
  }
}

export async function migrationChecksum(migration: DatabaseMigration): Promise<string> {
  const hash = crypto.createHash('sha256');
  hash.update(`${migration.version}:${migration.name}\n`);
  hash.update(`${migration.checksumMaterial ?? ''}\n`);
  for (const sourceUrl of migration.sourceUrls) {
    const source = (await fs.readFile(new URL(sourceUrl), 'utf8')).replace(/\r\n/g, '\n');
    hash.update(`${sourceUrl.split('/').at(-1)}\n${source}\n`);
  }
  return hash.digest('hex');
}

async function metadataTableExists(client: pg.PoolClient, schema: string): Promise<boolean> {
  const result = await client.query<{ relation: string | null }>(
    'SELECT to_regclass($1)::text AS relation',
    [`${schema}."SchemaMigrations"`],
  );
  return Boolean(result.rows[0]?.relation);
}

async function readAppliedMigrations(
  client: pg.PoolClient,
  schema: string,
): Promise<AppliedMigrationRow[]> {
  if (!(await metadataTableExists(client, schema))) return [];
  const schemaSql = quoteIdentifier(schema);
  const result = await client.query<AppliedMigrationRow>(
    `SELECT
       "migrationVersion",
       "name",
       "checksum",
       "appliedAtUtc",
       "executionDurationMs"
     FROM ${schemaSql}."SchemaMigrations"
     ORDER BY "migrationVersion"`,
  );
  return result.rows;
}

async function statusWithClient(
  client: pg.PoolClient,
  schema: string,
  migrations: readonly DatabaseMigration[],
): Promise<MigrationStatus[]> {
  validateManifest(migrations);
  const applied = await readAppliedMigrations(client, schema);
  const appliedByVersion = new Map(applied.map((row) => [row.migrationVersion, row]));
  const statuses: MigrationStatus[] = [];

  for (const migration of migrations) {
    const checksum = await migrationChecksum(migration);
    const row = appliedByVersion.get(migration.version);
    statuses.push({
      version: migration.version,
      name: migration.name,
      checksum,
      appliedChecksum: row?.checksum ?? null,
      appliedAtUtc: row?.appliedAtUtc ?? null,
      executionDurationMs: row?.executionDurationMs ?? null,
      state: !row
        ? 'pending'
        : row.name === migration.name && row.checksum === checksum
          ? 'applied'
          : 'checksum_mismatch',
    });
    appliedByVersion.delete(migration.version);
  }

  for (const row of appliedByVersion.values()) {
    statuses.push({
      version: row.migrationVersion,
      name: row.name,
      checksum: '',
      appliedChecksum: row.checksum,
      appliedAtUtc: row.appliedAtUtc,
      executionDurationMs: row.executionDurationMs,
      state: 'unknown',
    });
  }
  return statuses.sort((a, b) => a.version - b.version);
}

export async function getMigrationStatus(
  pool: pg.Pool,
  schema = 'ssc',
  migrations: readonly DatabaseMigration[] = databaseMigrations,
): Promise<MigrationStatus[]> {
  assertSchemaIdentifier(schema);
  const client = await pool.connect();
  try {
    return await statusWithClient(client, schema, migrations);
  } finally {
    client.release();
  }
}

function assertNoDrift(statuses: MigrationStatus[]): void {
  const invalid = statuses.filter(
    (status) => status.state === 'checksum_mismatch' || status.state === 'unknown',
  );
  if (invalid.length) {
    throw new Error(
      `Database migration history is incompatible: ${invalid
        .map((status) => `${status.version}:${status.name}=${status.state}`)
        .join(', ')}`,
    );
  }
}

export async function verifyMigrations(
  pool: pg.Pool,
  schema = 'ssc',
  migrations: readonly DatabaseMigration[] = databaseMigrations,
): Promise<MigrationStatus[]> {
  const statuses = await getMigrationStatus(pool, schema, migrations);
  assertNoDrift(statuses);
  return statuses;
}

export async function assertMigrationsCurrent(
  pool: pg.Pool,
  schema = 'ssc',
  migrations: readonly DatabaseMigration[] = databaseMigrations,
): Promise<void> {
  const statuses = await verifyMigrations(pool, schema, migrations);
  const pending = statuses.filter((status) => status.state === 'pending');
  if (pending.length) {
    throw new Error(
      `Database has pending migrations: ${pending
        .map((status) => `${status.version}:${status.name}`)
        .join(', ')}. Run "bun run migrate:up" before starting the API.`,
    );
  }
}

async function ensureMetadataTable(client: pg.PoolClient, schema: string): Promise<void> {
  const schemaSql = quoteIdentifier(schema);
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${schemaSql}`);
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${schemaSql}."SchemaMigrations" (
       "migrationVersion" INTEGER PRIMARY KEY,
       "name" VARCHAR(200) NOT NULL UNIQUE,
       "checksum" CHAR(64) NOT NULL,
       "appliedAtUtc" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
       "executionDurationMs" INTEGER NOT NULL CHECK ("executionDurationMs" >= 0)
     )`,
  );
}

function statementSavepointClient(client: pg.PoolClient): Queryable {
  let sequence = 0;
  return {
    async query(text, values) {
      sequence += 1;
      const savepoint = `migration_statement_${sequence}`;
      await client.query(`SAVEPOINT ${savepoint}`);
      try {
        const result = await client.query(text, values);
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        return result;
      } catch (error) {
        await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        throw error;
      }
    },
  } as Queryable;
}

export async function runMigrations(
  pool: pg.Pool,
  schema = 'ssc',
  migrations: readonly DatabaseMigration[] = databaseMigrations,
): Promise<MigrationStatus[]> {
  validateManifest(migrations);
  assertSchemaIdentifier(schema);
  const client = await pool.connect();
  const lockScope = 'ssc-attendance-schema-migrations';
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1), hashtext($2))', [
      lockScope,
      schema,
    ]);
    await ensureMetadataTable(client, schema);
    const initial = await statusWithClient(client, schema, migrations);
    assertNoDrift(initial);
    const pendingVersions = new Set(
      initial.filter((status) => status.state === 'pending').map((status) => status.version),
    );

    for (const migration of migrations) {
      if (!pendingVersions.has(migration.version)) continue;
      const checksum = await migrationChecksum(migration);
      const startedAt = performance.now();
      await client.query('BEGIN');
      try {
        await client.query(`SET LOCAL search_path TO ${quoteIdentifier(schema)}`);
        await migration.up(
          migration.useStatementSavepoints ? statementSavepointClient(client) : client,
          schema,
        );
        const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
        await client.query(
          `INSERT INTO ${quoteIdentifier(schema)}."SchemaMigrations" (
             "migrationVersion", "name", "checksum", "executionDurationMs"
           ) VALUES ($1, $2, $3, $4)`,
          [migration.version, migration.name, checksum, durationMs],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw new Error(
          `Migration ${migration.version}:${migration.name} failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { cause: error },
        );
      }
    }
    return await statusWithClient(client, schema, migrations);
  } finally {
    await client
      .query('SELECT pg_advisory_unlock(hashtext($1), hashtext($2))', [lockScope, schema])
      .catch(() => undefined);
    client.release();
  }
}

export async function prepareDatabaseForApplication(
  pool: pg.Pool,
  schema = 'ssc',
): Promise<void> {
  if (getConfig().databaseMigrations.autoApply) {
    await runMigrations(pool, schema);
    return;
  }
  await assertMigrationsCurrent(pool, schema);
}
