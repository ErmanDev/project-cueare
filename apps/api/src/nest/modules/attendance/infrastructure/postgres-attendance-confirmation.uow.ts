import type { Pool } from 'pg';

import { withTransaction } from '../../../../db/pool.ts';
import * as queries from '../../../../db/queries.ts';
import { q } from '../../../../db/ident.ts';
import { SCAN_STATUS, type Queryable } from '../../../../types.ts';
import {
  AttendanceConfirmationTransaction,
  AttendanceConfirmationUnitOfWork,
  type AttendanceConfirmationEvent,
  type AttendanceIdempotencyClaim,
  type AttendanceConfirmationRecord,
} from '../application/ports/attendance-confirmation.uow.ts';
import type { AttendancePreviewScan } from '../application/ports/attendance-preview.reader.ts';
import type { AttendanceWindow } from '../application/ports/attendance-window.repository.ts';

class PostgresAttendanceConfirmationTransaction extends AttendanceConfirmationTransaction {
  constructor(private readonly db: Queryable) {
    super();
  }

  async claimIdempotency(args: {
    actorUserId: number;
    key: string;
    requestHash: string;
  }): Promise<AttendanceIdempotencyClaim> {
    await this.db.query(
      `DELETE FROM ${q('AttendanceConfirmationIdempotency')}
       WHERE ${q('actorUserId')} = $1 AND ${q('idempotencyKey')} = $2
         AND ${q('expiresAtUtc')} <= clock_timestamp()`,
      [args.actorUserId, args.key],
    );
    const inserted = await this.db.query<{ id: number }>(
      `INSERT INTO ${q('AttendanceConfirmationIdempotency')} (
         ${q('actorUserId')}, ${q('idempotencyKey')}, ${q('requestHash')}
       ) VALUES ($1, $2, $3)
       ON CONFLICT (${q('actorUserId')}, ${q('idempotencyKey')}) DO NOTHING
       RETURNING ${q('attendanceConfirmationIdempotencyId')} AS id`,
      [args.actorUserId, args.key, args.requestHash],
    );
    if ((inserted.rowCount ?? 0) > 0) return { kind: 'claimed' };

    const existing = await this.db.query<{
      request_hash: string;
      response_payload: AttendanceConfirmationRecord | null;
    }>(
      `SELECT ${q('requestHash')} AS request_hash,
              ${q('responsePayload')} AS response_payload
       FROM ${q('AttendanceConfirmationIdempotency')}
       WHERE ${q('actorUserId')} = $1 AND ${q('idempotencyKey')} = $2`,
      [args.actorUserId, args.key],
    );
    const row = existing.rows[0];
    if (!row || row.request_hash !== args.requestHash || !row.response_payload) {
      return { kind: 'conflict' };
    }
    return {
      kind: 'replay',
      record: {
        ...row.response_payload,
        scanned_at: new Date(row.response_payload.scanned_at),
        updated_at: new Date(row.response_payload.updated_at),
      },
    };
  }

  async completeIdempotency(args: {
    actorUserId: number;
    key: string;
    record: AttendanceConfirmationRecord;
  }): Promise<void> {
    const updated = await this.db.query(
      `UPDATE ${q('AttendanceConfirmationIdempotency')}
       SET ${q('responsePayload')} = $3::jsonb
       WHERE ${q('actorUserId')} = $1 AND ${q('idempotencyKey')} = $2`,
      [args.actorUserId, args.key, JSON.stringify(args.record)],
    );
    if ((updated.rowCount ?? 0) !== 1) {
      throw new Error('Attendance idempotency claim disappeared before completion.');
    }
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
    await this.db.query(
      `INSERT INTO ${q('AuditEvents')} (
         ${q('requestId')}, ${q('actorUserId')}, ${q('actionCode')},
         ${q('targetType')}, ${q('targetId')}, ${q('contextPayload')},
         ${q('beforeState')}, ${q('afterState')}
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb)`,
      [
        args.requestId,
        args.actorUserId,
        args.actionCode,
        args.targetType,
        args.targetId,
        JSON.stringify(args.context),
        args.beforeState ? JSON.stringify(args.beforeState) : null,
        JSON.stringify(args.afterState),
      ],
    );
  }

  lockStudentSession(studentId: number, sessionWindowId: number): Promise<void> {
    return queries.lockStudentSession(this.db, studentId, sessionWindowId);
  }

  findEvent(eventId: number): Promise<AttendanceConfirmationEvent | null> {
    return queries.getEventById(this.db, eventId);
  }

  async deactivateEvent(eventId: number): Promise<void> {
    await queries.deactivateEvent(this.db, eventId);
  }

  findWindow(sessionWindowId: number): Promise<AttendanceWindow | null> {
    return queries.getWindowById(this.db, sessionWindowId);
  }

  async studentExists(studentId: number): Promise<boolean> {
    return Boolean(await queries.getStudentById(this.db, studentId));
  }

  async isRegisteredForSession(args: {
    eventId: number;
    studentId: number;
    sessionWindowId: number;
  }): Promise<boolean> {
    return Boolean(
      await queries.getRegisteredSessionParticipant(
        this.db,
        args.eventId,
        args.studentId,
        args.sessionWindowId,
      ),
    );
  }

  listConfirmedScansForUpdate(args: {
    eventId: number;
    studentId: number;
    sessionWindowId: number;
  }): Promise<AttendancePreviewScan[]> {
    return queries.confirmedLogs(this.db, args, true);
  }

  insertConfirmedAttendance(args: {
    eventId: number;
    studentId: number;
    sessionWindowId: number;
    direction: string;
    scannedAt: Date;
    scannedBy: number;
    deviceNote: string | null;
  }): Promise<AttendanceConfirmationRecord> {
    return queries.insertAttendance(this.db, {
      ...args,
      status: SCAN_STATUS.confirmed,
    });
  }
}

export class PostgresAttendanceConfirmationUnitOfWork extends AttendanceConfirmationUnitOfWork {
  constructor(private readonly pool: Pool) {
    super();
  }

  execute<T>(
    work: (transaction: AttendanceConfirmationTransaction) => Promise<T>,
  ): Promise<T> {
    return withTransaction(this.pool, (client) =>
      work(new PostgresAttendanceConfirmationTransaction(client)),
    );
  }
}
