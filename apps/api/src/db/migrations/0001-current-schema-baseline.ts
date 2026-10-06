import { applyLegacySchemaBootstrap } from '../schema-bootstrap.ts';
import type { DatabaseMigration } from './types.ts';

/**
 * Adoption migration for both fresh databases and databases created by the
 * former startup bootstrap. Its source dependencies are checksummed and must
 * remain immutable; all later schema changes belong in a new migration.
 */
export const currentSchemaBaseline: DatabaseMigration = {
  version: 1,
  name: 'current_schema_baseline',
  sourceUrls: [
    import.meta.url,
    new URL('../schema-bootstrap.ts', import.meta.url).href,
    new URL('../schema.ts', import.meta.url).href,
  ],
  // The former bootstrap intentionally catches duplicate/compatibility DDL
  // errors. Savepoints keep those expected errors from aborting the migration
  // transaction while preserving whole-migration rollback for real failures.
  useStatementSavepoints: true,
  async up(db, schema) {
    await applyLegacySchemaBootstrap(db, schema);
  },
};
