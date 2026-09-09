import { Router, type Request } from 'express';

import { AttendanceService } from '../attendance/service.ts';
import { hashPassword } from '../auth/password.ts';
import * as q from '../db/queries.ts';
import { getPool } from '../db/pool.ts';
import { withTransaction } from '../db/pool.ts';
import { DIRECTION, SCAN_STATUS } from '../types.ts';
import { badRequest, conflict, notFound } from '../utils/errors.ts';
import { encodeCsv, parseCsv } from '../utils/csv.ts';
import {
  hasKey,
  jsonObject,
  optionalBool,
  optionalInt,
  optionalString,
  parseDate,
  parsePathId,
  queryInt,
  queryString,
  requireString,
} from '../utils/http.ts';
import { parseIsoDateTime } from '../utils/time.ts';
import { isValidTime, normaliseTime } from '../utils/time.ts';
import { isValidStudentCode, requireValidStudentCode } from '../utils/studentCode.ts';
import {
  attendanceDetailToApi,
  eventToApi,
  studentToApi,
  userToApi,
  windowToApi,
} from '../utils/serialize.ts';
import { asyncHandler } from './auth.ts';

function service(req: Request): AttendanceService {
  return req.app.locals.attendance as AttendanceService;
}

export const adminRouter = Router();

// --- students ---

adminRouter.get(
  '/students',
  asyncHandler(async (req, res) => {
    const rows = await q.listStudents(getPool(), queryString(req, 'q'));
    const svc = service(req);
    res.json(rows.map((s) => ({ ...studentToApi(s), qr_payload: svc.qrPayloadFor(s) })));
  }),
);

adminRouter.post(
  '/students',
  asyncHandler(async (req, res) => {
    const body = jsonObject(req);
    const code = requireValidStudentCode(requireString(body, 'student_id_code'));
    const fullName = requireString(body, 'full_name');
    const section = optionalString(body, 'section');
    const photoUrl = optionalString(body, 'photo_url');
    const exists = await q.getStudentByCode(getPool(), code);
    if (exists) throw conflict(`Student code "${code}" already exists`);
    const created = await q.insertStudent(getPool(), {
      studentIdCode: code,
      fullName,
      section,
      photoUrl,
    });
    service(req).rememberStudent(created);
    res.status(201).json({
      ...studentToApi(created),
      qr_payload: service(req).qrPayloadFor(created),
    });
  }),
);

