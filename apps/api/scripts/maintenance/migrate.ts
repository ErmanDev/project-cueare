import { getConfig } from '../src/config.ts';
import {
  getMigrationStatus,
  runMigrations,
  verifyMigrations,
} from '../src/db/migration-runner.ts';
import { createPool } from '../src/db/pool.ts';
import type { MigrationStatus } from '../src/db/migrations/types.ts';

function printStatus(statuses: MigrationStatus[]): void {
  console.log('VERSION  STATE               NAME');
  for (const status of statuses) {
    console.log(
      `${String(status.version).padStart(7)}  ${status.state.padEnd(18)}  ${status.name}`,
    );
  }
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'status';
  if (!['status', 'up', 'verify'].includes(command)) {
    throw new Error('Usage: bun scripts/migrate.ts <status|up|verify>');
  }

  const config = getConfig();
  const pool = createPool(
    config.database,
    'ssc',
    config.databasePool,
    config.databaseTls,
  );
  try {
    const statuses =
      command === 'up'
        ? await runMigrations(pool)
        : command === 'verify'
          ? await verifyMigrations(pool)
          : await getMigrationStatus(pool);
    printStatus(statuses);
    if (command === 'verify') console.log('Migration history verified; pending migrations are allowed.');
    if (command === 'up') console.log('Database migrations are current.');
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
