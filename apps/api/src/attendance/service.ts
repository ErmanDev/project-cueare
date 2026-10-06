import crypto from 'node:crypto';
import type { Pool } from 'pg';

import { AttendanceCatalog } from './catalog.ts';
import { defaultRuntimeTuning, type RuntimeTuning } from '../config.ts';
import { withTransaction } from '../db/pool.ts';
import * as q from '../db/queries.ts';
import { ScanWriteQueue } from '../infra/queue.ts';
import { computeDirection } from '../nest/modules/attendance/domain/attendance-direction.policy.ts';
import {
  isEarlyCheckOut,
  isLateCheckIn,
  pickWindowForTime,
} from '../nest/modules/attendance/domain/session-window.policy.ts';
import { ResolveAttendanceWindowUseCase } from '../nest/modules/attendance/application/resolve-attendance-window.use-case.ts';
import {
  PreviewAttendanceUseCase,
  type AttendancePreviewDirection,
} from '../nest/modules/attendance/application/preview-attendance.use-case.ts';
import {
  ConfirmAttendanceRejected,
  ConfirmAttendanceUseCase,
} from '../nest/modules/attendance/application/confirm-attendance.use-case.ts';
import { PostgresAttendanceWindowRepository } from '../nest/modules/attendance/infrastructure/postgres-attendance-window.repository.ts';
import { PostgresAttendancePreviewReader } from '../nest/modules/attendance/infrastructure/postgres-attendance-preview.reader.ts';
import { PostgresAttendanceConfirmationUnitOfWork } from '../nest/modules/attendance/infrastructure/postgres-attendance-confirmation.uow.ts';
import { DIRECTION, SCAN_STATUS, type Queryable, type SessionWindowRow } from '../types.ts';
import { ApiError, badRequest, conflict, notFound } from '../utils/errors.ts';
import {
  isPastDate,
  isSameDay,
  minutesOfDay,
  overlaps,
  parseIsoDateTime,
  parseMinutes,
} from '../utils/time.ts';
import {
  extractCandidatePayloads,
  isValidStudentCode,
  requirePayloadSize,
  requireValidStudentCode,
} from '../utils/studentCode.ts';
import type { EventRow, StudentRow, AttendanceLogRow } from '../types.ts';

export { computeDirection } from '../nest/modules/attendance/domain/attendance-direction.policy.ts';
export {
  isEarlyCheckOut,
  isLateCheckIn,
  pickWindowForTime,
} from '../nest/modules/attendance/domain/session-window.policy.ts';

export type DirectionResult = AttendancePreviewDirection;

export type ScanPreview = {
  student: StudentRow;
  event: EventRow;
  window: SessionWindowRow;
  direction: DirectionResult;
  serverTime: Date;
  sessionMode: 'auto' | 'manual';
  existing: AttendancePreviewDirection['existing'];
};

const MAX_DEVICE_NOTE = 200;

export class AttendanceService {
  readonly catalog: AttendanceCatalog;
  private readonly writes: ScanWriteQueue;

  constructor(
    private readonly pool: Pool,
    private readonly opts: {
      clock?: () => Date;
      qrHmacSecret?: string | null;
      catalog?: AttendanceCatalog;
      writeQueue?: ScanWriteQueue;
      runtime?: RuntimeTuning;
      previewUseCase?: PreviewAttendanceUseCase;
      confirmUseCase?: ConfirmAttendanceUseCase;
    } = {},
  ) {
    const tuning = opts.runtime ?? { ...defaultRuntimeTuning(), batchWindowMs: 0 };
    this.catalog = opts.catalog ?? new AttendanceCatalog(pool, tuning);
    this.writes = opts.writeQueue ?? new ScanWriteQueue();
  }

  now(): Date {
    return this.opts.clock ? this.opts.clock() : new Date();
  }

  get qrHmacSecret(): string | null {
    return this.opts.qrHmacSecret ?? null;
  }

