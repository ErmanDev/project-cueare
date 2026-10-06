import { getConfig } from '../../../src/config.ts';
import { createPool } from '../../../src/db/pool.ts';

async function main() {
  const pool = createPool(getConfig().database);
  try {
    console.log('Updating session #19 times to 9:30 PM - 10:00 PM (21:30 - 22:00)...');
    await pool.query(`
      UPDATE "EventSessions"
      SET 
        "startsAtUtc" = '2026-09-16T21:30:00.000Z',
        "endsAtUtc" = '2026-09-16T22:00:00.000Z',
        "checkInOpensAtUtc" = '2026-09-16T21:30:00.000Z',
        "lateAfterUtc" = '2026-09-16T21:35:00.000Z',
        "checkInClosesAtUtc" = '2026-09-16T21:35:00.000Z',
        "checkOutOpensAtUtc" = '2026-09-16T21:30:00.000Z',
        "checkOutClosesAtUtc" = '2026-09-16T22:00:00.000Z'
      WHERE "eventSessionId" = 19;
    `);
    console.log('✅ SUCCESS: Session #19 times updated to 9:30 PM - 10:00 PM!');
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
