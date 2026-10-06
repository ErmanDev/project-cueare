import { getConfig } from '../src/config.ts';
import { createPool } from '../src/db/pool.ts';

async function main() {
  const config = getConfig();
  const pool = createPool(config.database);
  try {
    console.log('Resetting all attendance transactions, scan attempts, logs, and QR tokens...');

    await pool.query(`
      TRUNCATE TABLE 
        "AttendanceScanAttempts", 
        "AttendanceLogs", 
        "AttendanceRecords", 
        "EventSessionQrTokens" 
      RESTART IDENTITY CASCADE;
    `);

    console.log('✅ SUCCESS: Attendance logs and transactions reset cleanly!');
  } catch (err) {
    console.error('❌ Error resetting attendance logs:', err);
  } finally {
    await pool.end();
  }
}

main();
