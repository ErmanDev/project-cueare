import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';

import { requireAuth } from '../auth/middleware.ts';
import { getConfig, databaseDisplay } from '../config.ts';
import { ROLES } from '../types.ts';
import { adminRouter } from './admin.ts';
import { authRouter } from './auth.ts';
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

import { asyncHandler } from './auth.ts';
import { getPool } from '../db/pool.ts';
import * as q from '../db/queries.ts';
import { jsonObject, optionalString, requireString } from '../utils/http.ts';

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

      const result = await q.attendanceSelfScanEventQr(getPool(), {
        tokenHash,
        authenticatedUserId: req.auth!.id,
        clientRequestId,
        clientFingerprintHash,
        ipAddress: req.ip,
      });

      const isAccepted = result.scanResultCode === 'ACCEPTED' || result.scanResultCode === 'NO_CHANGE';
      const message = isAccepted
        ? 'Your attendance has been recorded.'
        : (result.failureReasonCode ?? 'Self-scan rejected');

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
    }),
  );

  app.use(`${p}/admin`, requireAuth(new Set([ROLES.superadmin])), adminRouter);
  app.use(`${p}/moderator`, requireAuth(new Set([ROLES.moderator])), moderatorRouter);
  app.use(`${p}/student`, studentRouter);
}

export { apiInfo };

