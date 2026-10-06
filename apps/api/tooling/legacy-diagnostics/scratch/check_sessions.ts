import { getConfig } from '../../../src/config.ts';
import { createPool } from '../../../src/db/pool.ts';

async function main() {
  const pool = createPool(getConfig().database);
  try {
    const res = await pool.query('SELECT * FROM "EventSessions"');
    console.log('EventSessions rows:', JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
