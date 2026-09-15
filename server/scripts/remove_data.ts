import type { Pool } from 'pg';

import { getConfig } from '../src/config.ts';
import { createPool } from '../src/db/pool.ts';

/** Truncate every base table in schema `ssc` and reset identities. */
export async function wipeAllSscTables(pool: Pool): Promise<number> {
  const { rows } = await pool.query(`
    SELECT format('%I.%I', schemaname, tablename) AS name
    FROM pg_tables
    WHERE schemaname = 'ssc'
    ORDER BY tablename
  `);
  if (rows.length === 0) return 0;
  await pool.query(`TRUNCATE TABLE ${rows.map((r) => r.name).join(', ')} RESTART IDENTITY CASCADE`);
  return rows.length;
}

async function main() {
  const config = getConfig();
  const pool = createPool(config.database);
  try {
    console.log(
      `Wiping all tables in ssc on ${config.database.user}@${config.database.host}:${config.database.port}/${config.database.name}...`,
    );
    const n = await wipeAllSscTables(pool);
    console.log(n === 0 ? 'No tables in ssc.' : `SUCCESS: truncated ${n} tables.`);
  } catch (err) {
    console.error('Error removing data:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (import.meta.main) {
  void main();
}
