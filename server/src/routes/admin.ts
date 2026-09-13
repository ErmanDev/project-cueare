import { Router, type Request } from 'express';

import { AttendanceService } from '../attendance/service.ts';
import { hashPassword } from '../auth/password.ts';
import * as q from '../db/queries.ts';
import { getPool } from '../db/pool.ts';
import { withTransaction } from '../db/pool.ts';
import { DIRECTION, SCAN_STATUS, type Queryable, type StudentRow } from '../types.ts';
import { badRequest, conflict, notFound } from '../utils/errors.ts';
import { mapImportRow, rowsFromSpreadsheet } from '../students/roster.ts';
import { detectDelimiter, encodeCsv, parseCsv } from '../utils/csv.ts';
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
  requireInt,
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

async function applyEventFineTemplate(
  db: Queryable,
  eventId: number,
  templateId: number,
  actorUserId: number,
  eventName: string,
): Promise<void> {
  const versionId = await q.latestPublishedTemplateVersionId(db, templateId);
  if (!versionId) throw badRequest('Select a published fine template');
  await q.applyFinePolicyTemplateToEvent(db, {
    eventId,
    templateVersionId: versionId,
    policyCode: `FP-EVT-${eventId}`,
    policyName: `${eventName} fines`,
    actorUserId,
  });
}

async function withFinePolicy<T extends { id?: unknown }>(payload: T, eventId: number) {
  const summaries = await q.listEventFineSummaries(getPool(), [eventId]);
  return { ...payload, fine_policy: summaries.get(eventId) ?? null };
}

function optionalMoney(body: Record<string, unknown>, key: string): number | null {
  const v = body[key];
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 0) {
    throw badRequest(`Field "${key}" must be a number of 0 or more`);
  }
  return n;
}

export const adminRouter = Router();

// --- students ---

