import pg from 'pg';

import { getConfig } from '../src/config.ts';

const { Client } = pg;

function quoteIdent(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(
      `DATABASE_NAME must be a simple identifier (letters/digits/_): ${name}`,
    );
  }
  return `"${name}"`;
}

async function main(): Promise<void> {
  const cfg = getConfig().database;
  console.log(`Target database: ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.name}`);

  const client = new Client({
    host: cfg.host,
    port: cfg.port,
    database: 'postgres',
    user: cfg.user,
    password: cfg.password,
    ssl: false,
  });
  await client.connect();
  try {
    const rows = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [cfg.name]);
    if (rows.rowCount) {
      console.log(`Database "${cfg.name}" already exists.`);
    } else {
      await client.query(`CREATE DATABASE ${quoteIdent(cfg.name)}`);
      console.log(`Created database "${cfg.name}".`);
    }
  } finally {
    await client.end();
  }

  console.log('');
  console.log('Connect from DBeaver / pgAdmin / HeidiSQL / Laragon:');
  console.log(`  Host:     ${cfg.host}`);
  console.log(`  Port:     ${cfg.port}`);
  console.log(`  Database: ${cfg.name}`);
  console.log(`  User:     ${cfg.user}`);
  console.log('  Password: (your DATABASE_PASSWORD / postgres user password)');
  console.log('');
  console.log('Next: npm run seed-admin');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
