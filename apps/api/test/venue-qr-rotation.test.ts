import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import type { Pool } from 'pg';
import crypto from 'node:crypto';

import { hashPassword } from '../src/auth/password.ts';
import * as q from '../src/db/queries.ts';
import { closeTestDatabase, openTestDatabase } from './support/database.ts';

const SCHEMA = 'ssc_venue_qr_rotation_test';

describe('Venue QR rotation & Student self-scan flow', () => {
  let pool: Pool;
  let dbReady = false;
  let adminId = 0;
  let studentUserId = 0;
  let studentId = 0;
  let eventSessionId = 0;

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
      `TRUNCATE "AttendanceScanAttempts", "AttendanceLogs", "AttendanceRecords",
               "EventParticipants", "EventSessionQrTokens", "EventSessions", "Events",
               "StudentUserLinks", "Students", "Users"
       RESTART IDENTITY CASCADE`,
    );

    // 1. Create Admin user
    const admin = await q.insertUser(pool, {
      name: 'Admin User',
      username: 'admin',
      passwordHash: hashPassword('password123', 1000),
      role: 'superadmin',
    });

    // 2. Create Student User & Student Roster Profile
    const studentUser = await q.insertUser(pool, {
      name: 'Student User',
      username: '02-26-0118',
      passwordHash: hashPassword('password123', 1000),
      role: 'student',
    });

    const studentRow = await q.insertStudent(pool, {
      studentIdCode: '02-26-0118',
      fullName: 'Test Student',
      section: 'A',
      photoUrl: null,
    });

    await q.linkUserToStudent(pool, {
      userId: studentUser.id,
      studentId: studentRow.id,
      linkedByUserId: admin.id,
    });

    // 3. Create Event & Session Window
    const event = await q.insertEvent(pool, {
      name: 'Campus Assembly',
      eventStartDate: new Date(),
      eventEndDate: new Date(),
      isActive: true,
      createdBy: admin.id,
    });

    const session = await q.insertWindow(pool, {
      eventId: event.id,
      sessionLabel: 'Main Session',
      startTime: '06:00',
      endTime: '23:59',
      sortOrder: 0,
    });

    await q.publishEvent(pool, event.id, admin.id);
    await q.addParticipantsToEvent(pool, event.id, [studentRow.id], admin.id);

    adminId = admin.id;
    studentUserId = studentUser.id;
    studentId = studentRow.id;
    eventSessionId = session.id;
  });

  it('skips test if Postgres DB unavailable', () => {
    if (!dbReady) console.warn('Postgres DB not available');
    expect(true).toBe(true);
  });

  it('issues Venue QR code, accepts self-scan, revokes token, and issues NEW distinct QR code', async () => {
    if (!dbReady) return;

    // STEP 1: Issue 1st Venue QR Token
    const rawToken1 = crypto.randomBytes(32).toString('hex');
    const tokenHash1 = crypto.createHash('sha256').update(rawToken1).digest();

    const issued1 = await q.issueEventSessionQrToken(pool, {
      eventSessionId,
      actionCode: 'IN',
      tokenHash: tokenHash1,
      validForSeconds: 15,
      overlapSeconds: 5,
      actorUserId: adminId,
    });

    expect(issued1.eventSessionQrTokenId).toBeDefined();

    // STEP 2: Student self-scans Token 1
    const clientReqId1 = crypto.randomUUID();
    const result1 = await q.attendanceSelfScanEventQr(pool, {
      tokenHash: tokenHash1,
      authenticatedUserId: studentUserId,
      clientRequestId: clientReqId1,
      clientFingerprintHash: null,
      ipAddress: '127.0.0.1',
    });

    expect(result1.scanResultCode).toBe('ACCEPTED');
    expect(result1.actionRecorded).toBe('IN');

    // STEP 3: Issue 2nd Venue QR Token (simulating VenueQrModal refresh)
    const rawToken2 = crypto.randomBytes(32).toString('hex');
    const tokenHash2 = crypto.createHash('sha256').update(rawToken2).digest();

    const issued2 = await q.issueEventSessionQrToken(pool, {
      eventSessionId,
      actionCode: 'IN',
      tokenHash: tokenHash2,
      validForSeconds: 15,
      overlapSeconds: 5,
      actorUserId: adminId,
    });

    expect(issued2.eventSessionQrTokenId).not.toEqual(issued1.eventSessionQrTokenId);
    expect(rawToken2).not.toEqual(rawToken1);

    // STEP 4: Attempting to scan Token 1 AGAIN should be REJECTED as REVOKED_QR_TOKEN
    const clientReqId2 = crypto.randomUUID();
    const result2 = await q.attendanceSelfScanEventQr(pool, {
      tokenHash: tokenHash1,
      authenticatedUserId: studentUserId,
      clientRequestId: clientReqId2,
      clientFingerprintHash: null,
      ipAddress: '127.0.0.1',
    });

    expect(result2.scanResultCode).toBe('REJECTED');
    expect(result2.failureReasonCode).toBe('REVOKED_QR_TOKEN');
  });
});
