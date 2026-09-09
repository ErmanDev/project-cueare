import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import type { Pool } from 'pg';

import { AttendanceService, computeDirection, pickWindowForTime } from '../src/attendance/service.ts';
import { getConfig } from '../src/config.ts';
import { createPool, ensureSchema } from '../src/db/pool.ts';
import * as q from '../src/db/queries.ts';
import { DIRECTION } from '../src/types.ts';
import { ApiError } from '../src/utils/errors.ts';
import { hashPassword } from '../src/auth/password.ts';

const SCHEMA = 'ssc_test';

async function expectRejected(
  promise: Promise<unknown>,
  match: Record<string, unknown>,
): Promise<void> {
  let err: unknown;
  try {
    await promise;
  } catch (e) {
    err = e;
  }
  expect(err).toBeDefined();
  expect(err).toMatchObject(match);
}

describe('AttendanceService', () => {
  let pool: Pool;
  let service: AttendanceService;
  let fakeNow: Date;
  let dbReady = false;

  let adminId: number;
  let moderatorId: number;
  let eventId: number;
  let morningId: number;
  let afternoonId: number;
  let studentId: number;

  beforeAll(async () => {
    try {
      pool = createPool(getConfig().database, SCHEMA);
      await pool.query('SELECT 1');
      await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
      await ensureSchema(pool, SCHEMA);
      dbReady = true;
    } catch (e) {
      console.warn('Skipping Postgres attendance tests:', e);
    }
  });

  afterAll(async () => {
    if (!pool) return;
    try {
      await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    } catch {
      // ignore
    }
    await pool.end();
  });

  beforeEach(async () => {
    if (!dbReady) return;
    fakeNow = new Date(2026, 8, 5, 8, 30);
    service = new AttendanceService(pool, { clock: () => fakeNow });
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
    const mod = await q.insertUser(pool, {
      name: 'Mod',
      username: 'mod',
      passwordHash: hashPassword('x', 1000),
      role: 'moderator',
    });
    const event = await q.insertEvent(pool, {
      name: 'Founders Day',
      eventDate: new Date(2026, 8, 5),
      isActive: true,
      createdBy: admin.id,
    });
    const morning = await q.insertWindow(pool, {
      eventId: event.id,
      sessionLabel: 'Morning',
      startTime: '07:00',
      endTime: '12:00',
      sortOrder: 0,
    });
    const afternoon = await q.insertWindow(pool, {
      eventId: event.id,
      sessionLabel: 'Afternoon',
      startTime: '13:00',
      endTime: '17:00',
      sortOrder: 1,
    });
    const student = await q.insertStudent(pool, {
      studentIdCode: 'STU-2026-0001',
      fullName: 'Juan Dela Cruz',
      section: 'BSIT-3A',
      photoUrl: null,
    });
    adminId = admin.id;
    moderatorId = mod.id;
    eventId = event.id;
    morningId = morning.id;
    afternoonId = afternoon.id;
    studentId = student.id;
  });

  it('skips when Postgres is unavailable', () => {
    if (!dbReady) {
      console.warn('Postgres not available — attendance integration tests skipped');
    }
    expect(true).toBe(true);
  });

  describe('determineDirection', () => {
    it('first scan in a session is IN', async () => {
      if (!dbReady) return;
      const r = await service.determineDirection({
        eventId,
        studentId,
        sessionWindowId: morningId,
      });
      expect(r.direction).toBe(DIRECTION.in);
      expect(r.canScan).toBe(true);
    });

    it('second scan in the same session is OUT', async () => {
      if (!dbReady) return;
      await service.confirm({
        eventId,
        studentId,
        sessionWindowId: morningId,
        scannedBy: moderatorId,
      });
      const r = await service.determineDirection({
        eventId,
        studentId,
        sessionWindowId: morningId,
      });
      expect(r.direction).toBe(DIRECTION.out);
    });

    it('third scan in the same session is rejected', async () => {
      if (!dbReady) return;
      const first = await service.confirm({
        eventId,
        studentId,
        sessionWindowId: morningId,
        scannedBy: moderatorId,
      });
      const second = await service.confirm({
        eventId,
        studentId,
        sessionWindowId: morningId,
        scannedBy: moderatorId,
      });
      expect(first.direction).toBe(DIRECTION.in);
      expect(second.direction).toBe(DIRECTION.out);
      const r = await service.determineDirection({
        eventId,
        studentId,
        sessionWindowId: morningId,
      });
      expect(r.direction).toBe(DIRECTION.alreadyComplete);
      expect(r.canScan).toBe(false);
      await expectRejected(
        service.confirm({
          eventId,
          studentId,
          sessionWindowId: morningId,
          scannedBy: moderatorId,
        }),
        { statusCode: 409 },
      );
    });

    it('cancelled scans do not affect the count', async () => {
      if (!dbReady) return;
      await service.cancel({
        eventId,
        studentId,
        sessionWindowId: morningId,
        scannedBy: moderatorId,
      });
      await service.cancel({
        eventId,
        studentId,
        sessionWindowId: morningId,
        scannedBy: moderatorId,
      });
      const r = await service.determineDirection({
        eventId,
        studentId,
        sessionWindowId: morningId,
      });
      expect(r.direction).toBe(DIRECTION.in);
      expect(r.existing).toEqual([]);
    });

    it('sessions are independent: IN in Morning, then IN in Afternoon', async () => {
      if (!dbReady) return;
      await service.confirm({
        eventId,
        studentId,
        sessionWindowId: morningId,
        scannedBy: moderatorId,
      });
      const r = await service.determineDirection({
        eventId,
        studentId,
        sessionWindowId: afternoonId,
      });
      expect(r.direction).toBe(DIRECTION.in);
    });

    it('serializes concurrent confirms for the same student', async () => {
      if (!dbReady) return;
      const [first, second] = await Promise.all([
        service.confirm({
          eventId,
          studentId,
          sessionWindowId: morningId,
          scannedBy: moderatorId,
        }),
        service.confirm({
          eventId,
          studentId,
          sessionWindowId: morningId,
          scannedBy: moderatorId,
        }),
      ]);
      const directions = [first.direction, second.direction].sort();
      expect(directions).toEqual([DIRECTION.in, DIRECTION.out]);
      const third = service.confirm({
        eventId,
        studentId,
        sessionWindowId: morningId,
        scannedBy: moderatorId,
      });
      await expectRejected(third, { statusCode: 409, details: { code: 'ALREADY_COMPLETE' } });
    });

    it('confirm rejects a stale expected direction', async () => {
      if (!dbReady) return;
      await service.confirm({
        eventId,
        studentId,
        sessionWindowId: morningId,
        scannedBy: moderatorId,
      });
      await expectRejected(
        service.confirm({
          eventId,
          studentId,
          sessionWindowId: morningId,
          scannedBy: moderatorId,
          expectedDirection: DIRECTION.in,
        }),
        { statusCode: 409, details: { code: 'DIRECTION_CHANGED' } },
      );
    });
  });

  describe('session window resolution', () => {
    it('auto picks the window containing server time', async () => {
      if (!dbReady) return;
      const w = await service.autoDetectWindow(eventId);
      expect(w?.id).toBe(morningId);
      fakeNow = new Date(2026, 8, 5, 14, 0);
      const w2 = await service.autoDetectWindow(eventId);
      expect(w2?.id).toBe(afternoonId);
    });

    it('auto returns null between / after windows', async () => {
      if (!dbReady) return;
      fakeNow = new Date(2026, 8, 5, 12, 30);
      expect(await service.autoDetectWindow(eventId)).toBeNull();
      fakeNow = new Date(2026, 8, 5, 18, 0);
      expect(await service.autoDetectWindow(eventId)).toBeNull();
    });

    it('end time is exclusive', async () => {
      if (!dbReady) return;
      fakeNow = new Date(2026, 8, 5, 12, 0);
      expect(await service.autoDetectWindow(eventId)).toBeNull();
      fakeNow = new Date(2026, 8, 5, 11, 59);
      expect((await service.autoDetectWindow(eventId))?.id).toBe(morningId);
    });

    it('preview in auto mode outside windows returns 422', async () => {
      if (!dbReady) return;
      fakeNow = new Date(2026, 8, 5, 18, 0);
      await expectRejected(
        service.preview({ eventId, qrPayload: 'STU-2026-0001' }),
        { statusCode: 422, details: { code: 'NO_ACTIVE_WINDOW' } },
      );
    });

    it('manual override rejected before chosen session starts', async () => {
      if (!dbReady) return;
      await expectRejected(
        service.preview({
          eventId,
          qrPayload: 'STU-2026-0001',
          sessionWindowId: afternoonId,
        }),
        { statusCode: 409, details: { code: 'SESSION_NOT_STARTED' } },
      );
    });

    it('manual override works while the chosen session is open', async () => {
      if (!dbReady) return;
      fakeNow = new Date(2026, 8, 5, 14, 0);
      const p = await service.preview({
        eventId,
        qrPayload: 'STU-2026-0001',
        sessionWindowId: afternoonId,
      });
      expect(p.window.id).toBe(afternoonId);
      expect(p.sessionMode).toBe('manual');
      expect(p.direction.direction).toBe(DIRECTION.in);
    });

    it('rejects scans before the session start time', async () => {
      if (!dbReady) return;
      fakeNow = new Date(2026, 8, 5, 6, 30);
      await expectRejected(
        service.preview({
          eventId,
          qrPayload: 'STU-2026-0001',
          sessionWindowId: morningId,
        }),
        { statusCode: 409, details: { code: 'SESSION_NOT_STARTED' } },
      );
    });

    it('rejects scans on a different day than the event', async () => {
      if (!dbReady) return;
      fakeNow = new Date(2026, 8, 4, 8, 30);
      await expectRejected(
        service.preview({
          eventId,
          qrPayload: 'STU-2026-0001',
          sessionWindowId: morningId,
        }),
        { statusCode: 409, details: { code: 'EVENT_NOT_TODAY' } },
      );
    });

    it('manual override still requires the session to be open', async () => {
      if (!dbReady) return;
      fakeNow = new Date(2026, 8, 5, 18, 0);
      await expectRejected(
        service.preview({
          eventId,
          qrPayload: 'STU-2026-0001',
          sessionWindowId: afternoonId,
        }),
        { statusCode: 409, details: { code: 'SESSION_ENDED' } },
      );
    });

    it('override window from another event is rejected', async () => {
      if (!dbReady) return;
      const otherEvent = await q.insertEvent(pool, {
        name: 'Other',
        eventDate: new Date(2026, 8, 6),
        isActive: true,
        createdBy: adminId,
      });
      const otherWindow = await q.insertWindow(pool, {
        eventId: otherEvent.id,
        sessionLabel: 'Morning',
        startTime: '07:00',
        endTime: '12:00',
        sortOrder: 0,
      });
      await expectRejected(
        service.preview({
          eventId,
          qrPayload: 'STU-2026-0001',
          sessionWindowId: otherWindow.id,
        }),
        { statusCode: 404 },
      );
    });
  });

  describe('preview', () => {
    it('unknown student code → 404', async () => {
      if (!dbReady) return;
      await expectRejected(
        service.preview({ eventId, qrPayload: 'NOPE' }),
        { statusCode: 404 },
      );
    });

    it('inactive event → 409', async () => {
      if (!dbReady) return;
      await q.updateEvent(pool, eventId, { isActive: false });
      await expectRejected(
        service.preview({ eventId, qrPayload: 'STU-2026-0001' }),
        { statusCode: 409 },
      );
    });

    it('past event date is invalid automatically', async () => {
      if (!dbReady) return;
      fakeNow = new Date(2026, 8, 6, 8, 30);
      await expectRejected(
        service.preview({
          eventId,
          qrPayload: 'STU-2026-0001',
          sessionWindowId: morningId,
        }),
        { statusCode: 409, details: { code: 'EVENT_DATE_PASSED' } },
      );
      const event = await q.getEventById(pool, eventId);
      expect(event?.is_active).toBe(false);
    });

    it('preview writes nothing', async () => {
      if (!dbReady) return;
      await service.preview({ eventId, qrPayload: 'STU-2026-0001' });
      const rows = await pool.query('SELECT * FROM "AttendanceLogs"');
      expect(rows.rows).toEqual([]);
    });
  });

  describe('event date rules', () => {
    it('rejects creating/updating with a past event_date', () => {
      if (!dbReady) return;
      fakeNow = new Date(2026, 8, 5, 8, 30);
      expect(() => service.requireEventDateNotPast(new Date(2026, 8, 4))).toThrow(ApiError);
      expect(() => service.requireEventDateNotPast(new Date(2026, 8, 5))).not.toThrow();
      expect(() => service.requireEventDateNotPast(new Date(2026, 8, 6))).not.toThrow();
    });

    it('deactivateExpiredEvents turns off past active events', async () => {
      if (!dbReady) return;
      fakeNow = new Date(2026, 8, 6, 10, 0);
      const n = await service.deactivateExpiredEvents();
      expect(n).toBe(1);
      const event = await q.getEventById(pool, eventId);
      expect(event?.is_active).toBe(false);
    });
  });

  describe('QR payloads', () => {
    it('plain code passes through when HMAC disabled', () => {
      if (!dbReady) return;
      expect(service.studentCodeFromPayload(' STU-1 ')).toBe('STU-1');
    });

    it('signed payload verified when HMAC enabled', async () => {
      if (!dbReady) return;
      const signed = new AttendanceService(pool, { qrHmacSecret: 'secret' });
      const student = (await q.getStudentById(pool, studentId))!;
      const payload = signed.qrPayloadFor(student);
      expect(signed.studentCodeFromPayload(payload)).toBe(student.student_id_code);
      expect(() => signed.studentCodeFromPayload(student.student_id_code)).toThrow(ApiError);
      expect(() =>
        signed.studentCodeFromPayload('{"sid":"STU-2026-0001","sig":"bad"}'),
      ).toThrow(ApiError);
    });

    it('rejects SQL-injection style QR payloads', () => {
      if (!dbReady) return;
      const attacks = [
        "'; DROP TABLE students;--",
        "1' OR '1'='1",
        'STU-1; SELECT * FROM users',
        '{"sid":"x\' OR 1=1--","sig":"x"}',
        '{"sid":"../../../etc/passwd"}',
      ];
      for (const attack of attacks) {
        expect(() => service.studentCodeFromPayload(attack)).toThrow(ApiError);
      }
    });

    it('rejects oversized QR payloads', () => {
      if (!dbReady) return;
      try {
        service.studentCodeFromPayload('A'.repeat(600));
        expect.unreachable();
      } catch (e) {
        expect((e as ApiError).details?.code).toBe('QR_PAYLOAD_TOO_LARGE');
      }
    });
  });

  describe('validateWindow', () => {
    it('rejects overlapping windows on the same event', async () => {
      if (!dbReady) return;
      await expectRejected(
        service.validateWindow({ eventId, startTime: '11:00', endTime: '13:30' }),
        { statusCode: 409, details: { code: 'WINDOW_OVERLAP' } },
      );
    });

    it('allows adjacent windows and edits of itself', async () => {
      if (!dbReady) return;
      await service.validateWindow({ eventId, startTime: '12:00', endTime: '13:00' });
      await service.validateWindow({
        eventId,
        startTime: '07:30',
        endTime: '12:00',
        excludeId: morningId,
      });
    });

    it('rejects start >= end and bad formats', async () => {
      if (!dbReady) return;
      await expectRejected(
        service.validateWindow({ eventId, startTime: '10:00', endTime: '09:00' }),
        { statusCode: 400 },
      );
      await expectRejected(
        service.validateWindow({ eventId, startTime: '25:00', endTime: '09:00' }),
        { statusCode: 400 },
      );
    });
  });

  describe('pure helpers', () => {
    it('computeDirection and pickWindowForTime', () => {
      expect(computeDirection([])).toBe('IN');
      expect(
        computeDirection([{ direction: 'IN' } as never]),
      ).toBe('OUT');
      const windows = [
        {
          id: 1,
          event_id: 1,
          session_label: 'Morning',
          start_time: '07:00',
          end_time: '12:00',
          sort_order: 0,
        },
      ];
      expect(pickWindowForTime(windows, new Date(2026, 8, 5, 8, 0))?.id).toBe(1);
      expect(pickWindowForTime(windows, new Date(2026, 8, 5, 12, 0))).toBeNull();
    });
  });
});
