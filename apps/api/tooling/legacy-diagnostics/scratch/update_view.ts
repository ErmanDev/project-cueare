import { getConfig } from '../../../src/config.ts';
import { createPool } from '../../../src/db/pool.ts';

async function main() {
  const pool = createPool(getConfig().database);
  try {
    await pool.query(`
      CREATE OR REPLACE VIEW "VwEventAttendance" AS
      SELECT 
          e."eventId",
          e."eventCode",
          e."eventName",
          s."eventSessionId",
          s."sessionName",
          p."eventParticipantId",
          p."studentId",
          st."studentNumber",
          st."firstName",
          st."middleName",
          st."lastName",
          st.suffix,
          p."isRequired",
          a."attendanceRecordId",
          a."checkedInAtUtc",
          a."checkedOutAtUtc",
          CASE 
              WHEN a."checkedOutAtUtc" IS NOT NULL AND a."checkedInAtUtc" IS NOT NULL 
              THEN ROUND(EXTRACT(EPOCH FROM (a."checkedOutAtUtc" - a."checkedInAtUtc")) / 60.0, 2)
          END AS "attendedMinutes",
          (a."checkedInAtUtc" IS NOT NULL AND a."checkedInAtUtc" > s."lateAfterUtc") AS "isLate",
          CASE
              WHEN e."eventStatusCode" = 'CANCELLED' THEN 'CANCELLED'
              WHEN a."isExcused" = TRUE THEN 'EXCUSED'
              WHEN a."checkedInAtUtc" IS NULL THEN 
                  CASE 
                      WHEN s."isClosed" = TRUE OR e."eventStatusCode" = 'CLOSED' THEN 
                          CASE WHEN p."isRequired" = TRUE THEN 'ABSENT' ELSE 'NOT_ATTENDED' END 
                      ELSE 'NOT_YET_RECORDED' 
                  END
              WHEN a."checkedInAtUtc" > s."lateAfterUtc" THEN 'LATE'
              WHEN s."requiresCheckOut" = TRUE AND a."checkedOutAtUtc" IS NULL THEN
                  CASE 
                      WHEN s."isClosed" = TRUE OR e."eventStatusCode" = 'CLOSED' THEN 'INCOMPLETE' 
                      ELSE 'CHECKED_IN' 
                  END
              WHEN s."requiresCheckOut" = TRUE AND EXTRACT(EPOCH FROM (a."checkedOutAtUtc" - a."checkedInAtUtc")) < (s."minimumMinutes" * 60) THEN 'INCOMPLETE'
              ELSE 'PRESENT'
          END AS "attendanceStatus"
      FROM "EventParticipants" p
      JOIN "EventSessions" s ON s."eventSessionId" = p."eventSessionId"
      JOIN "Events" e ON e."eventId" = s."eventId"
      JOIN "Students" st ON st."studentId" = p."studentId"
      LEFT JOIN "AttendanceRecords" a ON a."eventParticipantId" = p."eventParticipantId";
    `);
    console.log('✅ VwEventAttendance updated in PostgreSQL database successfully!');
  } catch (err) {
    console.error('Error updating view:', err);
  } finally {
    await pool.end();
  }
}

main();
