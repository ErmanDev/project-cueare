import { isPastDate } from '../../../../utils/time.ts';
import {
  ATTENDANCE_DIRECTION,
  computeDirection,
} from '../domain/attendance-direction.policy.ts';
import {
  evaluateAutomaticScan,
  evaluateManualScan,
} from '../domain/scan-eligibility.policy.ts';
import type {
  AttendanceConfirmationEvent,
  AttendanceConfirmationRecord,
  AttendanceConfirmationUnitOfWork,
} from './ports/attendance-confirmation.uow.ts';

export type ConfirmAttendanceRejectionReason =
  | 'EVENT_NOT_FOUND'
  | 'EVENT_DATE_PASSED'
  | 'EVENT_INACTIVE'
  | 'WINDOW_NOT_FOUND'
  | 'STUDENT_NOT_FOUND'
  | 'NOT_REGISTERED'
  | 'MANUAL_DIRECTION_INVALID'
  | 'SCAN_NOT_ALLOWED'
  | 'ALREADY_COMPLETE'
  | 'DIRECTION_CHANGED'
  | 'IDEMPOTENCY_CONFLICT';

export class ConfirmAttendanceRejected extends Error {
  constructor(
    readonly reason: ConfirmAttendanceRejectionReason,
    readonly context: Record<string, unknown> = {},
  ) {
    super(reason);
  }
}

export type ConfirmAttendanceCommand = {
  eventId: number;
  studentId: number;
  sessionWindowId: number;
  scannedBy: number;
  scannedAt: Date;
  expectedDirection?: string | null;
  deviceNote: string | null;
  allowLateManualCheckIn?: boolean;
  allowLateManualCheckOut?: boolean;
  idempotencyKey?: string;
  requestHash?: string;
  requestId: string;
};

export class ConfirmAttendanceUseCase {
  constructor(private readonly unitOfWork: AttendanceConfirmationUnitOfWork) {}

  execute(command: ConfirmAttendanceCommand): Promise<AttendanceConfirmationRecord> {
    return this.unitOfWork.execute(async (transaction) => {
      if (command.idempotencyKey && command.requestHash) {
        const claim = await transaction.claimIdempotency({
          actorUserId: command.scannedBy,
          key: command.idempotencyKey,
          requestHash: command.requestHash,
        });
        if (claim.kind === 'replay') return claim.record;
        if (claim.kind === 'conflict') {
          throw new ConfirmAttendanceRejected('IDEMPOTENCY_CONFLICT');
        }
      }

      await transaction.lockStudentSession(command.studentId, command.sessionWindowId);
      const event = await transaction.findEvent(command.eventId);
      if (!event) throw new ConfirmAttendanceRejected('EVENT_NOT_FOUND');
      await this.ensureEventUsable(event, command.scannedAt, transaction.deactivateEvent.bind(transaction));

      const window = await transaction.findWindow(command.sessionWindowId);
      if (!window || window.event_id !== command.eventId) {
        throw new ConfirmAttendanceRejected('WINDOW_NOT_FOUND');
      }
      if (!(await transaction.studentExists(command.studentId))) {
        throw new ConfirmAttendanceRejected('STUDENT_NOT_FOUND');
      }
      if (!(await transaction.isRegisteredForSession(command))) {
        throw new ConfirmAttendanceRejected('NOT_REGISTERED');
      }

      const existing = await transaction.listConfirmedScansForUpdate(command);
      const direction = computeDirection(existing);
      const manualAction = command.allowLateManualCheckIn
        ? 'check_in'
        : command.allowLateManualCheckOut
          ? 'check_out'
          : null;
      if (
        manualAction === 'check_in' &&
        command.expectedDirection &&
        command.expectedDirection !== ATTENDANCE_DIRECTION.in
      ) {
        throw new ConfirmAttendanceRejected('MANUAL_DIRECTION_INVALID', { action: manualAction });
      }
      if (
        manualAction === 'check_out' &&
        command.expectedDirection &&
        command.expectedDirection !== ATTENDANCE_DIRECTION.out
      ) {
        throw new ConfirmAttendanceRejected('MANUAL_DIRECTION_INVALID', { action: manualAction });
      }

      const eligibility = manualAction
        ? evaluateManualScan({ event, window, at: command.scannedAt })
        : evaluateAutomaticScan({ event, window, direction, at: command.scannedAt });
      if (eligibility) {
        throw new ConfirmAttendanceRejected('SCAN_NOT_ALLOWED', {
          issue: eligibility,
          manualAction,
          event,
          window,
          at: command.scannedAt,
        });
      }
      if (direction === ATTENDANCE_DIRECTION.alreadyComplete) {
        throw new ConfirmAttendanceRejected('ALREADY_COMPLETE', { window });
      }
      if (command.expectedDirection && command.expectedDirection !== direction) {
        throw new ConfirmAttendanceRejected('DIRECTION_CHANGED', { direction });
      }

      const record = await transaction.insertConfirmedAttendance({
        eventId: command.eventId,
        studentId: command.studentId,
        sessionWindowId: command.sessionWindowId,
        direction,
        scannedAt: command.scannedAt,
        scannedBy: command.scannedBy,
        deviceNote: command.deviceNote,
      });
      await transaction.appendAuditEvent({
        requestId: command.requestId,
        actorUserId: command.scannedBy,
        actionCode: 'ATTENDANCE_CONFIRMED',
        targetType: 'AttendanceLog',
        targetId: String(record.id),
        context: {
          eventId: command.eventId,
          studentId: command.studentId,
          sessionWindowId: command.sessionWindowId,
        },
        beforeState: {
          confirmedDirections: existing.map((scan) => scan.direction),
        },
        afterState: {
          attendanceLogId: record.id,
          direction: record.direction,
          status: record.status,
          scannedAt: record.scanned_at.toISOString(),
        },
      });
      if (command.idempotencyKey && command.requestHash) {
        await transaction.completeIdempotency({
          actorUserId: command.scannedBy,
          key: command.idempotencyKey,
          record,
        });
      }
      return record;
    });
  }

  private async ensureEventUsable(
    event: AttendanceConfirmationEvent,
    at: Date,
    deactivate: (eventId: number) => Promise<void>,
  ): Promise<void> {
    if (isPastDate(event.event_end_date, at)) {
      if (event.is_active) await deactivate(event.id);
      throw new ConfirmAttendanceRejected('EVENT_DATE_PASSED', { event, at });
    }
    if (!event.is_active) {
      throw new ConfirmAttendanceRejected('EVENT_INACTIVE', { event });
    }
  }
}
