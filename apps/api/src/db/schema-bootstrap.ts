import type { Queryable } from '../types.ts';
import {
  addMissingAppColumns,
  addMissingConstraints,
  backfillEventRegistrations,
  dropTenantsIfPresent,
  importLegacyData,
  migrateLegacyTables,
  renameSnakeToPascal,
  schemaStatements,
  seedFoundation,
} from './schema.ts';

function assertSchemaIdentifier(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return name;
}

export class SchemaBootstrapError extends Error {
  constructor(
    readonly schema: string,
    readonly stage: string,
    cause: unknown,
  ) {
    super(
      `Schema "${schema}" failed during ${stage}: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
    this.name = 'SchemaBootstrapError';
  }
}

/**
 * Frozen compatibility bootstrap for migration 0001. Future schema evolution
 * belongs in a new numbered migration, not in this function or schema.ts.
 */
export async function applyLegacySchemaBootstrap(
  client: Queryable,
  schema = 'ssc',
): Promise<void> {
  let stage = 'initialization';
  try {
    const schemaName = assertSchemaIdentifier(schema);
    stage = 'create schema';
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
    stage = 'select schema';
    await client.query(`SET search_path TO ${schemaName}`);
    stage = 'migrate legacy tables';
    await migrateLegacyTables(client);
    stage = 'remove legacy tenancy';
    await dropTenantsIfPresent(client);
    stage = 'normalize identifiers';
    await renameSnakeToPascal(client);
    const installed = await client.query<{ relation: string | null }>(
      `SELECT to_regclass('"Users"')::text AS relation`,
    );
    if (installed.rows[0]?.relation) {
      stage = 'upgrade compatibility columns';
      await addMissingAppColumns(client);
    }
    stage = 'create schema objects';
    for (const sql of schemaStatements(schema)) {
      await client.query(sql);
    }
    stage = 'finalize compatibility objects';
    await addMissingAppColumns(client);
    stage = 'restore constraints';
    await addMissingConstraints(client);
    stage = 'seed foundation data';
    await seedFoundation(client);
    stage = 'import legacy data';
    await importLegacyData(client);
    stage = 'backfill event registrations';
    await backfillEventRegistrations(client);
  } catch (error) {
    if (error instanceof SchemaBootstrapError) throw error;
    throw new SchemaBootstrapError(schema, stage, error);
  }
}
