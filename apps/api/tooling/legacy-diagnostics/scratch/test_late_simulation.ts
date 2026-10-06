import { getPool } from '../../../src/db/pool.ts';

async function testLateCheckInSimulation() {
  const pool = getPool();
  
  // Find a participant in session 1
  const partRes = await pool.query(`
    SELECT "eventParticipantId", "studentId" FROM "EventParticipants" WHERE "eventSessionId" = 1 LIMIT 1
  `);
  
  if (partRes.rows.length === 0) {
    console.log('No participant found');
    await pool.end();
    return;
  }
  
  const participantId = partRes.rows[0].eventParticipantId;
  const lateCheckInTime = '2026-09-16T14:45:00.000Z'; // 10:45 PM PHT, lateAfter was 10:30 PM PHT (14:30 UTC)

  console.log(`Simulating late check-in for participant ${participantId} at ${lateCheckInTime}...`);

  // Insert or update AttendanceRecord
  const existingRecord = await pool.query(`
    SELECT "attendanceRecordId" FROM "AttendanceRecords" WHERE "eventParticipantId" = $1
  `, [participantId]);

  if (existingRecord.rows.length > 0) {
    await pool.query(`
      UPDATE "AttendanceRecords" SET "checkedInAtUtc" = $1 WHERE "eventParticipantId" = $2
    `, [lateCheckInTime, participantId]);
  } else {
    await pool.query(`
      INSERT INTO "AttendanceRecords" ("eventParticipantId", "checkedInAtUtc", "lastChangedAtUtc")
      VALUES ($1, $2, NOW())
    `, [participantId, lateCheckInTime]);
  }

  // Query view
  const viewRes = await pool.query(`
    SELECT "eventParticipantId", "checkedInAtUtc", "isLate", "attendanceStatus"
    FROM "VwEventAttendance"
    WHERE "eventParticipantId" = $1
  `, [participantId]);

  console.log('=== RESULT FROM VIEW ===');
  console.log(viewRes.rows[0]);

  // Clean up test record so DB remains clean
  await pool.query(`DELETE FROM "AttendanceRecords" WHERE "eventParticipantId" = $1`, [participantId]);
  console.log('Cleaned up test record.');

  await pool.end();
}

testLateCheckInSimulation().catch(console.error);
