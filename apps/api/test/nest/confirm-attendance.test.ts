import { describe, expect, it } from 'bun:test';

import {
  ConfirmAttendanceRejected,
  ConfirmAttendanceUseCase,
  type ConfirmAttendanceCommand,
} from '../../src/nest/modules/attendance/application/confirm-attendance.use-case.ts';
import {
  AttendanceConfirmationTransaction,
  AttendanceConfirmationUnitOfWork,
  type AttendanceConfirmationEvent,
  type AttendanceIdempotencyClaim,
  type AttendanceConfirmationRecord,
} from '../../src/nest/modules/attendance/application/ports/attendance-confirmation.uow.ts';
import type { AttendancePreviewScan } from '../../src/nest/modules/attendance/application/ports/attendance-preview.reader.ts';
import type { AttendanceWindow } from '../../src/nest/modules/attendance/application/ports/attendance-window.repository.ts';

class FakeConfirmationTransaction extends AttendanceConfirmationTransaction {
  readonly calls: string[] = [];
  event: AttendanceConfirmationEvent | null = {
    id: 1,
    name: 'Founders Day',
    event_start_date: new Date(2026, 8, 5),
    event_end_date: new Date(2026, 8, 5),
    is_active: true,
  };
  window: AttendanceWindow | null = {
    id: 10,
    event_id: 1,
    session_label: 'Morning',
    start_time: '07:00',
    end_time: '12:00',
    sort_order: 0,
  };
  registered = true;
  studentPresent = true;
  scans: AttendancePreviewScan[] = [];
  readonly idempotency = new Map<
    string,
    { requestHash: string; record?: AttendanceConfirmationRecord }
  >();
  readonly auditEvents: Array<{
    requestId: string;
    actorUserId: number;
    actionCode: string;
    targetType: string;
    targetId: string;
    context: Record<string, unknown>;
    beforeState: Record<string, unknown> | null;
    afterState: Record<string, unknown>;
  }> = [];

  async claimIdempotency(args: {
    actorUserId: number;
    key: string;
    requestHash: string;
  }): Promise<AttendanceIdempotencyClaim> {
    this.calls.push('idempotency-claim');
    const mapKey = `${args.actorUserId}:${args.key}`;
    const existing = this.idempotency.get(mapKey);
    if (!existing) {
      this.idempotency.set(mapKey, { requestHash: args.requestHash });
      return { kind: 'claimed' };
    }
    if (existing.requestHash !== args.requestHash || !existing.record) {
      return { kind: 'conflict' };
    }
    return { kind: 'replay', record: existing.record };
  }

  async completeIdempotency(args: {
    actorUserId: number;
    key: string;
    record: AttendanceConfirmationRecord;
  }): Promise<void> {
    this.calls.push('idempotency-complete');
    const mapKey = `${args.actorUserId}:${args.key}`;
    const existing = this.idempotency.get(mapKey);
    if (!existing) throw new Error('Missing fake idempotency claim');
    existing.record = args.record;
  }

  async appendAuditEvent(args: {
    requestId: string;
    actorUserId: number;
    actionCode: string;
    targetType: string;
    targetId: string;
    context: Record<string, unknown>;
    beforeState: Record<string, unknown> | null;
    afterState: Record<string, unknown>;
  }): Promise<void> {
    this.calls.push('audit');
    this.auditEvents.push(args);
  }

  async lockStudentSession(): Promise<void> {
    this.calls.push('lock');
  }

  async findEvent(): Promise<AttendanceConfirmationEvent | null> {
    this.calls.push('event');
    return this.event;
  }

  async deactivateEvent(): Promise<void> {
    this.calls.push('deactivate');
  }

  async findWindow(): Promise<AttendanceWindow | null> {
    this.calls.push('window');
    return this.window;
  }

  async studentExists(): Promise<boolean> {
    this.calls.push('student');
    return this.studentPresent;
  }

  async isRegisteredForSession(): Promise<boolean> {
    this.calls.push('registration');
    return this.registered;
  }

  async listConfirmedScansForUpdate(): Promise<AttendancePreviewScan[]> {
    this.calls.push('history-for-update');
    return this.scans;
  }

  async insertConfirmedAttendance(args: {
    eventId: number;
    studentId: number;
    sessionWindowId: number;
    direction: string;
    scannedAt: Date;
    scannedBy: number;
    deviceNote: string | null;
  }): Promise<AttendanceConfirmationRecord> {
    this.calls.push('insert');
    return {
      id: 99,
      event_id: args.eventId,
      student_id: args.studentId,
      session_window_id: args.sessionWindowId,
      direction: args.direction,
      scanned_at: args.scannedAt,
      scanned_by: args.scannedBy,
      status: 'confirmed',
      device_note: args.deviceNote,
      updated_at: args.scannedAt,
    };
  }
}

class FakeConfirmationUnitOfWork extends AttendanceConfirmationUnitOfWork {
  constructor(readonly transaction: FakeConfirmationTransaction) {
    super();
  }

  execute<T>(
    work: (transaction: AttendanceConfirmationTransaction) => Promise<T>,
  ): Promise<T> {
    return work(this.transaction);
  }
}

