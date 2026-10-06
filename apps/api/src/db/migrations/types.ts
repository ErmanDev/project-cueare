import type { Queryable } from '../../types.ts';

export type DatabaseMigration = {
  version: number;
  name: string;
  sourceUrls: string[];
  checksumMaterial?: string;
  useStatementSavepoints?: boolean;
  up(db: Queryable, schema: string): Promise<void>;
};

export type MigrationState =
  | 'applied'
  | 'pending'
  | 'checksum_mismatch'
  | 'unknown';

export type MigrationStatus = {
  version: number;
  name: string;
  checksum: string;
  appliedChecksum: string | null;
  appliedAtUtc: Date | null;
  executionDurationMs: number | null;
  state: MigrationState;
};
