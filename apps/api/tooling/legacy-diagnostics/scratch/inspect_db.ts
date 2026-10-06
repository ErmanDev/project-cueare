import { getPool } from '../../../src/db/pool.ts';

async function checkSessionAndAttendance() {
  const pool = getPool();
  
  // Get active sessions
  const sessions = await pool.query(`
    SELECT "eventSessionId", "sessionName", "startsAtUtc", "endsAtUtc", "checkInOpensAtUtc", "lateAfterUtc", "checkInClosesAtUtc"
    FROM "EventSessions"
    ORDER BY "eventSessionId" DESC
    LIMIT 5
  `);
  
  console.log('=== LATEST SESSIONS ===');
  console.log(JSON.stringify(sessions.rows, null, 2));

  // Get attendance view records
  const attendance = await pool.query(`
    SELECT * FROM "VwEventAttendance"
    ORDER BY "attendanceRecordId" DESC
    LIMIT 5
  `);
  
  console.log('=== LATEST ATTENDANCE VIEW ===');
  console.log(JSON.stringify(attendance.rows, null, 2));

  await pool.end();
}

checkSessionAndAttendance().catch(console.error);
