import pg from 'pg';
import { getPool } from '../src/db/pool.ts';
import * as q from '../src/db/queries.ts';

async function main() {
  const pool = getPool();
  try {
    const existing = await q.getEventById(pool, 2);
    console.log('Existing Event 2:', existing);
    const windows = await q.windowsForEvent(pool, 2);
    console.log('Existing windows:', windows);

    const updated = await q.updateEvent(pool, 2, {
      name: 'Acquaintance Party 2026',
      eventDate: existing!.event_date,
      isActive: true,
    });
    console.log('Updated Event 2 successfully:', updated);
  } catch (err: any) {
    console.error('Error updating Event 2:', err);
  } finally {
    await pool.end();
  }
}

main();
