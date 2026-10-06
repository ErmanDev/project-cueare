import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(__dirname, '..');

const DB_CONFIG = {
  host: process.env.DATABASE_HOST || 'localhost',
  port: Number(process.env.DATABASE_PORT) || 5432,
  user: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || '@2020',
};

async function getAdminClient() {
  const client = new pg.Client({
    ...DB_CONFIG,
    database: 'postgres',
  });
  await client.connect();
  return client;
}

async function terminateConnections(client: pg.Client, dbName: string) {
  await client.query(`
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = $1 AND pid != pg_backend_pid()
  `, [dbName]);
}

export async function cloneDatabase(sourceDb: string, targetDb: string) {
  const client = await getAdminClient();
  try {
    console.log(`[Env Sync] Terminating active connections to ${targetDb} & ${sourceDb}...`);
    await terminateConnections(client, targetDb);
    await terminateConnections(client, sourceDb);

    console.log(`[Env Sync] Dropping database ${targetDb} if exists...`);
    await client.query(`DROP DATABASE IF EXISTS "${targetDb}"`);

    console.log(`[Env Sync] Cloning ${sourceDb} -> ${targetDb}...`);
    await client.query(`CREATE DATABASE "${targetDb}" WITH TEMPLATE "${sourceDb}"`);

    console.log(`[Env Sync] Successfully created ${targetDb} from ${sourceDb}.`);
  } finally {
    await client.end();
  }
}

export async function getEnvironmentStatus() {
  const adminClient = await getAdminClient();
  try {
    const dbsRes = await adminClient.query(`
      SELECT datname as name, pg_size_pretty(pg_database_size(datname)) as size
      FROM pg_database
      WHERE datname IN ('ssc', 'ssc_dev', 'ssc_staging', 'ssc_backup')
      ORDER BY datname
    `);

    const rows = [];
    for (const row of dbsRes.rows) {
      const dbClient = new pg.Client({ ...DB_CONFIG, database: row.name });
      let tableCount = 0;
      try {
        await dbClient.connect();
        const cRes = await dbClient.query(`
          SELECT count(*)::int as cnt
          FROM information_schema.tables
          WHERE table_schema = 'ssc'
        `);
        tableCount = cRes.rows[0].cnt;
      } catch {
        tableCount = -1;
      } finally {
        await dbClient.end();
      }
      rows.push({ name: row.name, size: row.size, tables: tableCount });
    }
    return rows;
  } finally {
    await adminClient.end();
  }
}

export function switchEnvFile(envName: 'development' | 'staging' | 'production') {
  const sourceFile = path.join(apiDir, `.env.${envName}`);
  const targetFile = path.join(apiDir, '.env');

  if (!fs.existsSync(sourceFile)) {
    throw new Error(`Profile file .env.${envName} not found at ${sourceFile}`);
  }

  fs.copyFileSync(sourceFile, targetFile);
  console.log(`[Env Switch] Switched active .env -> .env.${envName}`);
}

// CLI runner
async function main() {
  const command = process.argv[2] || 'status';
  const target = process.argv[3];

  switch (command) {
    case 'status': {
      console.log('=== PostgreSQL Environment Status ===');
      const status = await getEnvironmentStatus();
      console.table(status);
      break;
    }
    case 'sync-staging': {
      await cloneDatabase('ssc', 'ssc_staging');
      break;
    }
    case 'sync-dev': {
      await cloneDatabase('ssc', 'ssc_dev');
      break;
    }
    case 'sync-backup': {
      await cloneDatabase('ssc', 'ssc_backup');
      break;
    }
    case 'sync-all': {
      await cloneDatabase('ssc', 'ssc_dev');
      await cloneDatabase('ssc', 'ssc_staging');
      await cloneDatabase('ssc', 'ssc_backup');
      break;
    }
    case 'switch': {
      if (!target || !['development', 'staging', 'production'].includes(target)) {
        console.error('Usage: bun scripts/manage-environments.ts switch <development|staging|production>');
        process.exit(1);
      }
      switchEnvFile(target as any);
      break;
    }
    default: {
      console.log(`
Usage: bun scripts/manage-environments.ts <command>

Commands:
  status          Show status of all environment databases
  sync-staging    Re-clone live 'ssc' -> 'ssc_staging'
  sync-dev        Re-clone live 'ssc' -> 'ssc_dev'
  sync-backup     Re-clone live 'ssc' -> 'ssc_backup'
  sync-all        Re-clone all environment databases from live 'ssc'
  switch <env>    Switch active .env to .env.development, .env.staging, or .env.production
      `);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('manage-environments.ts')) {
  main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
}
