import { getConfig } from '../../../src/config.ts';
import { createPool } from '../../../src/db/pool.ts';

async function main() {
  const pool = createPool(getConfig().database);
  try {
    console.log('Setting Session #19 to 9:30 PM Philippine Time (13:30 UTC)...');
    await pool.query(`
      UPDATE "EventSessions"
      SET 
        "startsAtUtc" = '2026-09-16T13:30:00.000Z',
        "endsAtUtc" = '2026-09-16T14:00:00.000Z',
        "checkInOpensAtUtc" = '2026-09-16T13:30:00.000Z',
        "lateAfterUtc" = '2026-09-16T13:35:00.000Z',
        "checkInClosesAtUtc" = '2026-09-16T13:35:00.000Z',
        "checkOutOpensAtUtc" = '2026-09-16T13:30:00.000Z',
        "checkOutClosesAtUtc" = '2026-09-16T14:00:00.000Z'
      WHERE "eventSessionId" = 19;
    `);
    console.log('✅ SUCCESS: Session #19 updated to 9:30 PM PHT (13:30 UTC)!');
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
