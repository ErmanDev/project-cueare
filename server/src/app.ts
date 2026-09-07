import type { ErrorRequestHandler, Express } from 'express';
import express from 'express';

import { AttendanceService } from './attendance/service.ts';
import { requireAuth } from './auth/middleware.ts';
import { getConfig, databaseDisplay } from './config.ts';
import { getPool } from './db/pool.ts';
import { adminRouter } from './routes/admin.ts';
import { authRouter } from './routes/auth.ts';
import { moderatorRouter } from './routes/moderator.ts';
import { studentRouter } from './routes/student.ts';
import { mountSwagger } from './swagger/ui.ts';
import { ROLES } from './types.ts';
import { ApiError } from './utils/errors.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Origin, Content-Type, Authorization',
};

export function createApp(service?: AttendanceService): Express {
  const app = express();
  const attendance =
    service ??
    new AttendanceService(getPool(), { qrHmacSecret: getConfig().qrHmacSecret });
  app.locals.attendance = attendance;

  app.use((req, res, next) => {
    for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v);
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json({ limit: '2mb' }));
  app.use(express.text({ type: ['text/csv', 'text/plain'], limit: '2mb' }));

  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`);
    });
    next();
  });

  app.get('/', (_req, res) => {
    const db = getConfig().database;
    res.json({
      name: 'SSC QR Attendance API',
      status: 'ok',
      server_time: new Date().toISOString(),
      database: databaseDisplay(db),
      docs: '/docs',
    });
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', server_time: new Date().toISOString() });
  });

  app.post('/auth/login', authRouter.login);
  app.get('/auth/me', ...authRouter.me);

  mountSwagger(app);

  app.use('/admin', requireAuth(new Set([ROLES.superadmin])), adminRouter);
  app.use('/moderator', requireAuth(new Set([ROLES.moderator])), moderatorRouter);
  app.use('/student', studentRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({ error: 'Request body is not valid JSON' });
      return;
    }
    if (err instanceof ApiError) {
      res.status(err.statusCode).json(err.toBody());
      return;
    }
    console.error('Unhandled error:', err);
    res.status(500).json({
      error: 'Internal server error',
      detail: err instanceof Error ? err.message : String(err),
    });
  };
  app.use(errorHandler);

  return app;
}
