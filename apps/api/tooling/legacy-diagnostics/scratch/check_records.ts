import { getPool } from '../../../src/db/pool.ts';

async function checkActualAttendanceRecords() {
  const pool = getPool();
  
  const res = await pool.query(`
    SELECT 
      ar."attendanceRecordId",
      ar."eventParticipantId",
      ar."checkedInAtUtc",
      ar."checkedOutAtUtc",
      es."sessionName",
      es."startsAtUtc",
      es."lateAfterUtc",
      va."attendanceStatus",
      va."isLate"
    FROM "AttendanceRecords" ar
    JOIN "EventParticipants" ep ON ep."eventParticipantId" = ar."eventParticipantId"
    JOIN "EventSessions" es ON es."eventSessionId" = ep."eventSessionId"
    LEFT JOIN "VwEventAttendance" va ON va."eventParticipantId" = ar."eventParticipantId"
    ORDER BY ar."attendanceRecordId" DESC
  `);

  console.log('=== ACTUAL ATTENDANCE RECORDS IN DB ===');
  console.log(JSON.stringify(res.rows, null, 2));

  await pool.end();
}

checkActualAttendanceRecords().catch(console.error);
