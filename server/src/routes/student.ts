import { Router, type Request } from 'express';

import { AttendanceService } from '../attendance/service.ts';
import { requireAuth } from '../auth/middleware.ts';
import * as q from '../db/queries.ts';
import { getPool } from '../db/pool.ts';
import { ROLES, SCAN_STATUS } from '../types.ts';
import { conflict, notFound, unauthorized } from '../utils/errors.ts';
import { parsePathId, queryInt } from '../utils/http.ts';
import { requireValidStudentCode } from '../utils/studentCode.ts';
import { attendanceDetailToApi, eventToApi, studentToApi, toIso } from '../utils/serialize.ts';
import { asyncHandler, studentFromAuth } from './auth.ts';

function service(req: Request): AttendanceService {
  return req.app.locals.attendance as AttendanceService;
}

function sessionToApi(row: q.StudentEventSessionRow): Record<string, unknown> {
  return {
    session_id: row.session_id,
    session_name: row.session_name,
    session_date: row.session_date,
    status: row.status,
    checked_in_at_utc: toIso(row.checked_in_at_utc),
    checked_out_at_utc: toIso(row.checked_out_at_utc),
  };
}

export const studentRouter = Router();

studentRouter.get(
  '/me/events',
  requireAuth(new Set([ROLES.student])),
  asyncHandler(async (req, res) => {
    const student = await studentFromAuth(req.auth!);
    if (!student) throw unauthorized('User no longer exists');
    const events = await q.listRegisteredEventsForStudent(getPool(), student.id);
    const sessions = await q.listStudentEventSessions(getPool(), student.id);
    const byEvent = new Map<number, q.StudentEventSessionRow[]>();
    for (const session of sessions) {
      const list = byEvent.get(session.event_id) ?? [];
      list.push(session);
      byEvent.set(session.event_id, list);
    }
    const now = service(req).now();
    res.json({
      events: events.map((event) => ({
        ...eventToApi(event, now),
        sessions: (byEvent.get(event.id) ?? []).map(sessionToApi),
      })),
    });
  }),
);

studentRouter.get(
  '/me/fines',
  requireAuth(new Set([ROLES.student])),
  asyncHandler(async (req, res) => {
    const student = await studentFromAuth(req.auth!);
    if (!student) throw unauthorized('User no longer exists');
    const fines = await q.listFinesForStudent(getPool(), student.id);
    res.json({ fines });
  }),
);

studentRouter.get(
  '/me/events/:eventId/qr',
  requireAuth(new Set([ROLES.student])),
  asyncHandler(async (req, res) => {
    const student = await studentFromAuth(req.auth!);
    if (!student) throw unauthorized('User no longer exists');
    const eventId = parsePathId(req.params.eventId);
    const event = await q.getEventById(getPool(), eventId);
    if (!event) throw notFound('Event not found');
    const payload = eventToApi(event, service(req).now());
    if (!payload.is_active) {
      throw conflict('This event is not active');
    }
    const token = await q.ensureStudentEventQrToken(
      getPool(),
      eventId,
      student.id,
      event.created_by,
    );
    if (!token) throw notFound('You are not registered for this event');
    res.json({
      token,
      event: payload,
      student: studentToApi(student),
    });
  }),
);

studentRouter.get(
  '/:code/qr',
  asyncHandler(async (req, res) => {
    const safeCode = requireValidStudentCode(req.params.code);
    const student = await service(req).catalog.getStudentByCode(safeCode);
    if (!student) throw notFound(`No student found for code "${safeCode}"`);
    res.json({
      student: studentToApi(student),
      qr_payload: service(req).qrPayloadFor(student),
    });
  }),
);

studentRouter.get(
  '/:code/attendance',
  asyncHandler(async (req, res) => {
    const safeCode = requireValidStudentCode(req.params.code);
    const student = await service(req).catalog.getStudentByCode(safeCode);
    if (!student) throw notFound(`No student found for code "${safeCode}"`);
    const rows = await q.listAttendance(getPool(), {
      studentId: student.id,
      eventId: queryInt(req, 'event_id'),
      status: SCAN_STATUS.confirmed,
      limit: queryInt(req, 'limit') ?? 500,
    });
    res.json({
      student: studentToApi(student),
      attendance: rows.map(attendanceDetailToApi),
    });
  }),
);
