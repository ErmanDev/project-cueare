import type { AttendancePreviewScan } from './attendance-preview.reader.ts';
import type { AttendanceWindow } from './attendance-window.repository.ts';

export type AttendanceConfirmationEvent = {
  id: number;
  name: string;
  event_start_date: Date;
  event_end_date: Date;
  is_active: boolean;
};

export type AttendanceConfirmationRecord = {
  id: number;
  event_id: number;
  student_id: number;
  session_window_id: number;
  direction: string;
  scanned_at: Date;
  scanned_by: number;
  status: string;
  device_note: string | null;
  updated_at: Date;
};

export type AttendanceIdempotencyClaim =
  | { kind: 'claimed' }
  | { kind: 'replay'; record: AttendanceConfirmationRecord }
  | { kind: 'conflict' };

export abstract class AttendanceConfirmationTransaction {
  abstract claimIdempotency(args: {
    actorUserId: number;
    key: string;
    requestHash: string;
  }): Promise<AttendanceIdempotencyClaim>;
  abstract completeIdempotency(args: {
    actorUserId: number;
    key: string;
    record: AttendanceConfirmationRecord;
  }): Promise<void>;
  abstract appendAuditEvent(args: {
    requestId: string;
    actorUserId: number;
    actionCode: string;
    targetType: string;
    targetId: string;
    context: Record<string, unknown>;
    beforeState: Record<string, unknown> | null;
    afterState: Record<string, unknown>;
  }): Promise<void>;
  abstract lockStudentSession(studentId: number, sessionWindowId: number): Promise<void>;
  abstract findEvent(eventId: number): Promise<AttendanceConfirmationEvent | null>;
  abstract deactivateEvent(eventId: number): Promise<void>;
  abstract findWindow(sessionWindowId: number): Promise<AttendanceWindow | null>;
  abstract studentExists(studentId: number): Promise<boolean>;
  abstract isRegisteredForSession(args: {
    eventId: number;
    studentId: number;
    sessionWindowId: number;
  }): Promise<boolean>;
  abstract listConfirmedScansForUpdate(args: {
    eventId: number;
    studentId: number;
    sessionWindowId: number;
  }): Promise<AttendancePreviewScan[]>;
  abstract insertConfirmedAttendance(args: {
    eventId: number;
    studentId: number;
    sessionWindowId: number;
    direction: string;
    scannedAt: Date;
    scannedBy: number;
    deviceNote: string | null;
  }): Promise<AttendanceConfirmationRecord>;
}

export abstract class AttendanceConfirmationUnitOfWork {
  abstract execute<T>(
    work: (transaction: AttendanceConfirmationTransaction) => Promise<T>,
  ): Promise<T>;
}