adminRouter.get(
  '/students',
  asyncHandler(async (req, res) => {
    const search = queryString(req, 'q');
    const pageRaw = queryInt(req, 'page');
    const perPageRaw = queryInt(req, 'per_page');
    const svc = service(req);
    const toApi = (s: StudentRow) => ({ ...studentToApi(s), qr_payload: svc.qrPayloadFor(s) });

    if (pageRaw == null && perPageRaw == null) {
      const rows = await q.listStudents(getPool(), search);
      res.json(rows.map(toApi));
      return;
    }

    const page = Math.max(1, pageRaw ?? 1);
    const perPage = Math.min(100, Math.max(1, perPageRaw ?? 10));
    const { rows, total } = await q.listStudentsPage(getPool(), {
      search,
      limit: perPage,
      offset: (page - 1) * perPage,
    });
    res.json({
      students: rows.map(toApi),
      total,
      page,
      per_page: perPage,
    });
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
    const incoming = incomingStudentRows(req);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: Record<string, unknown>[] = [];

    await withTransaction(getPool(), async (client) => {
      for (let i = 0; i < incoming.length; i++) {
        const mapped = mapImportRow(incoming[i]);
        if (!mapped.ok) {
          errors.push({ row: i + 1, error: mapped.error });
          continue;
        }
        if (!isValidStudentCode(mapped.row.studentIdCode)) {
          errors.push({
            row: i + 1,
            error: 'invalid StudentID',
            student_id_code: mapped.row.studentIdCode,
          });
          continue;
        }
        const status = await q.upsertImportedStudent(client, mapped.row, skipExisting);
        if (status === 'created') created++;
        else if (status === 'updated') updated++;
        else skipped++;
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
    const policies = await q.listEventFineSummaries(
      getPool(),
      events.map((e) => e.id),
    );
    const now = svc.now();
    res.json(
      events.map((e) => ({
        ...eventToApi(e, now),
        session_windows: windows.filter((w) => w.event_id === e.id).map(windowToApi),
        fine_policy: policies.get(e.id) ?? null,
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
    const fineTemplateId = optionalInt(body, 'fine_template_id');

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
      if (fineTemplateId) {
        await applyEventFineTemplate(client, event.id, fineTemplateId, req.auth!.id, name);
      }
      if (isActive) {
        await q.publishEvent(client, event.id, req.auth!.id);
      }
      const windows = await q.windowsForEvent(client, event.id);
      const refreshed = (await q.getEventById(client, event.id))!;
      return {
        ...eventToApi(refreshed, svc.now()),
        session_windows: windows.map(windowToApi),
      };
    });
    svc.invalidateEvent(createdEventId);
    res.status(201).json(await withFinePolicy(result, createdEventId));
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
    res.json(
      await withFinePolicy(
        {
          ...eventToApi(existing, svc.now()),
          session_windows: windows.map(windowToApi),
        },
        id,
      ),
    );
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
    const fineTemplateId = hasKey(body, 'fine_template_id') ? optionalInt(body, 'fine_template_id') : null;
    const updated = await withTransaction(getPool(), async (client) => {
      const event = await q.updateEvent(client, id, {
        name: name ?? undefined,
        eventDate: date ?? undefined,
        isActive: isActive ?? undefined,
      });
      if (fineTemplateId) {
        await applyEventFineTemplate(client, id, fineTemplateId, req.auth!.id, event.name);
      }
      return event;
    });
    svc.invalidateEvent(id);
    const windows = await svc.windowsForEvent(id);
    res.json(
      await withFinePolicy(
        {
          ...eventToApi(updated, svc.now()),
          session_windows: windows.map(windowToApi),
        },
        id,
      ),
    );
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

function incomingStudentRows(req: Request): Record<string, unknown>[] {
  const contentType = req.headers['content-type'] ?? '';
  if (Buffer.isBuffer(req.body)) {
    return rowsFromSpreadsheet(req.body);
  }
  if (contentType.includes('text/csv') || contentType.includes('text/plain')) {
    return fromCsv(typeof req.body === 'string' ? req.body : String(req.body ?? ''));
  }
  const body = jsonObject(req);
  if (typeof body.spreadsheet === 'string') {
    return rowsFromSpreadsheet(Buffer.from(body.spreadsheet, 'base64'));
  }
  if (typeof body.csv === 'string') {
    return fromCsv(body.csv);
  }
  if (Array.isArray(body.students)) {
    return body.students.filter(
      (m): m is Record<string, unknown> => !!m && typeof m === 'object' && !Array.isArray(m),
    );
  }
  throw badRequest('Provide csv text, a students array, or a spreadsheet file');
}

function fromCsv(text: string): Record<string, unknown>[] {
  const rows = parseCsv(text, detectDelimiter(text));
  if (rows.length === 0) return [];
  const first = rows[0].map((h) => h.replace(/^\uFEFF/, '').trim());
  const knownHeaders = new Set([
    'studentid',
    'studentidcode',
    'code',
    'fname',
    'lname',
    'fullname',
    'name',
  ]);
  const hasHeader = first.some((h) => knownHeaders.has(h.toLowerCase().replace(/[\s_-]+/g, '')));
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

// --- fine policies & rules ---

adminRouter.get(
  '/fine-templates',
  asyncHandler(async (req, res) => {
    const publishedOnly = queryString(req, 'published') === '1';
    const templates = await q.listFineTemplates(getPool(), {
      includeInactive: !publishedOnly,
      publishedOnly,
    });
    res.json(templates);
  }),
);

adminRouter.put(
  '/fine-templates/:id',
  asyncHandler(async (req, res) => {
    const id = parsePathId(req.params.id);
    const body = jsonObject(req);
    const isActive = optionalBool(body, 'is_active');
    if (isActive == null) throw badRequest('Field "is_active" is required');
    const updated = await q.setFineTemplateActive(getPool(), id, isActive);
    if (!updated) throw notFound('Fine template not found');
    res.json(updated);
  }),
);

adminRouter.get(
  '/events/:id/fine-policy',
  asyncHandler(async (req, res) => {
    const eventId = parsePathId(req.params.id);
    const policy = await q.getEventFinePolicy(getPool(), eventId);
    res.json(policy);
  }),
);

adminRouter.post(
  '/events/:id/fine-policy/from-template',
  asyncHandler(async (req, res) => {
    const eventId = parsePathId(req.params.id);
    const body = jsonObject(req);
    const templateVersionId = requireInt(body, 'template_version_id');
    const policyCode = optionalString(body, 'policy_code') ?? `FP-EVT-${eventId}`;
    const policyName = optionalString(body, 'policy_name') ?? `Event ${eventId} Fine Policy`;

    const policyId = await q.applyFinePolicyTemplateToEvent(getPool(), {
      eventId,
      templateVersionId,
      policyCode,
      policyName,
      actorUserId: req.auth!.id,
    });

    const policy = await q.getEventFinePolicy(getPool(), eventId);
    res.status(201).json({ policy_id: policyId, ...policy });
  }),
);

adminRouter.put(
  '/events/:id/fine-policy/rules',
  asyncHandler(async (req, res) => {
    const eventId = parsePathId(req.params.id);
    const body = jsonObject(req);
    const rawRules = body.rules;
    if (!Array.isArray(rawRules)) {
      throw badRequest('Body must contain a rules array');
    }

    const policyCode = optionalString(body, 'policy_code') ?? undefined;
    const policyName = optionalString(body, 'policy_name') ?? undefined;

    const parsedRules: q.UpsertFineRuleInput[] = [];
    for (const r of rawRules) {
      if (!r || typeof r !== 'object') continue;
      const ruleObj = r as Record<string, unknown>;
      const sessionId = Number(ruleObj.session_id);
      const violationCode = String(ruleObj.violation_code || '').trim().toUpperCase();
      const fineAmount = Number(ruleObj.fine_amount ?? 0);
      const priorityOrder = ruleObj.priority_order != null ? Number(ruleObj.priority_order) : undefined;
      if (!sessionId || !violationCode || isNaN(fineAmount)) {
        throw badRequest('Each rule requires valid session_id, violation_code, and fine_amount');
      }

      let override: { fineAmount: number; overrideReason: string } | null | undefined = undefined;
      if (ruleObj.override === null) {
        override = null;
      } else if (ruleObj.override && typeof ruleObj.override === 'object') {
        const o = ruleObj.override as Record<string, unknown>;
        const oAmount = Number(o.fine_amount);
        const oReason = String(o.override_reason || '').trim();
        if (isNaN(oAmount) || !oReason) {
          throw badRequest('Override requires numeric fine_amount and override_reason');
        }
        override = { fineAmount: oAmount, overrideReason: oReason };
      }

      parsedRules.push({
        sessionId,
        violationCode,
        fineAmount,
        priorityOrder,
        override,
      });
    }

    await withTransaction(getPool(), async (client) => {
      await q.upsertEventFineRules(client, {
        eventId,
        actorUserId: req.auth!.id,
        policyCode,
        policyName,
        rules: parsedRules,
      });
    });

    const updated = await q.getEventFinePolicy(getPool(), eventId);
    res.json(updated);
  }),
);

// --- Composite Event Upsert & Publish ---

adminRouter.post(
  '/events/composite',
  asyncHandler(async (req, res) => {
    const body = jsonObject(req);
    const eventCode = requireString(body, 'event_code');
    const eventName = requireString(body, 'event_name');
    const academicTermId = optionalInt(body, 'academic_term_id') ?? undefined;
    const eventDate = optionalString(body, 'event_date') ?? undefined;
    const sessions = Array.isArray(body.sessions) ? (body.sessions as any[]) : undefined;
    const audienceRules = Array.isArray(body.audience_rules) ? (body.audience_rules as any[]) : undefined;
    const finePolicy = body.fine_policy && typeof body.fine_policy === 'object' ? (body.fine_policy as any) : undefined;

    let createdId = 0;
    await withTransaction(getPool(), async (client) => {
      createdId = await q.upsertCompositeEvent(client, {
        eventCode,
        eventName,
        academicTermId,
        eventDate,
        actorUserId: req.auth!.id,
        sessions,
        audienceRules,
        finePolicy,
      });
    });

    const eventWithPolicy = await q.getEventFinePolicy(getPool(), createdId);
    res.status(201).json({ event_id: createdId, ...eventWithPolicy });
  }),
);

adminRouter.put(
  '/events/:id/composite',
  asyncHandler(async (req, res) => {
    const eventId = parsePathId(req.params.id);
    const body = jsonObject(req);
    const eventCode = requireString(body, 'event_code');
    const eventName = requireString(body, 'event_name');
    const academicTermId = optionalInt(body, 'academic_term_id') ?? undefined;
    const eventDate = optionalString(body, 'event_date') ?? undefined;
    const sessions = Array.isArray(body.sessions) ? (body.sessions as any[]) : undefined;
    const audienceRules = Array.isArray(body.audience_rules) ? (body.audience_rules as any[]) : undefined;
    const finePolicy = body.fine_policy && typeof body.fine_policy === 'object' ? (body.fine_policy as any) : undefined;

    await withTransaction(getPool(), async (client) => {
      await q.upsertCompositeEvent(client, {
        eventId,
        eventCode,
        eventName,
        academicTermId,
        eventDate,
        actorUserId: req.auth!.id,
        sessions,
        audienceRules,
        finePolicy,
      });
    });

    const eventWithPolicy = await q.getEventFinePolicy(getPool(), eventId);
    res.json({ event_id: eventId, ...eventWithPolicy });
  }),
);

adminRouter.post(
  '/events/:id/publish',
  asyncHandler(async (req, res) => {
    const eventId = parsePathId(req.params.id);
    const result = await withTransaction(getPool(), async (client) => {
      return q.publishEventRoster(client, eventId, req.auth!.id);
    });
    res.json({ event_id: eventId, status: 'PUBLISHED', ...result });
  }),
);

adminRouter.post(
  '/events/:id/sessions/:sessionId/assess-fines',
  asyncHandler(async (req, res) => {
    const sessionId = parsePathId(req.params.sessionId);
    const result = await withTransaction(getPool(), async (client) => {
      return q.closeSessionAndAssessFines(client, sessionId, req.auth!.id);
    });
    res.json({ session_id: sessionId, ...result });
  }),
);

// --- Fine Template Upsert ---

adminRouter.post(
  '/fine-templates/upsert',
  asyncHandler(async (req, res) => {
    const body = jsonObject(req);
    const templateCode = requireString(body, 'template_code');
    const templateName = requireString(body, 'template_name');
    const description = optionalString(body, 'description');
    const versionNumber = optionalInt(body, 'version_number') ?? 1;
    const currencyCode = optionalString(body, 'currency_code') ?? 'PHP';
    const maximumFinePerStudent = optionalMoney(body, 'maximum_fine_per_student');
    const publish = optionalBool(body, 'publish') ?? true;
    const isActive = optionalBool(body, 'is_active');
    const rawRules = Array.isArray(body.rules) ? (body.rules as any[]) : [];

    const rules = rawRules.map((r) => ({
      sessionTypeCode: String(r.session_type_code || 'GENERAL').trim().toUpperCase(),
      violationCode: String(r.violation_code || '').trim().toUpperCase(),
      fineAmount: Number(r.fine_amount ?? 0),
      priorityOrder: r.priority_order != null ? Number(r.priority_order) : 100,
    }));
    if (rules.some((r) => !r.violationCode || !Number.isFinite(r.fineAmount) || r.fineAmount < 0)) {
      throw badRequest('Each rule needs a violation_code and a fine_amount of 0 or more');
    }

    const result = await withTransaction(getPool(), async (client) => {
      const saved = await q.upsertFineTemplateWithVersion(client, {
        templateCode,
        templateName,
        description,
        versionNumber,
        currencyCode,
        maximumFinePerStudent,
        publish,
        actorUserId: req.auth!.id,
        rules,
      });
      if (isActive != null) {
        await q.setFineTemplateActive(client, saved.templateId, isActive);
      }
      return saved;
    });

    const matched = await q.getFineTemplateById(getPool(), result.templateId);
    res.status(201).json(matched ?? result);
  }),
);

// --- Fine Balances, Payments & Waivers ---

adminRouter.get(
  '/fines/balances',
  asyncHandler(async (req, res) => {
    const studentId = queryInt(req, 'student_id') ?? undefined;
    const studentNumber = queryString(req, 'student_number') ?? undefined;
    const sessionId = queryInt(req, 'session_id') ?? undefined;
    const violationCode = queryString(req, 'violation_code') ?? undefined;
    const status = queryString(req, 'status') ?? undefined;

    const balances = await q.listStudentFineBalances(getPool(), {
      studentId,
      studentNumber,
      sessionId,
      violationCode,
      status,
    });
    res.json(balances);
  }),
);

adminRouter.post(
  '/fines/payments',
  asyncHandler(async (req, res) => {
    const body = jsonObject(req);
    const paymentReference = requireString(body, 'payment_reference');
    const paymentMethodCode = requireString(body, 'payment_method_code').toUpperCase();
    const totalAmount = Number(body.total_amount);
    const externalPaymentReference = optionalString(body, 'external_payment_reference');
    const rawAllocations = body.allocations;

    if (isNaN(totalAmount) || totalAmount <= 0) {
      throw badRequest('total_amount must be a positive number');
    }
    if (!Array.isArray(rawAllocations) || rawAllocations.length === 0) {
      throw badRequest('allocations must be a non-empty array');
    }

    const allocations = rawAllocations.map((a: any) => ({
      assessment_id: Number(a.assessment_id),
      amount: Number(a.amount),
    }));

    const paymentId = await withTransaction(getPool(), async (client) => {
      return q.postFinePayment(client, {
        paymentReference,
        paymentMethodCode,
        totalAmount,
        externalPaymentReference,
        actorUserId: req.auth!.id,
        allocations,
      });
    });

    res.status(201).json({ payment_id: paymentId, payment_reference: paymentReference, total_amount: totalAmount });
  }),
);

adminRouter.post(
  '/fines/payments/:id/void',
  asyncHandler(async (req, res) => {
    const paymentId = parsePathId(req.params.id);
    const body = jsonObject(req);
    const voidReason = requireString(body, 'void_reason');

    await withTransaction(getPool(), async (client) => {
      await q.voidFinePayment(client, {
        paymentId,
        voidReason,
        actorUserId: req.auth!.id,
      });
    });

    res.json({ payment_id: paymentId, status: 'VOIDED', reason: voidReason });
  }),
);

adminRouter.post(
  '/fines/waivers',
  asyncHandler(async (req, res) => {
    const body = jsonObject(req);
    const assessmentId = requireInt(body, 'assessment_id');
    const waiverReason = requireString(body, 'waiver_reason');

    const waiverId = await withTransaction(getPool(), async (client) => {
      return q.requestFineWaiver(client, {
        assessmentId,
        waiverReason,
        actorUserId: req.auth!.id,
      });
    });

    res.status(201).json({ waiver_request_id: waiverId, assessment_id: assessmentId, status: 'PENDING' });
  }),
);

adminRouter.post(
  '/fines/waivers/:id/review',
  asyncHandler(async (req, res) => {
    const waiverRequestId = parsePathId(req.params.id);
    const body = jsonObject(req);
    const decision = requireString(body, 'decision').toUpperCase() as 'APPROVED' | 'REJECTED';
    const reviewNotes = requireString(body, 'review_notes');

    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      throw badRequest('decision must be APPROVED or REJECTED');
    }

    await withTransaction(getPool(), async (client) => {
      await q.reviewFineWaiver(client, {
        waiverRequestId,
        decision,
        reviewNotes,
        actorUserId: req.auth!.id,
      });
    });

    res.json({ waiver_request_id: waiverRequestId, decision, review_notes: reviewNotes });
  }),
);


