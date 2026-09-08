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

/** Auth, admin, moderator, and student REST handlers under `prefix`. */
export function mountRestApi(app: Express, prefix = ''): void {
  const p = prefix.replace(/\/$/, '');

  if (p) {
    app.get([p, `${p}/`], apiInfo);
  }

  app.get(`${p}/health`, health);
  app.post(`${p}/auth/login`, authRouter.login);
  app.get(`${p}/auth/me`, ...authRouter.me);

  app.use(`${p}/admin`, requireAuth(new Set([ROLES.superadmin])), adminRouter);
  app.use(`${p}/moderator`, requireAuth(new Set([ROLES.moderator])), moderatorRouter);
  app.use(`${p}/student`, studentRouter);
}

export { apiInfo };
