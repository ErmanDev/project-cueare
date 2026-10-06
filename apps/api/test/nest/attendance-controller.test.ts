import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Module } from '@nestjs/common';

import { issueToken } from '../../src/auth/jwt.ts';
import type { AttendanceService, ScanPreview } from '../../src/attendance/service.ts';
import { createMigrationHost } from '../../src/nest/compatibility/create-migration-host.ts';
import { AttendanceModule } from '../../src/nest/modules/attendance/attendance.module.ts';
import { ROLES, type AttendanceLogRow, type EventRow, type StudentRow } from '../../src/types.ts';

const now = new Date('2026-09-05T00:00:00.000Z');
const student: StudentRow = {
  id: 21,
  student_id_code: 'STU-0021',
  first_name: 'Test',
  middle_name: null,
  last_name: 'Student',
  full_name: 'Test Student',
  course: 'BSIT',
  year_level: 2,
  section: 'A',
  photo_url: null,
  user_id: null,
  created_at: now,
  updated_at: now,
};
const event: EventRow = {
  id: 5,
  academic_term_id: 1,
  name: 'Foundation Day',
  event_status: 'PUBLISHED',
  event_start_date: now,
  event_end_date: now,
  is_active: true,
  created_by: 1,
  created_at: now,
  updated_at: now,
};

let lastConfirmArgs: { scannedBy: number; requestId?: string } | undefined;

const fakeAttendance = {
  async preview(): Promise<ScanPreview> {
    return {
      student,
      event,
      window: {
        id: 9,
        event_id: event.id,
        session_label: 'Morning',
        start_time: '07:00',
        end_time: '12:00',
        sort_order: 0,
      },
      direction: { direction: 'IN', existing: [], canScan: true },
      serverTime: new Date('2026-09-05T08:00:00.000Z'),
      sessionMode: 'auto',
      existing: [],
    };
  },
  async confirm(args: { scannedBy: number; requestId?: string }): Promise<AttendanceLogRow> {
    lastConfirmArgs = args;
    return {
      id: 100,
      event_id: event.id,
      student_id: student.id,
      session_window_id: 9,
      direction: 'IN',
      scanned_at: new Date('2026-09-05T08:00:00.000Z'),
      scanned_by: args.scannedBy,
      status: 'confirmed',
      device_note: null,
      updated_at: new Date('2026-09-05T08:00:00.000Z'),
    };
  },
} as unknown as AttendanceService;

@Module({ imports: [AttendanceModule.register(fakeAttendance)] })
class TestAttendanceAppModule {}

describe('native Nest attendance writes', () => {
  let url = '';
  let close: () => Promise<void> = async () => {};
  const moderatorToken = issueToken({ id: 12, username: 'moderator', role: ROLES.moderator });

  beforeAll(async () => {
    const { nestApp, httpServer } = await createMigrationHost(
      fakeAttendance,
      TestAttendanceAppModule,
    );
    await new Promise<void>((resolve, reject) => {
      httpServer.once('listening', resolve);
      httpServer.once('error', reject);
      httpServer.listen(0, '127.0.0.1');
    });
    const { port } = httpServer.address() as AddressInfo;
    url = `http://127.0.0.1:${port}`;
    close = async () => {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
      await nestApp.close();
    };
  });

  afterAll(async () => close());

  it('returns a v2 preview envelope for moderators', async () => {
    const response = await fetch(`${url}/api/v2/attendance/scan/preview`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${moderatorToken}`,
        'content-type': 'application/json',
        'x-request-id': 'attendance-preview-test',
      },
      body: JSON.stringify({ event_id: 5, student_id_code: 'STU-0021' }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { computed_direction: 'IN', can_confirm: true },
      meta: { requestId: 'attendance-preview-test' },
    });
  });

  it('creates a confirmed attendance record using the authenticated actor', async () => {
    const response = await fetch(`${url}/api/v2/attendance/scan/confirm`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${moderatorToken}`,
        'content-type': 'application/json',
        'idempotency-key': 'attendance-controller-test-001',
        'x-request-id': 'attendance-confirm-test',
      },
      body: JSON.stringify({
        event_id: 5,
        student_id: 21,
        session_window_id: 9,
        direction: 'IN',
      }),
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      data: { id: 100, scanned_by: 12, status: 'confirmed' },
      meta: { requestId: expect.any(String) },
    });
    expect(lastConfirmArgs).toMatchObject({
      scannedBy: 12,
      requestId: 'attendance-confirm-test',
    });
  });

  it('rejects malformed idempotency keys at the HTTP boundary', async () => {
    const response = await fetch(`${url}/api/v2/attendance/scan/confirm`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${moderatorToken}`,
        'content-type': 'application/json',
        'idempotency-key': 'contains spaces',
      },
      body: JSON.stringify({
        event_id: 5,
        student_id: 21,
        session_window_id: 9,
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'INVALID_IDEMPOTENCY_KEY' },
    });
  });

  it('enforces validation, authentication, and staff roles', async () => {
    const invalid = await fetch(`${url}/api/v2/attendance/scan/preview`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${moderatorToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ event_id: 5 }),
    });
    expect(invalid.status).toBe(400);
    expect((await invalid.json() as any).error.code).toBe('VALIDATION_FAILED');

    const unauthenticated = await fetch(`${url}/api/v2/attendance/scan/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(unauthenticated.status).toBe(401);

    const studentToken = issueToken({ id: 21, username: 'STU-0021', role: ROLES.student });
    const forbidden = await fetch(`${url}/api/v2/attendance/scan/confirm`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${studentToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ event_id: 5, student_id: 21, session_window_id: 9 }),
    });
    expect(forbidden.status).toBe(403);
    expect((await forbidden.json() as any).error.code).toBe('FORBIDDEN');
  });
});
