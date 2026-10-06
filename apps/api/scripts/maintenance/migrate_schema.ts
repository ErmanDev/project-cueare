// Backward-compatible alias for older deployment automation.
// New automation should call `bun run migrate:up`.
import { getConfig } from '../src/config.ts';
import { runMigrations } from '../src/db/migration-runner.ts';
import { createPool } from '../src/db/pool.ts';

async function main(): Promise<void> {
  console.warn('[deprecated] Use "bun run migrate:up" instead.');
  const config = getConfig();
  const pool = createPool(
    config.database,
    'ssc',
    config.databasePool,
    config.databaseTls,
  );
  try {
    await runMigrations(pool);
    console.log('Database migrations are current.');
  } finally {
    await pool.end();
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
