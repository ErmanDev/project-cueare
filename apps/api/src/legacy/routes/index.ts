import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';

import { requireAuth } from '../../auth/middleware.ts';
import { getConfig, databaseDisplay } from '../../config.ts';
import { getPool } from '../../db/pool.ts';
import * as q from '../../db/queries.ts';
import { broadcastQrScanEvent, subscribeQrScanStream } from '../../events/sse.ts';
import { ROLES } from '../../types.ts';
import { getCleanClientIp, jsonObject, optionalString, queryInt, requireString } from '../../utils/http.ts';
import { adminRouter } from './admin.ts';
import { asyncHandler, authRouter } from './auth.ts';
import { moderatorRouter } from './moderator.ts';
import { studentRouter } from './student.ts';

function apiInfo(_req: Request, res: Response): void {
  const db = getConfig().database;
  res.json({
    name: 'SSC QR Attendance API',
    status: 'ok',
    server_time: new Date().toISOString(),
    database: databaseDisplay(db),
    docs: '/docs',
    api: '/api',
  });
}

function health(_req: Request, res: Response): void {
  res.json({ status: 'ok', server_time: new Date().toISOString() });
}

/** Auth, admin, moderator, and student REST handlers under `prefix`. */
export function mountRestApi(app: Express, prefix = ''): void {
  const p = prefix.replace(/\/$/, '');

  if (p) {
    app.get([p, `${p}/`], apiInfo);
  }

  app.get(`${p}/health`, health);
  app.post(`${p}/auth/login`, authRouter.login);
  app.get(`${p}/auth/me`, ...authRouter.me);
  app.post(`${p}/auth/change-password`, ...authRouter.changePassword);

  // Published templates for events / anonymous clients
  app.get(
    `${p}/fine-templates`,
    asyncHandler(async (_req, res) => {
      const templates = await q.listFineTemplates(getPool());
      res.json(templates);
    }),
  );

  app.get(
    `${p}/attendance/event-qr/stream`,
    requireAuth(new Set([ROLES.superadmin, ROLES.moderator])),
    (req, res) => {
      const sessionWindowId = queryInt(req, 'sessionWindowId') ?? queryInt(req, 'session_window_id');
      if (!sessionWindowId) {
        res.status(400).json({ error: 'Missing sessionWindowId query parameter' });
        return;
      }
      subscribeQrScanStream(req, res, sessionWindowId);
    },
  );

  app.post(
    `${p}/attendance/event-qr/self-scan`,
    requireAuth(new Set([ROLES.superadmin, ROLES.moderator, 'student'])),
    asyncHandler(async (req, res) => {
      const body = jsonObject(req);
      const qrToken = requireString(body, 'qrToken');
      const clientRequestId = optionalString(body, 'clientRequestId') ?? crypto.randomUUID();
      const clientFingerprint = optionalString(body, 'clientFingerprint');

      const tokenHash = crypto.createHash('sha256').update(qrToken.trim()).digest();
      const clientFingerprintHash = clientFingerprint
        ? crypto.createHash('sha256').update(clientFingerprint.trim()).digest()
        : null;

      try {
        const result = await q.attendanceSelfScanEventQr(getPool(), {
          tokenHash,
          authenticatedUserId: req.auth!.id,
          clientRequestId,
          clientFingerprintHash,
          ipAddress: getCleanClientIp(req),
        });

        const isAccepted = result.scanResultCode === 'ACCEPTED' || result.scanResultCode === 'NO_CHANGE';
        let message = 'Self-scan processed';
        if (result.scanResultCode === 'ACCEPTED') {
          message = `Attendance recorded: ${result.sessionName ?? 'Session'} (${result.actionRecorded ?? 'IN'})`;
        } else if (result.scanResultCode === 'NO_CHANGE') {
          message = `Already recorded (${result.actionRecorded ?? 'IN'}) for ${result.sessionName ?? 'Session'}`;
        } else if (result.failureReasonCode === 'ALREADY_CHECKED_IN') {
          message = `Already checked in for ${result.sessionName ?? 'Session'}`;
        } else if (result.failureReasonCode === 'ALREADY_CHECKED_OUT') {
          message = `Already checked out for ${result.sessionName ?? 'Session'}`;
        } else if (result.failureReasonCode === 'CHECKIN_REQUIRED_FIRST') {
          message = `Check-in is required before check-out for ${result.sessionName ?? 'Session'}`;
        } else if (result.failureReasonCode) {
          message = result.failureReasonCode.replace(/_/g, ' ');
        }

        if (result.eventSessionId) {
          broadcastQrScanEvent(result.eventSessionId, {
            scanResultCode: result.scanResultCode,
            failureReasonCode: result.failureReasonCode,
            studentNumber: result.studentNumber,
            studentFullName: result.studentFullName,
            actionRecorded: result.actionRecorded,
            recordedAtUtc: result.recordedAtUtc,
          });
        }

        res.json({
          scanResultCode: result.scanResultCode,
          failureReasonCode: result.failureReasonCode,
          eventId: result.eventId ? String(result.eventId) : null,
          eventName: result.eventName,
          eventSessionId: result.eventSessionId ? String(result.eventSessionId) : null,
          sessionName: result.sessionName,
          studentId: result.studentId ? String(result.studentId) : null,
          studentNumber: result.studentNumber,
          studentFullName: result.studentFullName,
          actionRecorded: result.actionRecorded,
          attendanceStatus: result.attendanceStatus,
          recordedAtUtc: result.recordedAtUtc,
          message,
        });
      } catch (err) {
        console.error('[SelfScan Error]', err);
        const errMessage = err instanceof Error ? err.message : 'Database error during self scan';
        res.status(400).json({
          scanResultCode: 'REJECTED',
          failureReasonCode: 'SERVER_ERROR',
          message: errMessage,
        });
      }
    }),
  );

  app.use(`${p}/admin`, requireAuth(new Set([ROLES.superadmin])), adminRouter);
  app.use(`${p}/moderator`, requireAuth(new Set([ROLES.moderator])), moderatorRouter);
  app.use(`${p}/student`, studentRouter);
}

export { apiInfo };

