import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import type { Pool } from 'pg';

import { AttendanceService, computeDirection, pickWindowForTime, previewToApi } from '../src/attendance/service.ts';
import { getConfig } from '../src/config.ts';
import { createPool, ensureSchema } from '../src/db/pool.ts';
import { backfillEventRegistrations } from '../src/db/schema.ts';
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
      eventStartDate: new Date(2026, 8, 5),
      eventEndDate: new Date(2026, 8, 5),
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
    await q.publishEvent(pool, event.id, admin.id);
  });

  it('skips when Postgres is unavailable', () => {
    if (!dbReady) {
      console.warn('Postgres not available — attendance integration tests skipped');
    }
    expect(true).toBe(true);
  });

  it('assesses capped event fines once and reports payment balances', async () => {
    if (!dbReady) return;
    await q.addParticipantsToEvent(pool, eventId, [studentId], adminId);
    const policy = await pool.query<{ id: number }>(
      `INSERT INTO "EventFinePolicies" ("eventId", "policyCode", "policyName", "currencyCode",
        "maximumFinePerStudent", "policyStatusCode", "createdByUserId")
       VALUES ($1, 'TEST', 'Test fines', 'PHP', 50, 'ACTIVE', $2)
       RETURNING "eventFinePolicyId" AS id`, [eventId, adminId]);
    const policyId = policy.rows[0]!.id;
    for (const [code, amount, priority] of [['LATE', 30, 1], ['MISSED_CHECKOUT', 40, 2]] as const) {
      await pool.query(
        `INSERT INTO "EventFineRules" ("eventFinePolicyId", "eventId", "eventSessionId",
          "violationCode", "fineAmount", "priorityOrder") VALUES ($1, $2, $3, $4, $5, $6)`,
        [policyId, eventId, morningId, code, amount, priority]);
    }
    const participant = await pool.query<{ id: number }>(
      `SELECT "eventParticipantId" AS id FROM "EventParticipants"
       WHERE "eventSessionId" = $1 AND "studentId" = $2`, [morningId, studentId]);
    await pool.query(
      `INSERT INTO "AttendanceRecords" ("eventParticipantId", "checkedInAtUtc", "lastChangedByUserId")
       SELECT $1, "lateAfterUtc" + interval '1 minute', $2 FROM "EventSessions" WHERE "eventSessionId" = $3`,
      [participant.rows[0]!.id, adminId, morningId]);

    const estimated = await q.getEventFineReport(pool, eventId);
    expect(estimated?.preview.map((row: any) => [row.violation_code, row.amount]))
      .toEqual([['LATE', 30], ['MISSED_CHECKOUT', 20]]);

    expect(await q.closeSessionAndAssessFines(pool, morningId, adminId))
      .toEqual({ assessmentsCreated: 2, totalAmountAssessed: 50 });
    expect(await q.closeSessionAndAssessFines(pool, morningId, adminId))
      .toEqual({ assessmentsCreated: 0, totalAmountAssessed: 0 });
    const report = await q.getEventFineReport(pool, eventId);
    expect(report?.assessments.map((row: any) => [row.violation_code, row.assessed_amount]))
      .toEqual([['LATE', 30], ['MISSED_CHECKOUT', 20]]);
    const assessmentId = report!.assessments[0]!.assessment_id;
    const payment = await pool.query<{ id: number }>(
      `INSERT INTO "FinePayments" ("paymentReference", "paymentMethodCode", "totalAmount", "receivedByUserId")
       VALUES ('FINE-TEST-1', 'CASH', 10, $1) RETURNING "finePaymentId" AS id`, [adminId]);
    await pool.query(
      `INSERT INTO "FinePaymentAllocations" ("finePaymentId", "studentFineAssessmentId", "allocatedAmount")
       VALUES ($1, $2, 10)`, [payment.rows[0]!.id, assessmentId]);
    const updated = await q.getEventFineReport(pool, eventId);
    expect(updated?.assessments[0]).toMatchObject({ paid_amount: 10, outstanding_amount: 20 });
  });

  it('closes all event sessions, assesses fines, and finalizes the policy once', async () => {
    if (!dbReady) return;
    await q.addParticipantsToEvent(pool, eventId, [studentId], adminId);
    const policy = await pool.query<{ id: number }>(
      `INSERT INTO "EventFinePolicies" ("eventId", "policyCode", "policyName", "currencyCode",
        "maximumFinePerStudent", "policyStatusCode", "createdByUserId")
       VALUES ($1, 'CLOSE', 'Close test', 'PHP', 50, 'ACTIVE', $2)
       RETURNING "eventFinePolicyId" AS id`, [eventId, adminId]);
    for (const sessionId of [morningId, afternoonId]) {
      await pool.query(
        `INSERT INTO "EventFineRules" ("eventFinePolicyId", "eventId", "eventSessionId",
          "violationCode", "fineAmount") VALUES ($1, $2, $3, 'ABSENT', 30)`,
        [policy.rows[0]!.id, eventId, sessionId]);
    }
    expect(await q.deactivateEvent(pool, eventId, adminId))
      .toEqual({ assessmentsCreated: 2, totalAmountAssessed: 50 });
    expect(await q.deactivateEvent(pool, eventId, adminId))
      .toEqual({ assessmentsCreated: 0, totalAmountAssessed: 0 });
    expect((await q.getEventById(pool, eventId))?.event_status).toBe('CLOSED');
    const report = await q.getEventFineReport(pool, eventId);
    expect(report?.policy?.status).toBe('CLOSED');
    expect(report?.assessments.map((row: any) => row.assessed_amount)).toEqual([30, 20]);
  });

  it('counts unique attendees from current records and scopes roster status to a session', async () => {
    if (!dbReady) return;
    const second = await q.insertStudent(pool, {
      studentIdCode: 'STU-2026-0002', fullName: 'Maria Santos', section: 'BSIT-3A', photoUrl: null,
    });
    await q.addParticipantsToEvent(pool, eventId, [second.id], adminId);
    await q.updateWindow(pool, morningId, { startTime: '07:00', endTime: '12:00', outEnd: '12:30' });
    service.invalidateEvent(eventId);
    await service.confirm({ eventId, studentId, sessionWindowId: morningId, scannedBy: moderatorId });
    fakeNow = new Date(2026, 8, 5, 12, 3);
    await service.confirm({ eventId, studentId, sessionWindowId: morningId, scannedBy: moderatorId });
    fakeNow = new Date(2026, 8, 5, 13, 30);
    await service.confirm({ eventId, studentId, sessionWindowId: afternoonId, scannedBy: moderatorId });

    const summary = await q.getEventAttendanceSummary(pool, eventId);
    expect(summary).toMatchObject({ registered: 2, checked_in: 1, not_yet_checked_in: 1 });
    expect(summary.sessions.find((s) => s.session_id === morningId)).toMatchObject({
      checked_in: 1, checked_out: 1, pending: 1, absent: 0,
    });
    expect(summary.sessions.find((s) => s.session_id === afternoonId)).toMatchObject({
      checked_in: 1, checked_out: 0, pending: 1, absent: 0,
    });

    const pending = await q.listEventParticipants(pool, eventId, { sessionId: morningId, status: 'PENDING' });
    expect(pending.total).toBe(1);
    expect(pending.rows[0]?.student_id).toBe(second.id);

    await q.closeSessionAndAssessFines(pool, afternoonId, adminId);
    const closed = await q.getEventAttendanceSummary(pool, eventId);
    expect(closed.sessions.find((s) => s.session_id === afternoonId)).toMatchObject({ pending: 0, absent: 1 });
    const absent = await q.listEventParticipants(pool, eventId, { sessionId: afternoonId, status: 'ABSENT' });
    expect(absent.total).toBe(1);
    expect(absent.rows[0]?.student_id).toBe(second.id);

    const otherEvent = await q.insertEvent(pool, {
      name: 'Other Event', eventStartDate: new Date(2026, 8, 6), eventEndDate: new Date(2026, 8, 6),
      isActive: true, createdBy: adminId,
    });
    await q.insertWindow(pool, {
      eventId: otherEvent.id, sessionLabel: 'Morning', startTime: '07:00', endTime: '12:00', sortOrder: 0,
    });
    await q.publishEvent(pool, otherEvent.id, adminId);
    const otherSummary = await q.getEventAttendanceSummary(pool, otherEvent.id);
    expect(otherSummary.checked_in).toBe(0);

    const emptyEvent = await q.insertEvent(pool, {
      name: 'Empty Event', eventStartDate: new Date(2026, 8, 7), eventEndDate: new Date(2026, 8, 7),
      isActive: false, createdBy: adminId,
    });
    const emptySummary = await q.getEventAttendanceSummary(pool, emptyEvent.id);
    expect(emptySummary).toMatchObject({ registered: 0, checked_in: 0, not_yet_checked_in: 0, sessions: [] });
  });

  it('records an admin manual check-in without a QR and rejects a second IN', async () => {
    if (!dbReady) return;
    fakeNow = new Date(2026, 8, 5, 13, 30);
    await expectRejected(service.confirm({
      eventId, studentId, sessionWindowId: morningId, scannedBy: moderatorId,
      expectedDirection: DIRECTION.in,
    }), { statusCode: 409 });
    const first = await service.confirm({
      eventId, studentId, sessionWindowId: morningId, scannedBy: adminId,
      expectedDirection: DIRECTION.in, allowLateManualCheckIn: true,
      deviceNote: 'Manual check-in: QR was unavailable',
    });
    expect(first.direction).toBe(DIRECTION.in);
    expect(first.scanned_by).toBe(adminId);
    expect(first.device_note).toBe('Manual check-in: QR was unavailable');
    expect((await q.getEventAttendanceSummary(pool, eventId)).checked_in).toBe(1);
    const roster = await q.listEventParticipants(pool, eventId);
    expect(roster.rows[0]?.sessions?.find((item) => item.session_id === morningId)?.status).toBe('LATE');
    await expectRejected(service.confirm({
      eventId, studentId, sessionWindowId: morningId, scannedBy: adminId,
      expectedDirection: DIRECTION.in, allowLateManualCheckIn: true,
      deviceNote: 'Manual check-in: duplicate',
    }), { statusCode: 409 });
    expect((await q.getEventAttendanceSummary(pool, eventId)).checked_in).toBe(1);
    const second = await q.insertStudent(pool, {
      studentIdCode: 'STU-2026-0002', fullName: 'Maria Santos', section: 'BSIT-3A', photoUrl: null,
    });
    await q.addParticipantsToEvent(pool, eventId, [second.id], adminId);
    await q.closeSessionAndAssessFines(pool, morningId, adminId);
    await expectRejected(service.confirm({
      eventId, studentId: second.id, sessionWindowId: morningId, scannedBy: adminId,
      expectedDirection: DIRECTION.in, allowLateManualCheckIn: true,
    }), { statusCode: 409 });
  });

  it('records an admin manual check-out after a check-in', async () => {
    if (!dbReady) return;
    fakeNow = new Date(2026, 8, 5, 8, 30);
    await service.confirm({
      eventId, studentId, sessionWindowId: morningId, scannedBy: adminId,
      expectedDirection: DIRECTION.in, allowLateManualCheckIn: true,
      deviceNote: 'Manual check-in: In person',
    });
    fakeNow = new Date(2026, 8, 5, 11, 45);
    const checkOut = await service.confirm({
      eventId, studentId, sessionWindowId: morningId, scannedBy: adminId,
      expectedDirection: DIRECTION.out, allowLateManualCheckOut: true,
      deviceNote: 'Manual check-out: In person',
    });
    expect(checkOut.direction).toBe(DIRECTION.out);
    expect(checkOut.scanned_by).toBe(adminId);
    expect(checkOut.device_note).toBe('Manual check-out: In person');
    const summary = await q.getEventAttendanceSummary(pool, eventId);
    expect(summary.checked_in).toBe(1);
    expect(summary.sessions[0]?.checked_out).toBe(1);
  });

  it('links one registration and QR pass to a participant in every session', async () => {
    if (!dbReady) return;
    await q.updateEvent(pool, eventId, { eventEndDate: new Date(2026, 8, 6) });
    const dayTwo = await q.insertWindow(pool, {
      eventId,
      sessionDate: new Date(2026, 8, 6),
      sessionLabel: 'Day 2 Morning',
      startTime: '07:00',
      endTime: '12:00',
      sortOrder: 2,
    });
    await q.syncRegisteredEventSessions(pool, eventId, adminId);
    service.invalidateEvent(eventId);

    const registrations = await pool.query(
      'SELECT "eventRegistrationId" FROM "EventRegistrations" WHERE "eventId" = $1 AND "studentId" = $2',
      [eventId, studentId],
    );
    const participants = await pool.query(
      'SELECT "eventRegistrationId" FROM "EventParticipants" WHERE "studentId" = $1',
      [studentId],
    );
    const credentials = await pool.query(
      'SELECT "eventRegistrationId" FROM "EventParticipantQrCredentials"',
    );
    expect(registrations.rowCount).toBe(1);
    expect(participants.rowCount).toBe(3);
    expect(participants.rows.every((row) => row.eventRegistrationId === registrations.rows[0].eventRegistrationId)).toBe(true);
    expect(credentials.rows[0].eventRegistrationId).toBe(registrations.rows[0].eventRegistrationId);
    await backfillEventRegistrations(pool);
    await backfillEventRegistrations(pool);
    const afterRetry = await pool.query('SELECT COUNT(*)::int AS count FROM "EventRegistrations" WHERE "eventId" = $1', [eventId]);
    expect(afterRetry.rows[0].count).toBe(1);

    const [pass] = await q.listEventParticipantTokens(pool, eventId);
    const preview = await service.preview({ eventId, qrPayload: pass!.token, sessionWindowId: morningId });
    expect(preview.student.id).toBe(studentId);

    fakeNow = new Date(2026, 8, 6, 8, 5);
    const dayTwoPreview = await service.preview({ eventId, qrPayload: pass!.token });
    expect(dayTwoPreview.direction.direction).toBe(DIRECTION.in);
    expect(dayTwoPreview.window.id).toBe(dayTwo.id);
    await q.revokeEventParticipantToken(pool, pass!.token_id, adminId);
    await expectRejected(
      service.preview({ eventId, qrPayload: pass!.token, sessionWindowId: dayTwo.id }),
      { statusCode: 404 },
    );

    await q.closeSessionAndAssessFines(pool, dayTwo.id, adminId);
    const absent = await pool.query(
      'SELECT "attendanceStatusCode" FROM "AttendanceSessionStatus" WHERE "eventSessionId" = $1 AND "studentId" = $2',
      [dayTwo.id, studentId],
    );
    expect(absent.rows[0].attendanceStatusCode).toBe('ABSENT');
    const roster = await q.listEventParticipants(pool, eventId);
    expect(roster.rows[0]?.sessions?.find((session) => session.session_id === dayTwo.id)?.status).toBe('ABSENT');
    const lateStudent = await q.insertStudent(pool, {
      studentIdCode: 'STU-2026-0002', fullName: 'Late Registrant', section: 'BSIT-3A', photoUrl: null,
    });
    await q.addParticipantsToEvent(pool, eventId, [lateStudent.id], adminId);
    const lateRoster = await q.listEventParticipants(pool, eventId);
    expect(lateRoster.rows.find((row) => row.student_id === lateStudent.id)?.sessions?.find((session) => session.session_id === dayTwo.id)?.status).toBe('ABSENT');
  });

  it('rejects scans outside roster and permits checkout during its cutoff', async () => {
    if (!dbReady) return;
    const unregistered = await q.insertStudent(pool, {
      studentIdCode: 'STU-2026-9999',
      fullName: 'Unregistered Student',
      section: 'BSIT-3A',
      photoUrl: null,
    });
    await expectRejected(
      service.preview({ eventId, qrPayload: unregistered.student_id_code, sessionWindowId: morningId }),
      { statusCode: 409 },
    );
    await q.updateWindow(pool, morningId, {
      startTime: '07:00', endTime: '12:00', outEnd: '12:30',
    });
    service.invalidateEvent(eventId);
    await service.confirm({ eventId, studentId, sessionWindowId: morningId, scannedBy: moderatorId });
    fakeNow = new Date(2026, 8, 5, 12, 3);
    const preview = await service.preview({ eventId, qrPayload: 'STU-2026-0001' });
    expect(preview.direction.direction).toBe(DIRECTION.out);
    await service.confirm({ eventId, studentId, sessionWindowId: morningId, scannedBy: moderatorId });
    const record = await pool.query(
      `SELECT ar."checkedInAtUtc", ar."checkedOutAtUtc" FROM "AttendanceRecords" ar
       JOIN "EventParticipants" ep ON ep."eventParticipantId" = ar."eventParticipantId"
       WHERE ep."eventSessionId" = $1 AND ep."studentId" = $2`,
      [morningId, studentId],
    );
    expect(record.rowCount).toBe(1);
    expect(record.rows[0].checkedOutAtUtc).toBeDefined();
  });

  it('backfills legacy session rows without losing scans and restores QR passes', async () => {
    if (!dbReady) return;
    await service.confirm({ eventId, studentId, sessionWindowId: morningId, scannedBy: moderatorId });
    const [pass] = await q.listEventParticipantTokens(pool, eventId);
    await pool.query('UPDATE "EventParticipants" SET "eventRegistrationId" = NULL WHERE "studentId" = $1', [studentId]);
    await pool.query('DELETE FROM "EventParticipantQrCredentials"');
    await pool.query('DELETE FROM "EventRegistrations" WHERE "eventId" = $1', [eventId]);

    await backfillEventRegistrations(pool);
    const restored = await pool.query(
      `SELECT COUNT(*)::int AS count FROM "EventParticipants"
       WHERE "studentId" = $1 AND "eventRegistrationId" IS NOT NULL`,
      [studentId],
    );
    const scans = await pool.query('SELECT COUNT(*)::int AS count FROM "AttendanceLogs"');
    const [restoredPass] = await q.listEventParticipantTokens(pool, eventId);
    expect(restored.rows[0].count).toBe(2);
    expect(scans.rows[0].count).toBe(1);
    expect(restoredPass!.token).toBeDefined();
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

    it('manual override after check-in close still records a late IN', async () => {
      if (!dbReady) return;
      fakeNow = new Date(2026, 8, 5, 18, 0);
      const p = await service.preview({
        eventId,
        qrPayload: 'STU-2026-0001',
        sessionWindowId: afternoonId,
      });
      expect(p.window.id).toBe(afternoonId);
      expect(p.direction.direction).toBe(DIRECTION.in);
      expect(p.direction.canScan).toBe(true);
      expect(previewToApi(p).is_late).toBe(true);

      await service.confirm({
        eventId,
        studentId,
        sessionWindowId: afternoonId,
        scannedBy: moderatorId,
        allowLateManualCheckIn: true,
      });
      const status = await pool.query(
        'SELECT "attendanceStatusCode" FROM "AttendanceSessionStatus" WHERE "eventSessionId" = $1 AND "studentId" = $2',
        [afternoonId, studentId],
      );
      expect(status.rows[0].attendanceStatusCode).toBe('LATE');
    });

    it('late IN after the late cutoff is allowed and marked LATE', async () => {
      if (!dbReady) return;
      await q.updateWindow(pool, morningId, {
        startTime: '07:00',
        endTime: '12:00',
        lateAfter: '07:30',
        inEnd: '08:30',
      });
      service.invalidateEvent(eventId);
      fakeNow = new Date(2026, 8, 5, 10, 43);
      const p = await service.preview({
        eventId,
        qrPayload: 'STU-2026-0001',
        sessionWindowId: morningId,
      });
      expect(p.direction.direction).toBe(DIRECTION.in);
      expect(previewToApi(p).is_late).toBe(true);
      await service.confirm({
        eventId,
        studentId,
        sessionWindowId: morningId,
        scannedBy: moderatorId,
      });
      const status = await pool.query(
        'SELECT "attendanceStatusCode" FROM "AttendanceSessionStatus" WHERE "eventSessionId" = $1 AND "studentId" = $2',
        [morningId, studentId],
      );
      expect(status.rows[0].attendanceStatusCode).toBe('LATE');
    });

    it('IN before the late cutoff is PRESENT', async () => {
      if (!dbReady) return;
      await q.updateWindow(pool, morningId, {
        startTime: '07:00',
        endTime: '12:00',
        lateAfter: '08:45',
        inEnd: '09:00',
      });
      service.invalidateEvent(eventId);
      fakeNow = new Date(2026, 8, 5, 8, 30);
      await service.confirm({
        eventId,
        studentId,
        sessionWindowId: morningId,
        scannedBy: moderatorId,
      });
      const status = await pool.query(
        'SELECT "attendanceStatusCode" FROM "AttendanceSessionStatus" WHERE "eventSessionId" = $1 AND "studentId" = $2',
        [morningId, studentId],
      );
      expect(status.rows[0].attendanceStatusCode).toBe('PRESENT');
    });

    it('checkout after its window still requires the session to be open', async () => {
      if (!dbReady) return;
      fakeNow = new Date(2026, 8, 5, 14, 0);
      await service.confirm({
        eventId,
        studentId,
        sessionWindowId: afternoonId,
        scannedBy: moderatorId,
      });
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
        eventStartDate: new Date(2026, 8, 6),
        eventEndDate: new Date(2026, 8, 6),
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

  describe('deleteEvent', () => {
    it('removes an event that still has session windows', async () => {
      if (!dbReady) return;
      await pool.query(`
        ALTER TABLE "EventSessions" DROP CONSTRAINT IF EXISTS fk_event_sessions_event;
        ALTER TABLE "EventSessions" ADD CONSTRAINT fk_event_sessions_event
          FOREIGN KEY ("eventId", "academicTermId")
          REFERENCES "Events"("eventId", "academicTermId");
      `);
      try {
        await q.deleteEvent(pool, eventId);
        expect(await q.getEventById(pool, eventId)).toBeNull();
        expect(await q.windowsForEvent(pool, eventId)).toEqual([]);
      } finally {
        await pool.query(`
          ALTER TABLE "EventSessions" DROP CONSTRAINT IF EXISTS fk_event_sessions_event;
          ALTER TABLE "EventSessions" ADD CONSTRAINT fk_event_sessions_event
            FOREIGN KEY ("eventId", "academicTermId")
            REFERENCES "Events"("eventId", "academicTermId") ON DELETE CASCADE;
        `);
      }
    });

    it('removes an event after scans even when attendance logs are append-only', async () => {
      if (!dbReady) return;
      await service.confirm({
        eventId,
        studentId,
        sessionWindowId: morningId,
        scannedBy: moderatorId,
      });
      await pool.query(`
        CREATE OR REPLACE FUNCTION fn_tr_attendance_logs_append_only()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION 'Attendance logs are append-only.' USING ERRCODE = '52515';
        END;
        $$;
        DROP TRIGGER IF EXISTS tr_attendance_logs_append_only ON "AttendanceLogs";
        CREATE TRIGGER tr_attendance_logs_append_only
          BEFORE UPDATE OR DELETE ON "AttendanceLogs"
          FOR EACH ROW EXECUTE FUNCTION fn_tr_attendance_logs_append_only();
      `);
      try {
        await q.deleteEvent(pool, eventId);
        expect(await q.getEventById(pool, eventId)).toBeNull();
      } finally {
        await pool.query(`DROP TRIGGER IF EXISTS tr_attendance_logs_append_only ON "AttendanceLogs"`);
      }
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
