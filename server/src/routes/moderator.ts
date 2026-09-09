import { Router, type Request } from 'express';

import { AttendanceService, pickWindowForTime, previewToApi } from '../attendance/service.ts';
import * as q from '../db/queries.ts';
import { getPool } from '../db/pool.ts';
import { scanPreviewGuard, scanWriteGuard } from '../infra/httpGuards.ts';
import { SCAN_STATUS } from '../types.ts';
import { badRequest, notFound } from '../utils/errors.ts';
import {
  jsonObject,
  optionalInt,
  optionalString,
  queryInt,
  queryString,
  requireInt,
} from '../utils/http.ts';
import { parseIsoDateTime, isTodayOrFuture, isSameDay } from '../utils/time.ts';
import {
  attendanceDetailToApi,
  attendanceToApi,
  eventToApi,
  windowToApi,
} from '../utils/serialize.ts';
import { asyncHandler } from './auth.ts';

function service(req: Request): AttendanceService {
  return req.app.locals.attendance as AttendanceService;
}

export const moderatorRouter = Router();

moderatorRouter.get(
  '/events/active',
  asyncHandler(async (req, res) => {
    const svc = service(req);
    const now = svc.now();
    await svc.deactivateExpiredEvents();
    const events = await svc.catalog.listActiveEvents();
    const windows = await svc.catalog.listAllWindows();
    const list = events
      .filter((e) => isTodayOrFuture(e.event_date, now))
      .map((e) => {
        const ws = windows.filter((w) => w.event_id === e.id);
        const current = pickWindowForTime(ws, now);
        return {
          ...eventToApi(e, now),
          is_today: isSameDay(e.event_date, now),
          session_windows: ws.map(windowToApi),
          current_session_window_id: current?.id ?? null,
        };
      })
      .sort((a, b) => {
        const at = a.is_today ? 0 : 1;
        const bt = b.is_today ? 0 : 1;
        return at - bt;
      });
    res.json({ server_time: now.toISOString(), events: list });
  }),
);

moderatorRouter.get(
  '/session-windows',
  asyncHandler(async (req, res) => {
    const svc = service(req);
    const eventId = queryInt(req, 'event_id');
    if (eventId == null) throw badRequest('event_id is required');
    const mode = queryString(req, 'mode') ?? 'auto';
    const override = queryString(req, 'override');
    const windows = await svc.windowsForEvent(eventId);
    const now = svc.now();
    let selected = null as (typeof windows)[number] | null;
    if (mode === 'manual') {
      if (!override) throw badRequest('override is required in manual mode');
      selected =
        windows.find(
          (w) =>
            w.session_label.toLowerCase() === override.toLowerCase() ||
            String(w.id) === override,
        ) ?? null;
      if (!selected) throw notFound(`No session named "${override}"`);
    } else {
      selected = pickWindowForTime(windows, now);
    }
    res.json({
      server_time: now.toISOString(),
      mode,
      selected: selected ? windowToApi(selected) : null,
      windows: windows.map(windowToApi),
    });
  }),
);

moderatorRouter.get(
  '/scans/mine',
  asyncHandler(async (req, res) => {
    const svc = service(req);
    const statusRaw = queryString(req, 'status');
    const dateRaw = queryString(req, 'date');
    if (
      statusRaw != null &&
      statusRaw !== 'all' &&
      statusRaw !== SCAN_STATUS.confirmed &&
      statusRaw !== SCAN_STATUS.cancelled
    ) {
      throw badRequest('status must be "confirmed", "cancelled" or "all"');
    }
    let date: Date | null | undefined;
    if (dateRaw == null) {
      date = svc.now();
    } else if (dateRaw !== 'all') {
      date = parseIsoDateTime(dateRaw);
      if (!date) throw badRequest('date must be an ISO date or "all"');
    } else {
      date = null;
    }
    const rows = await q.listAttendance(getPool(), {
      eventId: queryInt(req, 'event_id'),
      studentId: queryInt(req, 'student_id'),
      sessionWindowId: queryInt(req, 'session_window_id'),
      scannedBy: req.auth!.id,
      status: statusRaw === 'all' ? null : (statusRaw ?? SCAN_STATUS.confirmed),
      date,
      search: queryString(req, 'q'),
      limit: queryInt(req, 'limit') ?? 200,
    });
    res.json(rows.map(attendanceDetailToApi));
  }),
);

moderatorRouter.post(
  '/scan/preview',
  scanPreviewGuard,
  asyncHandler(async (req, res) => {
    const svc = service(req);
    const body = jsonObject(req);
    const eventId = requireInt(body, 'event_id');
    const payload =
      optionalString(body, 'student_id_code') ?? optionalString(body, 'qr_payload');
    if (!payload) throw badRequest('student_id_code is required');
    const preview = await svc.preview({
      eventId,
      qrPayload: payload,
      sessionWindowId: optionalInt(body, 'session_window_id'),
    });
    res.json(previewToApi(preview));
  }),
);

moderatorRouter.post(
  '/scan/confirm',
  scanWriteGuard,
  asyncHandler(async (req, res) => {
    const svc = service(req);
    const body = jsonObject(req);
    const log = await svc.confirm({
      eventId: requireInt(body, 'event_id'),
      studentId: requireInt(body, 'student_id'),
      sessionWindowId: requireInt(body, 'session_window_id'),
      scannedBy: req.auth!.id,
      expectedDirection: optionalString(body, 'direction'),
      deviceNote: optionalString(body, 'device_note'),
    });
    const detail = await q.getAttendanceDetail(getPool(), log.id);
    res.status(201).json(attendanceDetailToApi(detail!));
  }),
);

moderatorRouter.post(
  '/scan/cancel',
  scanWriteGuard,
  asyncHandler(async (req, res) => {
    const svc = service(req);
    const body = jsonObject(req);
    const log = await svc.cancel({
      eventId: requireInt(body, 'event_id'),
      studentId: requireInt(body, 'student_id'),
      sessionWindowId: requireInt(body, 'session_window_id'),
      scannedBy: req.auth!.id,
      direction: optionalString(body, 'direction'),
      deviceNote: optionalString(body, 'device_note'),
    });
    res.status(201).json(attendanceToApi(log));
  }),
);