  qrPayloadFor(student: StudentRow): string {
    const secret = this.qrHmacSecret;
    if (!secret) return student.student_id_code;
    return JSON.stringify({
      sid: student.student_id_code,
      sig: sign(student.student_id_code, secret),
    });
  }

  studentCodeFromPayload(raw: string): string {
    requirePayloadSize(raw);
    const trimmed = raw.trim();

    if (trimmed.startsWith('{')) {
      let obj: Record<string, unknown>;
      try {
        const decoded: unknown = JSON.parse(trimmed);
        if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
          throw badRequest('Unrecognised QR payload');
        }
        obj = decoded as Record<string, unknown>;
      } catch (e) {
        if (e instanceof ApiError) throw e;
        throw badRequest('Unrecognised QR payload');
      }
      const sid = obj.sid;
      if (typeof sid !== 'string' || !sid) {
        throw badRequest('QR payload missing "sid"');
      }
      const code = requireValidStudentCode(sid, 'sid');
      const secret = this.qrHmacSecret;
      if (secret) {
        const sig = obj.sig;
        if (typeof sig !== 'string' || sig !== sign(code, secret)) {
          throw badRequest('QR signature invalid');
        }
      }
      return code;
    }

    if (this.qrHmacSecret) {
      throw badRequest('QR payload is not signed');
    }

    if (isValidStudentCode(trimmed)) {
      return requireValidStudentCode(trimmed);
    }