const command = (overrides: Partial<ConfirmAttendanceCommand> = {}): ConfirmAttendanceCommand => ({
  eventId: 1,
  studentId: 7,
  sessionWindowId: 10,
  scannedBy: 2,
  scannedAt: new Date(2026, 8, 5, 8, 0),
  deviceNote: null,
  requestId: 'confirm-use-case-test',
  ...overrides,
});

async function rejection(
  promise: Promise<unknown>,
): Promise<ConfirmAttendanceRejected> {
  try {
    await promise;
    throw new Error('Expected confirmation to be rejected');
  } catch (error) {
    expect(error).toBeInstanceOf(ConfirmAttendanceRejected);
    return error as ConfirmAttendanceRejected;
  }
}

describe('ConfirmAttendanceUseCase', () => {
  it('locks before reading and inserts the computed IN direction', async () => {
    const transaction = new FakeConfirmationTransaction();
    const result = await new ConfirmAttendanceUseCase(
      new FakeConfirmationUnitOfWork(transaction),
    ).execute(command());

    expect(result.direction).toBe('IN');
    expect(transaction.calls).toEqual([
      'lock',
      'event',
      'window',
      'student',
      'registration',
      'history-for-update',
      'insert',
      'audit',
    ]);
    expect(transaction.auditEvents[0]).toMatchObject({
      requestId: 'confirm-use-case-test',
      actorUserId: 2,
      actionCode: 'ATTENDANCE_CONFIRMED',
      targetType: 'AttendanceLog',
      targetId: '99',
      context: { eventId: 1, studentId: 7, sessionWindowId: 10 },
      beforeState: { confirmedDirections: [] },
      afterState: { attendanceLogId: 99, direction: 'IN', status: 'confirmed' },
    });
  });

  it('rejects a stale expected direction without inserting', async () => {
    const transaction = new FakeConfirmationTransaction();
    transaction.scans = [{ direction: 'IN', scanned_at: new Date(2026, 8, 5, 8, 0) }];
    const error = await rejection(
      new ConfirmAttendanceUseCase(new FakeConfirmationUnitOfWork(transaction)).execute(
        command({ expectedDirection: 'IN' }),
      ),
    );
    expect(error.reason).toBe('DIRECTION_CHANGED');
    expect(transaction.calls).not.toContain('insert');
  });

  it('allows a manual late check-in after the automatic session boundary', async () => {
    const transaction = new FakeConfirmationTransaction();
    const useCase = new ConfirmAttendanceUseCase(new FakeConfirmationUnitOfWork(transaction));
    const result = await useCase.execute(
      command({
        scannedAt: new Date(2026, 8, 5, 13, 0),
        expectedDirection: 'IN',
        allowLateManualCheckIn: true,
      }),
    );
    expect(result.direction).toBe('IN');
  });

  it('rejects an automatic check-in after the session boundary', async () => {
    const transaction = new FakeConfirmationTransaction();
    const error = await rejection(
      new ConfirmAttendanceUseCase(new FakeConfirmationUnitOfWork(transaction)).execute(
        command({ scannedAt: new Date(2026, 8, 5, 13, 0) }),
      ),
    );
    expect(error.reason).toBe('SCAN_NOT_ALLOWED');
    expect((error.context.issue as { code: string }).code).toBe('SESSION_ENDED');
  });

  it('attempts expired-event deactivation inside the unit of work before rejecting', async () => {
    const transaction = new FakeConfirmationTransaction();
    const error = await rejection(
      new ConfirmAttendanceUseCase(new FakeConfirmationUnitOfWork(transaction)).execute(
        command({ scannedAt: new Date(2026, 8, 6, 8, 0) }),
      ),
    );
    expect(error.reason).toBe('EVENT_DATE_PASSED');
    expect(transaction.calls).toEqual(['lock', 'event', 'deactivate']);
  });

  it('replays a completed confirmation without executing attendance logic twice', async () => {
    const transaction = new FakeConfirmationTransaction();
    const useCase = new ConfirmAttendanceUseCase(new FakeConfirmationUnitOfWork(transaction));
    const idempotentCommand = command({
      idempotencyKey: 'scan-request-001',
      requestHash: 'a'.repeat(64),
    });

    const created = await useCase.execute(idempotentCommand);
    const replayed = await useCase.execute(idempotentCommand);

    expect(replayed).toEqual(created);
    expect(transaction.calls.filter((call) => call === 'insert')).toHaveLength(1);
    expect(transaction.calls.filter((call) => call === 'idempotency-claim')).toHaveLength(2);
    expect(transaction.calls.filter((call) => call === 'idempotency-complete')).toHaveLength(1);
    expect(transaction.auditEvents).toHaveLength(1);
  });

  it('rejects reuse of a key with a different request hash', async () => {
    const transaction = new FakeConfirmationTransaction();
    const useCase = new ConfirmAttendanceUseCase(new FakeConfirmationUnitOfWork(transaction));
    await useCase.execute(command({
      idempotencyKey: 'scan-request-002',
      requestHash: 'a'.repeat(64),
    }));

    const error = await rejection(useCase.execute(command({
      idempotencyKey: 'scan-request-002',
      requestHash: 'b'.repeat(64),
    })));

    expect(error.reason).toBe('IDEMPOTENCY_CONFLICT');
    expect(transaction.calls.filter((call) => call === 'insert')).toHaveLength(1);
  });
});
