import { getConfig } from '../../../src/config.ts';
import { createPool } from '../../../src/db/pool.ts';

async function main() {
  const pool = createPool(getConfig().database);
  try {
    const pRes = await pool.query('SELECT "eventParticipantId" FROM "EventParticipants" LIMIT 1');
    const pId = pRes.rows[0]?.eventParticipantId;
    if (!pId) {
      console.log('No participant found');
      return;
    }

    // Update test late checkin at 14:45:00Z (lateAfterUtc is 14:30:00Z)
    await pool.query(`
      INSERT INTO "AttendanceRecords" ("eventParticipantId", "checkedInAtUtc", "lastChangedByUserId", "lastChangedAtUtc")
      VALUES ($1, '2026-09-16T14:45:00.000Z', 1, clock_timestamp())
      ON CONFLICT ("eventParticipantId") DO UPDATE SET "checkedInAtUtc" = '2026-09-16T14:45:00.000Z';
    `, [pId]);

    const res = await pool.query(`
      SELECT 
        s."sessionName",
        s."startsAtUtc",
        s."lateAfterUtc",
        a."checkedInAtUtc",
        (a."checkedInAtUtc" > s."lateAfterUtc") AS is_late_calc,
        va."attendanceStatus"
      FROM "EventParticipants" p
      JOIN "EventSessions" s ON s."eventSessionId" = p."eventSessionId"
      JOIN "AttendanceRecords" a ON a."eventParticipantId" = p."eventParticipantId"
      JOIN "VwEventAttendance" va ON va."eventParticipantId" = p."eventParticipantId"
      WHERE p."eventParticipantId" = $1
    `, [pId]);

    console.log('Late scan test result AFTER ensure-db:', JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
