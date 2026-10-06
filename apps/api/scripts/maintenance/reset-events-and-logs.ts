import { getConfig } from '../src/config.ts';
import { createPool } from '../src/db/pool.ts';

async function main() {
  const config = getConfig();
  const pool = createPool(config.database);

  console.log('🧹 Preparing to reset all Events, Sessions, Attendance Logs, and Fines...');

  // Query table existence helper
  async function existingTables(tableList: string[]): Promise<string[]> {
    const valid: string[] = [];
    for (const tbl of tableList) {
      const res = await pool.query(
        `SELECT to_regclass($1)::text AS reg`,
        [`"${tbl}"`],
      );
      if (res.rows[0]?.reg) {
        valid.push(`"${tbl}"`);
      }
    }
    return valid;
  }

  const candidateTables = [
    // Fine & Payment Assessments
    'FinePaymentAllocations',
    'FinePayments',
    'FineWaiverRequests',
    'StudentFineStatusHistory',
    'StudentFineAssessments',
    'EventFineRuleOverrides',
    'EventFineRules',
    'EventFinePolicies',

    // Attendance Records & Scan Logs
    'AttendanceScanEvents',
    'AttendanceScanAuditLogs',
    'AttendanceScanAttempts',
    'AttendanceLogs',
    'AttendanceRecords',

    // QR Tokens & Credentials
    'EventParticipantQrCredentials',
    'EventQrSessionTokens',
    'EventSessionQrTokens',

    // Registrations & Participants
    'EventParticipants',
    'EventRegistrations',
    'EventAudienceRules',

    // Sessions & Events
    'EventSessions',
    'Events',
  ];

  try {
    const tablesToTruncate = await existingTables(candidateTables);
    if (tablesToTruncate.length === 0) {
      console.log('⚠️ No matching event or attendance tables found.');
      return;
    }

    console.log(`Found ${tablesToTruncate.length} tables to truncate:`);
    console.log(tablesToTruncate.map((t) => `  - ${t}`).join('\n'));

    const queryStr = `TRUNCATE TABLE ${tablesToTruncate.join(', ')} RESTART IDENTITY CASCADE;`;
    await pool.query(queryStr);

    console.log('\n✅ SUCCESS: All Events, Sessions, Attendance Logs, QR Tokens, and Fines reset cleanly!');
    console.log('✅ Auto-increment IDs for all affected tables restarted at 1.\n');
  } catch (err) {
    console.error('❌ Error executing database reset:', err);
  } finally {
    await pool.end();
  }
}

main();
