import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import type { Pool } from 'pg';

import { AttendanceService } from '../src/attendance/service.ts';
import { hashPassword } from '../src/auth/password.ts';
import * as q from '../src/db/queries.ts';
import { closeTestDatabase, openTestDatabase } from './support/database.ts';

const SCHEMA = 'ssc_student_events_test';

describe('Student event QR', () => {
  let pool: Pool;
  let dbReady = false;
  let adminId = 0;
  let eventId = 0;
  let studentId = 0;

  beforeAll(async () => {
    const opened = await openTestDatabase(SCHEMA);
    if (opened) pool = opened;
    dbReady = Boolean(opened);
  });

  afterAll(async () => {
    await closeTestDatabase(pool, SCHEMA);
  });

  beforeEach(async () => {
    if (!dbReady) return;
    await pool.query(
      `TRUNCATE "AttendanceLogs", "AttendanceCorrections", "AttendanceRecords",
               "EventParticipants", "EventSessions", "Events",
               "StudentEnrollments", "Students", "Sections", "Users"
       RESTART IDENTITY CASCADE`,
    );
    const admin = await q.insertUser(pool, {
      name: 'Admin',
      username: 'admin',
      passwordHash: hashPassword('x', 1000),
      role: 'superadmin',
    });
    const event = await q.insertEvent(pool, {
      name: 'Acquaintance',
      eventStartDate: new Date(2026, 8, 14),
      eventEndDate: new Date(2026, 8, 14),
      isActive: true,
      createdBy: admin.id,
    });
    await q.insertWindow(pool, {
      eventId: event.id,
      sessionLabel: 'Morning',
      startTime: '07:00',
      endTime: '12:00',
      sortOrder: 0,
    });
    await q.insertWindow(pool, {
      eventId: event.id,
      sessionLabel: 'Afternoon',
      startTime: '13:00',
      endTime: '17:00',
      sortOrder: 1,
    });
    const student = await q.insertStudent(pool, {
      studentIdCode: '02-26-0011',
      fullName: 'Juan Dela Cruz',
      section: 'A',
      photoUrl: null,
    });
    adminId = admin.id;
    eventId = event.id;
    studentId = student.id;
    await q.publishEvent(pool, event.id, admin.id);
  });

  it('skips when Postgres is unavailable', () => {
    if (!dbReady) {
      console.warn('Postgres not available — student event tests skipped');
    }
    expect(true).toBe(true);
  });

  it('lists a registered event with session check-in rows and a scannable QR token', async () => {
    if (!dbReady) return;
    await q.addParticipantsToEvent(pool, eventId, [studentId], adminId);

    const events = await q.listRegisteredEventsForStudent(pool, studentId);
    expect(events.map((e) => e.id)).toContain(eventId);

    const sessions = await q.listStudentEventSessions(pool, studentId);
    expect(sessions.map((s) => s.session_name)).toEqual(['Morning', 'Afternoon']);
    expect(sessions.every((s) => s.status === 'PENDING')).toBe(true);

    const other = await q.insertStudent(pool, {
      studentIdCode: '02-26-0099',
      fullName: 'Other Student',
      section: 'B',
      photoUrl: null,
    });
    expect(await q.listRegisteredEventsForStudent(pool, other.id)).toEqual([]);
    expect(await q.ensureStudentEventQrToken(pool, eventId, other.id, adminId)).toBeNull();

    const token = await q.ensureStudentEventQrToken(pool, eventId, studentId, adminId);
    expect(token).toMatch(/^[0-9a-f-]{36}$/i);

    const found = await q.getEventParticipantByToken(pool, token!, eventId);
    expect(found?.student_id).toBe(studentId);

    const service = new AttendanceService(pool, {
      clock: () => new Date(2026, 8, 14, 8, 30),
    });
    const preview = await service.preview({ eventId, qrPayload: token! });
    expect(preview.student.id).toBe(studentId);
    expect(preview.window.session_label).toBe('Morning');
    expect(await q.listFinesForStudent(pool, studentId)).toEqual([]);
  });
});