    return requireValidStudentCode(trimmed);
  }

  async windowsForEvent(eventId: number, db: Queryable = this.pool): Promise<SessionWindowRow[]> {
    return this.windowRepository(db).listForEvent(eventId);
  }

  invalidateStudent(student: { id: number; student_id_code: string }): void {
    this.catalog.invalidateStudent(student);
  }

  invalidateAllStudents(): void {
    this.catalog.invalidateAllStudents();
  }

  invalidateEvent(eventId?: number): void {
    this.catalog.invalidateEvent(eventId);
  }

  rememberStudent(student: StudentRow): void {
    this.catalog.rememberStudent(student);
  }

  async autoDetectWindow(eventId: number, at?: Date): Promise<SessionWindowRow | null> {
    const result = await this.windowResolver().execute({
      eventId,
      at: at ?? this.now(),
    });
    return result.kind === 'resolved' ? result.window : null;
  }

  async resolveWindow(args: {
    eventId: number;
    overrideWindowId?: number | null;
    db?: Queryable;
  }): Promise<{ window: SessionWindowRow; mode: 'auto' | 'manual' }> {
    const db = args.db ?? this.pool;
    const result = await this.windowResolver(db).execute({
      eventId: args.eventId,
      overrideWindowId: args.overrideWindowId,
      at: this.now(),
    });
    if (result.kind === 'not_found') {
      throw notFound('Session window not found for this event');
    }
    if (result.kind === 'unavailable') {
      throw this.noActiveWindowError(result.availableWindows);
    }
    return { window: result.window, mode: result.mode };
  }

  private windowRepository(db: Queryable = this.pool): PostgresAttendanceWindowRepository {
    return new PostgresAttendanceWindowRepository(
      db,
      db === this.pool ? this.catalog : undefined,
    );
  }

  private windowResolver(db: Queryable = this.pool): ResolveAttendanceWindowUseCase {
    return new ResolveAttendanceWindowUseCase(this.windowRepository(db));
  }

  private previewUseCase(db: Queryable = this.pool): PreviewAttendanceUseCase {
    if (db === this.pool && this.opts.previewUseCase) return this.opts.previewUseCase;
    return new PreviewAttendanceUseCase(
      this.windowResolver(db),
      new PostgresAttendancePreviewReader(db),
    );
  }

  private noActiveWindowError(windows: SessionWindowRow[]): ApiError {
    return new ApiError(
      422,
      windows.length === 0
        ? 'This event has no session windows configured'
        : 'No active session window right now — pick a session manually',
      {
        code: 'NO_ACTIVE_WINDOW',
        server_time: this.now().toISOString(),
        available_windows: windows.map((window) => ({
          id: window.id,
          session_label: window.session_label,
          start_time: window.start_time,
          end_time: window.end_time,
        })),
      },
    );
  }

  ensureSessionAcceptingScans(args: {
    event: EventRow;
    window: SessionWindowRow;
    direction?: string;
    at?: Date;
  }): void {
    const t = args.at ?? this.now();
    const eventDay = args.window.session_date
      ? parseIsoDateTime(args.window.session_date) ?? new Date(`${args.window.session_date}T00:00:00`)
      : args.event.event_start_date;
    if (args.window.is_closed) throw conflict(`Session "${args.window.session_label}" is closed`);
    if (!isSameDay(t, eventDay)) {
      const y = String(eventDay.getFullYear()).padStart(4, '0');
      const m = String(eventDay.getMonth() + 1).padStart(2, '0');
      const d = String(eventDay.getDate()).padStart(2, '0');
      throw conflict(`Scanning for "${args.event.name}" is only allowed on ${y}-${m}-${d}`, {
        code: 'EVENT_NOT_TODAY',
        event_date: eventDay.toISOString(),
        server_time: t.toISOString(),
      });
    }

    const start = parseMinutes(args.window.start_time);
    const end = parseMinutes(args.window.end_time);
    if (start == null || end == null) {
      throw badRequest('Session window has invalid start_time/end_time');
    }
    const minutes = minutesOfDay(t);
    const isOut = args.direction === DIRECTION.out;
    if (minutes < start) {
      throw conflict(
        `Session "${args.window.session_label}" has not started yet ` +
          `(starts at ${args.window.start_time})`,
        {
          code: 'SESSION_NOT_STARTED',
          session_label: args.window.session_label,
          start_time: args.window.start_time,
          end_time: args.window.end_time,
          server_time: t.toISOString(),
        },
      );
    }

    if (!isOut) {
      if (minutes >= end) {
        throw conflict(
          `Check-in for "${args.window.session_label}" has closed`,
          {
            code: 'SESSION_ENDED',
            session_label: args.window.session_label,
            start_time: args.window.start_time,
            end_time: args.window.end_time,
            server_time: t.toISOString(),
          },
        );
      }
    } else {
      const closes = parseMinutes(args.window.out_end ?? args.window.end_time) ?? end;
      if (minutes >= closes) {
        throw conflict(
          `Check-out for "${args.window.session_label}" has closed`,
          {
            code: 'SESSION_ENDED',
            session_label: args.window.session_label,
            start_time: args.window.start_time,
            end_time: args.window.end_time,
            server_time: t.toISOString(),
          },
        );
      }
    }
  }

  ensureLateManualCheckInAllowed(event: EventRow, window: SessionWindowRow, actionLabel = 'Manual check-in'): void {
    if (window.is_closed) throw conflict(`Session "${window.session_label}" is closed`);
    const now = this.now();
    const sessionDay = window.session_date
      ? new Date(`${window.session_date}T00:00:00`)
      : event.event_start_date;
    if (!isSameDay(now, sessionDay)) {
      const y = String(sessionDay.getFullYear()).padStart(4, '0');
      const m = String(sessionDay.getMonth() + 1).padStart(2, '0');
      const d = String(sessionDay.getDate()).padStart(2, '0');
      throw conflict(`${actionLabel} for "${window.session_label}" is only allowed on ${y}-${m}-${d}`, {
        code: 'EVENT_NOT_TODAY',
        event_date: sessionDay.toISOString(),
        server_time: now.toISOString(),
      });
    }
    const start = parseMinutes(window.start_time);
    if (start == null || minutesOfDay(now) < start) {
      throw conflict(`Session "${window.session_label}" has not started yet`, {
        code: 'SESSION_NOT_STARTED',
        session_label: window.session_label,
        start_time: window.start_time,
        end_time: window.end_time,
        server_time: now.toISOString(),
      });
    }
  }

  async determineDirection(args: {
    eventId: number;
    studentId: number;
    sessionWindowId: number;
    db?: Queryable;
    forUpdate?: boolean;
  }): Promise<DirectionResult> {
    const db = args.db ?? this.pool;
    const existing = args.forUpdate
      ? await q.confirmedLogs(db, args, true)
      : await new PostgresAttendancePreviewReader(db).listConfirmedScans(args);
    const direction = computeDirection(existing);
    return {
      direction,
      existing,
      canScan: direction !== DIRECTION.alreadyComplete,
    };
  }

  requireEventDateNotPast(date: Date): void {
    if (isPastDate(date, this.now())) {
      throw badRequest('event_date cannot be in the past', {
        code: 'PAST_EVENT_DATE',
        event_date: date.toISOString(),
        server_time: this.now().toISOString(),
      });
    }
  }

  async ensureEventUsable(event: EventRow, db: Queryable = this.pool): Promise<EventRow> {
    const finalDate = event.event_end_date;
    if (isPastDate(finalDate, this.now())) {
      if (event.is_active) {
        if (db === this.pool) {
          await withTransaction(this.pool, (client) => q.deactivateEvent(client, event.id));
        } else {
          await q.deactivateEvent(db, event.id);
        }
        this.catalog.invalidateEvent(event.id);
      }
      throw conflict(`Event "${event.name}" final session date has passed and is no longer valid`, {
        code: 'EVENT_DATE_PASSED',
        event_date: finalDate.toISOString(),
        server_time: this.now().toISOString(),
      });
    }
    if (!event.is_active) {
      throw conflict(`Event "${event.name}" is not active`);
    }
    return event;
  }

  async deactivateExpiredEvents(db: Queryable = this.pool): Promise<number> {
    const active =
      db === this.pool ? await this.catalog.listActiveEvents() : await q.listActiveEvents(db);
    let count = 0;
    for (const event of active) {
      if (!isPastDate(event.event_end_date, this.now())) continue;
      try {
        if (db === this.pool) {
          await withTransaction(this.pool, (client) => q.deactivateEvent(client, event.id));
        } else {
          await q.deactivateEvent(db, event.id);
        }
        count++;
      } catch (err) {
        // Listing / scanning must still work when one event cannot close yet
        // (open session, fine assessment error, etc.).
        console.error(`Could not auto-close expired event ${event.id}:`, err);
      }
    }
    if (count > 0) this.catalog.invalidateEvent();
    return count;
  }

  async preview(args: {
    eventId: number;
    qrPayload: string;
    sessionWindowId?: number | null;
  }): Promise<ScanPreview> {
    const event = await this.catalog.getEventById(args.eventId);
    if (!event) throw notFound('Event not found');
    await this.ensureEventUsable(event);
    requirePayloadSize(args.qrPayload);
    const payload = args.qrPayload.trim();
    const isToken = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload);
    const token = isToken
      ? await q.getEventParticipantByToken(this.pool, payload, args.eventId)
      : null;
    if (isToken && !token) {
      throw notFound('QR pass is invalid or revoked for this event');
    }
    let student: StudentRow | null = null;
    if (token) {
      student = await q.getStudentById(this.pool, token.student_id);
    } else {
      try {
        const code = this.studentCodeFromPayload(payload);
        student = await this.catalog.getStudentByCode(code);
      } catch {
        /* proceed to candidate fallback */
      }

      if (!student) {
        const parsed = extractCandidatePayloads(payload);
        for (const candidateCode of parsed.codes) {
          student = await this.catalog.getStudentByCode(candidateCode);
          if (student) break;
        }
        if (!student) {
          for (const candidateName of parsed.names) {
            student = await q.getStudentByCodeOrName(this.pool, candidateName);
            if (student) break;
          }
        }
      }
    }

    if (!student) throw notFound(`Student not found for scanned QR code`);
    const serverTime = this.now();
    const preview = await this.previewUseCase().execute({
      eventId: args.eventId,
      studentId: student.id,
      overrideWindowId: args.sessionWindowId,
      at: serverTime,
    });
    if (preview.kind === 'window_not_found') {
      throw notFound('Session window not found for this event');
    }
    if (preview.kind === 'window_unavailable') {
      throw this.noActiveWindowError(preview.availableWindows);
    }
    if (preview.kind === 'not_registered') {
      throw conflict('Student is not registered for this session');
    }
    if (preview.mode === 'manual' && preview.direction.direction === DIRECTION.in) {
      this.ensureLateManualCheckInAllowed(event, preview.window, 'Manual check-in');
    } else {
      this.ensureSessionAcceptingScans({
        event,
        window: preview.window,
        direction: preview.direction.direction,
        at: serverTime,
      });
    }
    return {
      student,
      event,
      window: preview.window,
      direction: preview.direction,
      serverTime,
      sessionMode: preview.mode,
      existing: preview.direction.existing,
    };
  }

  async confirm(args: {
    eventId: number;
    studentId: number;
    sessionWindowId: number;
    scannedBy: number;
    expectedDirection?: string | null;
    deviceNote?: string | null;
    allowLateManualCheckIn?: boolean;
    allowLateManualCheckOut?: boolean;
    idempotencyKey?: string;
    requestId?: string;
  }): Promise<AttendanceLogRow> {
    const note = sanitizeDeviceNote(args.deviceNote);
    const requestHash = args.idempotencyKey
      ? attendanceConfirmationRequestHash({ ...args, deviceNote: note })
      : undefined;
    return this.writes.run(args.studentId, args.sessionWindowId, async () => {
      try {
        const useCase =
          this.opts.confirmUseCase ??
          new ConfirmAttendanceUseCase(
            new PostgresAttendanceConfirmationUnitOfWork(this.pool),
          );
        return await useCase.execute({
          ...args,
          scannedAt: this.now(),
          deviceNote: note,
          requestHash,
          requestId: args.requestId ?? crypto.randomUUID(),
        });
      } catch (error) {
        if (error instanceof ConfirmAttendanceRejected) {
          throw this.confirmationError(error);
        }
        throw error;
      }
    });
  }

  private confirmationError(error: ConfirmAttendanceRejected): ApiError {
    const context = error.context;
    if (error.reason === 'EVENT_NOT_FOUND') return notFound('Event not found');
    if (error.reason === 'WINDOW_NOT_FOUND') {
      return notFound('Session window not found for this event');
    }
    if (error.reason === 'STUDENT_NOT_FOUND') return notFound('Student not found');
    if (error.reason === 'NOT_REGISTERED') {
      return conflict('Student is not registered for this session');
    }
    if (error.reason === 'EVENT_DATE_PASSED') {
      const event = context.event as EventRow;
      const at = context.at as Date;
      return conflict(`Event "${event.name}" final session date has passed and is no longer valid`, {
        code: 'EVENT_DATE_PASSED',
        event_date: event.event_end_date.toISOString(),
        server_time: at.toISOString(),
      });
    }
    if (error.reason === 'EVENT_INACTIVE') {
      const event = context.event as EventRow;
      return conflict(`Event "${event.name}" is not active`);
    }
    if (error.reason === 'MANUAL_DIRECTION_INVALID') {
      return badRequest(
        context.action === 'check_out'
          ? 'Manual check-out must record OUT'
          : 'Manual check-in must record IN',
      );
    }
    if (error.reason === 'ALREADY_COMPLETE') {
      const window = context.window as SessionWindowRow;
      return conflict(`Already timed IN & OUT for ${window.session_label}`, {
        code: 'ALREADY_COMPLETE',
      });
    }
    if (error.reason === 'DIRECTION_CHANGED') {
      const direction = String(context.direction);
      return conflict(
        `Attendance state changed — now would be ${direction}. Please re-scan.`,
        { code: 'DIRECTION_CHANGED', computed_direction: direction },
      );
    }
    if (error.reason === 'IDEMPOTENCY_CONFLICT') {
      return conflict('Idempotency-Key was already used with a different request.', {
        code: 'IDEMPOTENCY_CONFLICT',
      });
    }
    return this.scanEligibilityError(context);
  }

  private scanEligibilityError(context: Record<string, unknown>): ApiError {
    const issue = context.issue as { code: string; eventDate?: Date; action?: string };
    const event = context.event as EventRow;
    const window = context.window as SessionWindowRow;
    const at = context.at as Date;
    const manualAction = context.manualAction as 'check_in' | 'check_out' | null;
    const actionLabel = manualAction === 'check_out' ? 'Manual check-out' : 'Manual check-in';
    if (issue.code === 'SESSION_CLOSED') {
      return conflict(`Session "${window.session_label}" is closed`);
    }
    if (issue.code === 'EVENT_NOT_TODAY') {
      const eventDate = issue.eventDate!;
      const date = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}-${String(eventDate.getDate()).padStart(2, '0')}`;
      return conflict(
        manualAction
          ? `${actionLabel} for "${window.session_label}" is only allowed on ${date}`
          : `Scanning for "${event.name}" is only allowed on ${date}`,
        { code: 'EVENT_NOT_TODAY', event_date: eventDate.toISOString(), server_time: at.toISOString() },
      );
    }
    if (issue.code === 'INVALID_WINDOW') {
      return badRequest('Session window has invalid start_time/end_time');
    }
    if (issue.code === 'SESSION_NOT_STARTED') {
      return conflict(
        manualAction
          ? `Session "${window.session_label}" has not started yet`
          : `Session "${window.session_label}" has not started yet (starts at ${window.start_time})`,
        {
          code: 'SESSION_NOT_STARTED',
          session_label: window.session_label,
          start_time: window.start_time,
          end_time: window.end_time,
          server_time: at.toISOString(),
        },
      );
    }
    const isOut = issue.action === 'check_out';
    return conflict(
      `${isOut ? 'Check-out' : 'Check-in'} for "${window.session_label}" has closed`,
      {
        code: 'SESSION_ENDED',
        session_label: window.session_label,
        start_time: window.start_time,
        end_time: window.end_time,
        server_time: at.toISOString(),
      },
    );
  }

  async cancel(args: {
    eventId: number;
    studentId: number;
    sessionWindowId: number;
    scannedBy: number;
    direction?: string | null;
    deviceNote?: string | null;
  }): Promise<AttendanceLogRow> {
    const note = sanitizeDeviceNote(args.deviceNote);
    return this.writes.run(args.studentId, args.sessionWindowId, async () => {
      const event = await this.catalog.getEventById(args.eventId);
      if (!event) throw notFound('Event not found');
      await this.ensureEventUsable(event);
      const window = await this.catalog.getWindowById(args.sessionWindowId);
      if (!window || window.event_id !== args.eventId) {
        throw notFound('Session window not found for this event');
      }
      this.ensureSessionAcceptingScans({ event, window, direction: args.direction ?? DIRECTION.in });

      return q.insertAttendance(this.pool, {
        eventId: args.eventId,
        studentId: args.studentId,
        sessionWindowId: args.sessionWindowId,
        direction: args.direction ?? DIRECTION.in,
        scannedAt: this.now(),
        scannedBy: args.scannedBy,
        status: SCAN_STATUS.cancelled,
        deviceNote: note,
      });
    });
  }

  async validateWindow(args: {
    eventId: number;
    sessionDate?: Date;
    startTime: string;
    endTime: string;
    excludeId?: number | null;
    db?: Queryable;
  }): Promise<void> {
    const start = parseMinutes(args.startTime);
    const end = parseMinutes(args.endTime);
    if (start == null || end == null) {
      throw badRequest('start_time and end_time must be "HH:mm"');
    }
    if (start >= end) {
      throw badRequest('start_time must be before end_time');
    }
    const others = await this.windowsForEvent(args.eventId, args.db);
    const date = args.sessionDate
      ? `${args.sessionDate.getFullYear()}-${String(args.sessionDate.getMonth() + 1).padStart(2, '0')}-${String(args.sessionDate.getDate()).padStart(2, '0')}`
      : null;
    for (const o of others) {
      if (o.id === args.excludeId) continue;
      if (date && o.session_date && o.session_date !== date) continue;
      const os = parseMinutes(o.start_time);
      const oe = parseMinutes(o.end_time);
      if (os == null || oe == null) continue;
      if (overlaps(start, end, os, oe)) {
        throw conflict(
          `Overlaps existing session "${o.session_label}" (${o.start_time}–${o.end_time})`,
          { code: 'WINDOW_OVERLAP', conflicting_window_id: o.id },
        );
      }
    }
  }
}

export function previewToApi(preview: ScanPreview): Record<string, unknown> {
  const isLate =
    preview.direction.direction === DIRECTION.in &&
    isLateCheckIn(preview.window, preview.serverTime);
  const isEarlyOut =
    preview.direction.direction === DIRECTION.out &&
    isEarlyCheckOut(preview.window, preview.serverTime);
  const json: Record<string, unknown> = {
    student: {
      id: preview.student.id,
      student_id_code: preview.student.student_id_code,
      full_name: preview.student.full_name,
      section: preview.student.section,
      photo_url: preview.student.photo_url,
    },
    event: { id: preview.event.id, name: preview.event.name },
    computed_session: {
      id: preview.window.id,
      session_label: preview.window.session_label,
      start_time: preview.window.start_time,
      end_time: preview.window.end_time,
      mode: preview.sessionMode,
    },
    computed_direction: preview.direction.direction,
    is_late: isLate,
    is_early_out: isEarlyOut,
    can_confirm: preview.direction.canScan,
    server_time: preview.serverTime.toISOString(),
    existing_scans: preview.existing.map((e) => ({
      direction: e.direction,
      scanned_at: e.scanned_at.toISOString(),
    })),
  };
  if (!preview.direction.canScan) {
    json.message = `Already timed IN & OUT for ${preview.window.session_label}`;
  } else if (isLate) {
    const cutoff = preview.window.late_after ?? preview.window.start_time;
    json.message = `Arrived after ${cutoff} — will be marked LATE`;
  } else if (isEarlyOut) {
    const cutoff = preview.window.out_start ?? preview.window.end_time;
    json.message = `Leaving before ${cutoff} — please state emergency/reason note`;
  }
  return json;
}

function sign(value: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(value, 'utf8').digest('hex');
}

function sanitizeDeviceNote(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const cleaned = raw.replace(/[\x00-\x1F\x7F]/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.length <= MAX_DEVICE_NOTE ? cleaned : cleaned.slice(0, MAX_DEVICE_NOTE);
}

function attendanceConfirmationRequestHash(args: {
  eventId: number;
  studentId: number;
  sessionWindowId: number;
  expectedDirection?: string | null;
  deviceNote?: string | null;
  allowLateManualCheckIn?: boolean;
  allowLateManualCheckOut?: boolean;
}): string {
  const canonical = JSON.stringify([
    'attendance-confirmation-v1',
    args.eventId,
    args.studentId,
    args.sessionWindowId,
    args.expectedDirection ?? null,
    args.deviceNote ?? null,
    args.allowLateManualCheckIn ?? false,
    args.allowLateManualCheckOut ?? false,
  ]);
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}
