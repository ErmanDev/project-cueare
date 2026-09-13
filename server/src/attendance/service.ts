import crypto from 'node:crypto';
import type { Pool } from 'pg';

import { AttendanceCatalog } from './catalog.ts';
import { defaultRuntimeTuning, type RuntimeTuning } from '../config.ts';
import { withTransaction } from '../db/pool.ts';
import * as q from '../db/queries.ts';
import { ScanWriteQueue } from '../infra/queue.ts';
import { DIRECTION, SCAN_STATUS, type Queryable, type SessionWindowRow } from '../types.ts';
import { ApiError, badRequest, conflict, notFound } from '../utils/errors.ts';
import {
  isPastDate,
  isSameDay,
  minutesOfDay,
  overlaps,
  parseMinutes,
} from '../utils/time.ts';
import {
  requirePayloadSize,
  requireValidStudentCode,
} from '../utils/studentCode.ts';
import type { EventRow, StudentRow, AttendanceLogRow } from '../types.ts';

export type DirectionResult = {
  direction: string;
  existing: AttendanceLogRow[];
  canScan: boolean;
};

export type ScanPreview = {
  student: StudentRow;
  event: EventRow;
  window: SessionWindowRow;
  direction: DirectionResult;
  serverTime: Date;
  sessionMode: 'auto' | 'manual';
  existing: AttendanceLogRow[];
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
    return requireValidStudentCode(trimmed);
  }

  async windowsForEvent(eventId: number, db: Queryable = this.pool): Promise<SessionWindowRow[]> {
    if (db !== this.pool) return q.windowsForEvent(db, eventId);
    return this.catalog.windowsForEvent(eventId);
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
    const windows = await this.windowsForEvent(eventId);
    return pickWindowForTime(windows, at ?? this.now());
  }

  async resolveWindow(args: {
    eventId: number;
    overrideWindowId?: number | null;
    db?: Queryable;
  }): Promise<{ window: SessionWindowRow; mode: 'auto' | 'manual' }> {
    const db = args.db ?? this.pool;
    if (args.overrideWindowId != null) {
      const w =
        db === this.pool
          ? await this.catalog.getWindowById(args.overrideWindowId)
          : await q.getWindowById(db, args.overrideWindowId);
      if (!w || w.event_id !== args.eventId) {
        throw notFound('Session window not found for this event');
      }
      return { window: w, mode: 'manual' };
    }
    const w = await this.autoDetectWindow(args.eventId);
    if (!w) {
      const windows = await this.windowsForEvent(args.eventId, db);
      throw new ApiError(
        422,
        windows.length === 0
          ? 'This event has no session windows configured'
          : 'No active session window right now — pick a session manually',
        {
          code: 'NO_ACTIVE_WINDOW',
          server_time: this.now().toISOString(),
          available_windows: windows.map((win) => ({
            id: win.id,
            session_label: win.session_label,
            start_time: win.start_time,
            end_time: win.end_time,
          })),
        },
      );
    }
    return { window: w, mode: 'auto' };
  }

  ensureSessionAcceptingScans(args: {
    event: EventRow;
    window: SessionWindowRow;
    direction?: string;
    at?: Date;
  }): void {
    const t = args.at ?? this.now();
    const eventDay = args.window.session_date
      ? new Date(`${args.window.session_date}T00:00:00`)
      : args.event.event_date;
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
    const isOut = args.direction === DIRECTION.out;
    const closes = parseMinutes(isOut ? args.window.out_end ?? args.window.end_time : args.window.in_end ?? args.window.end_time) ?? end;
    const opens = isOut ? parseMinutes(args.window.out_start ?? args.window.start_time) ?? start : start;
    if (minutes < opens) {
      throw conflict(`Check-out for "${args.window.session_label}" has not opened yet`);
    }
    if (minutes >= closes) {
      throw conflict(
        `${isOut ? 'Check-out' : 'Check-in'} for "${args.window.session_label}" has closed`,
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

  async determineDirection(args: {
    eventId: number;
    studentId: number;
    sessionWindowId: number;
    db?: Queryable;
    forUpdate?: boolean;
  }): Promise<DirectionResult> {
    const existing = await q.confirmedLogs(args.db ?? this.pool, args, args.forUpdate === true);
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
    const finalDate = event.last_session_date ?? event.event_date;
    if (isPastDate(finalDate, this.now())) {
      if (event.is_active) {
        await q.deactivateEvent(db, event.id);
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
      if (!isPastDate(event.last_session_date ?? event.event_date, this.now())) continue;
      await q.deactivateEvent(db, event.id);
      count++;
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
    const code = token ? token.student_id_code : this.studentCodeFromPayload(payload);
    const student = token
      ? await q.getStudentById(this.pool, token.student_id)
      : code ? await this.catalog.getStudentByCode(code) : null;
    if (!student) throw notFound(`No student found for code "${code}"`);
    const { window, mode } = await this.resolveWindow({
      eventId: args.eventId,
      overrideWindowId: args.sessionWindowId,
    });
    if (!(await q.getRegisteredSessionParticipant(this.pool, args.eventId, student.id, window.id))) {
      throw conflict('Student is not registered for this session');
    }
    const direction = await this.determineDirection({
      eventId: args.eventId,
      studentId: student.id,
      sessionWindowId: window.id,
    });
    this.ensureSessionAcceptingScans({ event, window, direction: direction.direction });
    return {
      student,
      event,
      window,
      direction,
      serverTime: this.now(),
      sessionMode: mode,
      existing: direction.existing,
    };
  }

  async confirm(args: {
    eventId: number;
    studentId: number;
    sessionWindowId: number;
    scannedBy: number;
    expectedDirection?: string | null;
    deviceNote?: string | null;
  }): Promise<AttendanceLogRow> {
    const note = sanitizeDeviceNote(args.deviceNote);
    return this.writes.run(args.studentId, args.sessionWindowId, () =>
      withTransaction(this.pool, async (client) => {
        await q.lockStudentSession(client, args.studentId, args.sessionWindowId);
        const event = await q.getEventById(client, args.eventId);
        if (!event) throw notFound('Event not found');
        await this.ensureEventUsable(event, client);
        const window = await q.getWindowById(client, args.sessionWindowId);
        if (!window || window.event_id !== args.eventId) {
          throw notFound('Session window not found for this event');
        }
        const student = await q.getStudentById(client, args.studentId);
        if (!student) throw notFound('Student not found');
        if (!(await q.getRegisteredSessionParticipant(client, args.eventId, args.studentId, args.sessionWindowId))) {
          throw conflict('Student is not registered for this session');
        }

        const result = await this.determineDirection({
          eventId: args.eventId,
          studentId: args.studentId,
          sessionWindowId: args.sessionWindowId,
          db: client,
          forUpdate: true,
        });
        this.ensureSessionAcceptingScans({ event, window, direction: result.direction });
        if (!result.canScan) {
          throw conflict(`Already timed IN & OUT for ${window.session_label}`, {
            code: 'ALREADY_COMPLETE',
          });
        }
        if (args.expectedDirection && args.expectedDirection !== result.direction) {
          throw conflict(
            `Attendance state changed — now would be ${result.direction}. Please re-scan.`,
            { code: 'DIRECTION_CHANGED', computed_direction: result.direction },
          );
        }

        return q.insertAttendance(client, {
          eventId: args.eventId,
          studentId: args.studentId,
          sessionWindowId: args.sessionWindowId,
          direction: result.direction,
          scannedAt: this.now(),
          scannedBy: args.scannedBy,
          status: SCAN_STATUS.confirmed,
          deviceNote: note,
        });
      }),
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

export function pickWindowForTime(
  windows: SessionWindowRow[],
  at: Date,
): SessionWindowRow | null {
  const minutes = minutesOfDay(at);
  for (const w of windows) {
    if (w.is_closed) continue;
    if (w.session_date && !isSameDay(at, new Date(`${w.session_date}T00:00:00`))) continue;
    const start = parseMinutes(w.start_time);
    const end = parseMinutes(w.out_end ?? w.end_time);
    if (start == null || end == null) continue;
    if (minutes >= start && minutes < end) return w;
  }
  return null;
}

export function computeDirection(confirmedExisting: AttendanceLogRow[]): string {
  if (confirmedExisting.length === 0) return DIRECTION.in;
  if (confirmedExisting.length === 1 && confirmedExisting[0].direction === DIRECTION.in) {
    return DIRECTION.out;
  }
  return DIRECTION.alreadyComplete;
}

export function previewToApi(preview: ScanPreview): Record<string, unknown> {
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
    can_confirm: preview.direction.canScan,
    server_time: preview.serverTime.toISOString(),
    existing_scans: preview.existing.map((e) => ({
      direction: e.direction,
      scanned_at: e.scanned_at.toISOString(),
    })),
  };
  if (!preview.direction.canScan) {
    json.message = `Already timed IN & OUT for ${preview.window.session_label}`;
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