adminRouter.post(
  '/students/import',
  asyncHandler(async (req, res) => {
    const skipExisting = queryString(req, 'mode') === 'skip';
    const contentType = req.headers['content-type'] ?? '';
    let incoming: Record<string, unknown>[];
    if (contentType.includes('text/csv') || contentType.includes('text/plain')) {
      incoming = fromCsv(typeof req.body === 'string' ? req.body : String(req.body ?? ''));
    } else {
      const body = jsonObject(req);
      if (typeof body.csv === 'string') {
        incoming = fromCsv(body.csv);
      } else if (Array.isArray(body.students)) {
        incoming = body.students.filter(
          (m): m is Record<string, unknown> => !!m && typeof m === 'object' && !Array.isArray(m),
        );
      } else {
        throw badRequest('Provide "csv" text or a "students" array');
      }
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: Record<string, unknown>[] = [];

    await withTransaction(getPool(), async (client) => {
      for (let i = 0; i < incoming.length; i++) {
        const row = incoming[i];
        const code = String(row.student_id_code ?? row.code ?? '').trim();
        const name = String(row.full_name ?? row.name ?? '').trim();
        const section = nullable(row.section);
        const photoUrl = nullable(row.photo_url);
        if (!code || !name) {
          errors.push({ row: i + 1, error: 'missing student_id_code or full_name' });
          continue;
        }
        if (!isValidStudentCode(code)) {
          errors.push({ row: i + 1, error: 'invalid student_id_code', student_id_code: code });
          continue;
        }
        const existing = await q.getStudentByCode(client, code);
        if (!existing) {
          await q.insertStudent(client, {
            studentIdCode: code,
            fullName: name,
            section,
            photoUrl,
          });
          created++;
        } else if (skipExisting) {
          skipped++;
        } else {
          await q.updateStudent(client, existing.id, {
            fullName: name,
            hasSection: true,
            section: section ?? existing.section,
            hasPhoto: true,
            photoUrl: photoUrl ?? existing.photo_url,
          });
          updated++;
        }
      }
    });

    service(req).invalidateAllStudents();
    res.json({
      created,
      updated,
      skipped,
      errors,
      total_rows: incoming.length,
    });
  }),
);

adminRouter.get(
  '/students/:id',
  asyncHandler(async (req, res) => {
    const id = parsePathId(req.params.id);
    const existing = await q.getStudentById(getPool(), id);
    if (!existing) throw notFound('Student not found');
    res.json({
      ...studentToApi(existing),
      qr_payload: service(req).qrPayloadFor(existing),
    });
  }),
);

adminRouter.put(
  '/students/:id',
  asyncHandler(async (req, res) => {
    const id = parsePathId(req.params.id);
    const existing = await q.getStudentById(getPool(), id);
    if (!existing) throw notFound('Student not found');
    const body = jsonObject(req);
    const code = optionalString(body, 'student_id_code');
    const fullName = optionalString(body, 'full_name');
    const hasSection = hasKey(body, 'section');
    const hasPhoto = hasKey(body, 'photo_url');
    const section = optionalString(body, 'section');
    const photoUrl = optionalString(body, 'photo_url');
    const safeCode = code == null ? null : requireValidStudentCode(code);

    if (safeCode && safeCode !== existing.student_id_code) {
      const taken = await q.getStudentByCode(getPool(), safeCode);
      if (taken && taken.id !== id) throw conflict(`Student code "${safeCode}" already exists`);
    }

    const updated = await q.updateStudent(getPool(), id, {
      studentIdCode: safeCode ?? undefined,
      fullName: fullName ?? undefined,
      hasSection,
      section,
      hasPhoto,
      photoUrl,
    });
    service(req).invalidateStudent(existing);
    service(req).rememberStudent(updated);
    res.json({
      ...studentToApi(updated),
      qr_payload: service(req).qrPayloadFor(updated),
    });
  }),
);

adminRouter.delete(
  '/students/:id',
  asyncHandler(async (req, res) => {
    const id = parsePathId(req.params.id);
    const existing = await q.getStudentById(getPool(), id);
    if (!existing) throw notFound('Student not found');
    await q.deleteStudent(getPool(), id);
    service(req).invalidateStudent(existing);
    res.status(204).end();
  }),
);

// --- events ---

adminRouter.get(
  '/events',
  asyncHandler(async (req, res) => {
    const svc = service(req);
    await svc.deactivateExpiredEvents();
    const events = await q.listEvents(getPool());
    const windows = await q.listAllWindows(getPool());
    const now = svc.now();
    res.json(
      events.map((e) => ({
        ...eventToApi(e, now),
        session_windows: windows.filter((w) => w.event_id === e.id).map(windowToApi),
      })),
    );
  }),
);

adminRouter.post(
  '/events',
  asyncHandler(async (req, res) => {
    const body = jsonObject(req);
    const name = requireString(body, 'name');
    const date = parseDate(body, 'event_date');
    const svc = service(req);
    svc.requireEventDateNotPast(date);
    const isActive = optionalBool(body, 'is_active') ?? true;
    const rawWindows = body.session_windows;

    let createdEventId = 0;
    const result = await withTransaction(getPool(), async (client) => {
      const event = await q.insertEvent(client, {
        name,
        eventDate: date,
        isActive,
        createdBy: req.auth!.id,
      });
      createdEventId = event.id;
      if (Array.isArray(rawWindows)) {
        let order = 0;
        for (const raw of rawWindows) {
          if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
          const w = raw as Record<string, unknown>;
          const label = requireString(w, 'session_label');
          const start = normaliseTime(requireString(w, 'start_time'));
          const end = normaliseTime(requireString(w, 'end_time'));
          await svc.validateWindow({
            eventId: event.id,
            startTime: start,
            endTime: end,
            db: client,
          });
          await q.insertWindow(client, {
            eventId: event.id,
            sessionLabel: label,
            startTime: start,
            endTime: end,
            sortOrder: optionalInt(w, 'sort_order') ?? order++,
          });
        }
      }
      const windows = await q.windowsForEvent(client, event.id);
      const refreshed = (await q.getEventById(client, event.id))!;
      return {
        ...eventToApi(refreshed, svc.now()),
        session_windows: windows.map(windowToApi),
      };
    });
    svc.invalidateEvent(createdEventId);
    res.status(201).json(result);
  }),
);

adminRouter.get(
  '/events/:id/session-windows',
  asyncHandler(async (req, res) => {
    const eventId = parsePathId(req.params.id);
    const event = await q.getEventById(getPool(), eventId);
    if (!event) throw notFound('Event not found');
    const windows = await service(req).windowsForEvent(eventId);
    res.json(windows.map(windowToApi));
  }),
);

adminRouter.post(
  '/events/:id/session-windows',
  asyncHandler(async (req, res) => {
    const eventId = parsePathId(req.params.id);
    const event = await q.getEventById(getPool(), eventId);
    if (!event) throw notFound('Event not found');
    const body = jsonObject(req);
    const label = requireString(body, 'session_label');
    const startRaw = requireString(body, 'start_time');
    const endRaw = requireString(body, 'end_time');
    if (!isValidTime(startRaw) || !isValidTime(endRaw)) {
      throw badRequest('start_time and end_time must be "HH:mm"');
    }
    const start = normaliseTime(startRaw);
    const end = normaliseTime(endRaw);
    const svc = service(req);
    await svc.validateWindow({ eventId, startTime: start, endTime: end });
    let sortOrder = optionalInt(body, 'sort_order');
    if (sortOrder == null) {
      const existing = await svc.windowsForEvent(eventId);
      sortOrder = existing.length === 0 ? 0 : Math.max(...existing.map((w) => w.sort_order)) + 1;
    }
    const created = await q.insertWindow(getPool(), {
      eventId,
      sessionLabel: label,
      startTime: start,
      endTime: end,
      sortOrder,
    });
    svc.invalidateEvent(eventId);
    res.status(201).json(windowToApi(created));
  }),
);

adminRouter.get(
  '/events/:id',
  asyncHandler(async (req, res) => {
    const id = parsePathId(req.params.id);
    const svc = service(req);
    await svc.deactivateExpiredEvents();
    const existing = await q.getEventById(getPool(), id);
    if (!existing) throw notFound('Event not found');
    const windows = await svc.windowsForEvent(id);
    res.json({
      ...eventToApi(existing, svc.now()),
      session_windows: windows.map(windowToApi),
    });
  }),
);

adminRouter.put(
  '/events/:id',
  asyncHandler(async (req, res) => {
    const id = parsePathId(req.params.id);
    const existing = await q.getEventById(getPool(), id);
    if (!existing) throw notFound('Event not found');
    const body = jsonObject(req);
    const svc = service(req);
    const name = optionalString(body, 'name');
    const date = hasKey(body, 'event_date') ? parseDate(body, 'event_date') : null;
    if (date) svc.requireEventDateNotPast(date);
    const isActive = optionalBool(body, 'is_active');
    if (isActive) {
      svc.requireEventDateNotPast(date ?? existing.event_date);
    }
    const updated = await q.updateEvent(getPool(), id, {
      name: name ?? undefined,
      eventDate: date ?? undefined,
      isActive: isActive ?? undefined,
    });
    svc.invalidateEvent(id);
    const windows = await svc.windowsForEvent(id);
    res.json({
      ...eventToApi(updated, svc.now()),
      session_windows: windows.map(windowToApi),
    });
  }),
);

adminRouter.delete(
  '/events/:id',
  asyncHandler(async (req, res) => {
    const id = parsePathId(req.params.id);
    const existing = await q.getEventById(getPool(), id);
    if (!existing) throw notFound('Event not found');
    await q.deleteEvent(getPool(), id);
    service(req).invalidateEvent(id);
    res.status(204).end();
  }),
);

// --- session windows ---

adminRouter.get(
  '/session-windows/:id',
  asyncHandler(async (req, res) => {
    const id = parsePathId(req.params.id);
    const existing = await q.getWindowById(getPool(), id);
    if (!existing) throw notFound('Session window not found');
    res.json(windowToApi(existing));
  }),
);

adminRouter.put(
  '/session-windows/:id',
  asyncHandler(async (req, res) => {
    const id = parsePathId(req.params.id);
    const existing = await q.getWindowById(getPool(), id);
    if (!existing) throw notFound('Session window not found');
    const body = jsonObject(req);
    const label = optionalString(body, 'session_label');
    const startRaw = optionalString(body, 'start_time');
    const endRaw = optionalString(body, 'end_time');
    const sortOrder = optionalInt(body, 'sort_order');
    if ((startRaw && !isValidTime(startRaw)) || (endRaw && !isValidTime(endRaw))) {
      throw badRequest('start_time and end_time must be "HH:mm"');
    }
    const start = startRaw ? normaliseTime(startRaw) : existing.start_time;
    const end = endRaw ? normaliseTime(endRaw) : existing.end_time;
    await service(req).validateWindow({
      eventId: existing.event_id,
      startTime: start,
      endTime: end,
      excludeId: id,
    });
    const updated = await q.updateWindow(getPool(), id, {
      sessionLabel: label ?? undefined,
      startTime: start,
      endTime: end,
      sortOrder: sortOrder ?? undefined,
    });
    service(req).invalidateEvent(existing.event_id);
    res.json(windowToApi(updated));
  }),
);

adminRouter.delete(
  '/session-windows/:id',
  asyncHandler(async (req, res) => {
    const id = parsePathId(req.params.id);
    const existing = await q.getWindowById(getPool(), id);
    if (!existing) throw notFound('Session window not found');
    const scans = await q.countAttendanceForWindow(getPool(), id);
    if (scans > 0 && queryString(req, 'force') !== 'true') {
      throw conflict(
        `This session has ${scans} attendance records. ` +
          'Add ?force=true to delete the session and its records.',
        { code: 'HAS_RECORDS', count: scans },
      );
    }
    await q.deleteWindow(getPool(), id);
    service(req).invalidateEvent(existing.event_id);
    res.status(204).end();
  }),
);

// --- moderators ---

adminRouter.get(
  '/moderators',
  asyncHandler(async (_req, res) => {
    const rows = await q.listModerators(getPool());
    res.json(rows.map(userToApi));
  }),
);

adminRouter.post(
  '/moderators',
  asyncHandler(async (req, res) => {
    const body = jsonObject(req);
    const name = requireString(body, 'name');
    const username = requireString(body, 'username');
    const password = requireString(body, 'password');
    if (password.length < 4) throw badRequest('Password must be at least 4 characters');
    const exists = await q.getUserByUsername(getPool(), username);
    if (exists) throw conflict('Username already taken');
    const created = await q.insertUser(getPool(), {
      name,
      username,
      passwordHash: hashPassword(password),
      role: 'moderator',
    });
    res.status(201).json(userToApi(created));
  }),
);

adminRouter.get(
  '/moderators/:id',
  asyncHandler(async (req, res) => {
    const id = parsePathId(req.params.id);
    const existing = await q.getModeratorById(getPool(), id);
    if (!existing) throw notFound('Moderator not found');
    res.json(userToApi(existing));
  }),
);

adminRouter.put(
  '/moderators/:id',
  asyncHandler(async (req, res) => {
    const id = parsePathId(req.params.id);
    const existing = await q.getModeratorById(getPool(), id);
    if (!existing) throw notFound('Moderator not found');
    const body = jsonObject(req);
    const name = optionalString(body, 'name');
    const username = optionalString(body, 'username');
    const password = optionalString(body, 'password');
    if (username && username !== existing.username) {
      const taken = await q.getUserByUsername(getPool(), username);
      if (taken && taken.id !== id) throw conflict('Username already taken');
    }
    if (password && password.length < 4) {
      throw badRequest('Password must be at least 4 characters');
    }
    const updated = await q.updateUser(getPool(), id, {
      name: name ?? undefined,
      username: username ?? undefined,
      passwordHash: password ? hashPassword(password) : undefined,
    });
    res.json(userToApi(updated));
  }),
);

adminRouter.delete(
  '/moderators/:id',
  asyncHandler(async (req, res) => {
    const id = parsePathId(req.params.id);
    const existing = await q.getModeratorById(getPool(), id);
    if (!existing) throw notFound('Moderator not found');
    const scans = await q.countScansByModerator(getPool(), id);
    if (scans > 0) {
      throw conflict(
        `This moderator has ${scans} attendance scans on record and cannot ` +
          'be deleted. Change their password to revoke access instead.',
      );
    }
    await q.deleteUser(getPool(), id);
    res.status(204).end();
  }),
);

// --- attendance ---

adminRouter.get(
  '/attendance/export',
  asyncHandler(async (req, res) => {
    let status = queryString(req, 'status');
    if (status == null) status = SCAN_STATUS.confirmed;
    if (status !== SCAN_STATUS.confirmed && status !== SCAN_STATUS.cancelled) {
      throw badRequest('status must be "confirmed" or "cancelled"');
    }
    const dateRaw = queryString(req, 'date');
    const date = dateRaw ? parseIsoDateTime(dateRaw) : null;
    if (dateRaw && !date) throw badRequest('Query "date" must be an ISO date');
    const filtered = await q.listAttendance(getPool(), {
      eventId: queryInt(req, 'event_id'),
      studentId: queryInt(req, 'student_id'),
      sessionWindowId: queryInt(req, 'session_window_id'),
      scannedBy: queryInt(req, 'scanned_by'),
      status,
      date,
      search: queryString(req, 'q'),
      limit: queryInt(req, 'limit'),
    });
    const csv = encodeCsv([
      [
        'id',
        'event',
        'student_id_code',
        'student_name',
        'section',
        'session',
        'direction',
        'scanned_at',
        'scanned_by',
        'status',
        'note',
      ],
      ...filtered.map((r) => [
        r.id,
        r.event_name,
        r.student_id_code,
        r.student_name,
        r.student_section,
        r.session_label,
        r.direction,
        r.scanned_at.toISOString(),
        r.scanned_by_name,
        r.status,
        r.device_note,
      ]),
    ]);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="attendance_${stamp}.csv"`);
    res.send(csv);
  }),
);

adminRouter.get(
  '/attendance',
  asyncHandler(async (req, res) => {
    const status = queryString(req, 'status');
    if (
      status != null &&
      status !== SCAN_STATUS.confirmed &&
      status !== SCAN_STATUS.cancelled
    ) {
      throw badRequest('status must be "confirmed" or "cancelled"');
    }
    const dateRaw = queryString(req, 'date');
    const date = dateRaw ? parseIsoDateTime(dateRaw) : null;
    if (dateRaw && !date) throw badRequest('Query "date" must be an ISO date');
    const rows = await q.listAttendance(getPool(), {
      eventId: queryInt(req, 'event_id'),
      studentId: queryInt(req, 'student_id'),
      sessionWindowId: queryInt(req, 'session_window_id'),
      scannedBy: queryInt(req, 'scanned_by'),
      status,
      date,
      search: queryString(req, 'q'),
      limit: queryInt(req, 'limit'),
    });
    res.json(rows.map(attendanceDetailToApi));
  }),
);

adminRouter.get(
  '/attendance/:id',
  asyncHandler(async (req, res) => {
    const id = parsePathId(req.params.id);
    const existing = await q.getAttendanceDetail(getPool(), id);
    if (!existing) throw notFound('Attendance record not found');
    res.json(attendanceDetailToApi(existing));
  }),
);

adminRouter.put(
  '/attendance/:id',
  asyncHandler(async (req, res) => {
    const id = parsePathId(req.params.id);
    const existing = await q.getAttendanceDetail(getPool(), id);
    if (!existing) throw notFound('Attendance record not found');
    const body = jsonObject(req);
    const direction = optionalString(body, 'direction');
    const status = optionalString(body, 'status');
    const windowId = optionalInt(body, 'session_window_id');
    const scannedAtRaw = optionalString(body, 'scanned_at');
    const hasNote = hasKey(body, 'device_note');
    const note = optionalString(body, 'device_note');
    if (direction && direction !== DIRECTION.in && direction !== DIRECTION.out) {
      throw badRequest('direction must be "IN" or "OUT"');
    }
    if (status && status !== SCAN_STATUS.confirmed && status !== SCAN_STATUS.cancelled) {
      throw badRequest('status must be "confirmed" or "cancelled"');
    }
    if (windowId != null) {
      const w = await q.getWindowById(getPool(), windowId);
      if (!w || w.event_id !== existing.event_id) {
        throw badRequest('session_window_id does not belong to this event');
      }
    }
    let scannedAt: Date | undefined;
    if (scannedAtRaw) {
      const parsed = parseIsoDateTime(scannedAtRaw);
      if (!parsed) throw badRequest('scanned_at must be an ISO-8601 timestamp');
      scannedAt = parsed;
    }
    await q.updateAttendance(getPool(), id, {
      direction: direction ?? undefined,
      status: status ?? undefined,
      sessionWindowId: windowId ?? undefined,
      scannedAt,
      hasNote,
      deviceNote: note,
    });
    const updated = await q.getAttendanceDetail(getPool(), id);
    res.json(attendanceDetailToApi(updated!));
  }),
);

adminRouter.delete(
  '/attendance/:id',
  asyncHandler(async (req, res) => {
    const id = parsePathId(req.params.id);
    const existing = await q.getAttendanceDetail(getPool(), id);
    if (!existing) throw notFound('Attendance record not found');
    await q.deleteAttendance(getPool(), id);
    res.status(204).end();
  }),
);

function nullable(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function fromCsv(text: string): Record<string, unknown>[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const first = rows[0].map((h) => h.trim().toLowerCase().replaceAll(' ', '_'));
  const knownHeaders = new Set(['student_id_code', 'code', 'full_name', 'name']);
  const hasHeader = first.some((h) => knownHeaders.has(h));
  const positional = ['student_id_code', 'full_name', 'section', 'photo_url'];
  const headers = hasHeader ? first : positional;
  const dataRows = hasHeader ? rows.slice(1) : rows;
  return dataRows.map((r) => {
    const m: Record<string, unknown> = {};
    for (let i = 0; i < r.length && i < headers.length; i++) {
      m[headers[i]] = r[i];
    }
    return m;
  });
}
