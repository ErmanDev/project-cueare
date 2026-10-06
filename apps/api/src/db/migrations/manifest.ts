import { currentSchemaBaseline } from './0001-current-schema-baseline.ts';
import { eventContributions } from './0002-event-contributions.ts';
import type { DatabaseMigration } from './types.ts';

export const databaseMigrations: readonly DatabaseMigration[] = [
  currentSchemaBaseline,
  eventContributions,
];
