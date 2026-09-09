import type { ErrorRequestHandler, Express } from 'express';
import express from 'express';

import { AttendanceService } from './attendance/service.ts';
import { getConfig } from './config.ts';
import { getPool } from './db/pool.ts';
import { createHttpGuards, type ServerRuntime } from './infra/httpGuards.ts';
import { ScanWriteQueue } from './infra/queue.ts';
import { apiInfo, mountRestApi } from './routes/index.ts';
import { mountSwagger } from './swagger/ui.ts';
import { ApiError } from './utils/errors.ts';
import { mountWebApp, resolveWebDist } from './web.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Origin, Content-Type, Authorization',
};

export function createApp(service?: AttendanceService): Express {
  const app = express();
  const config = getConfig();
  const runtime: ServerRuntime = {
    rateLimitEnabled: config.rateLimit.enabled,
    guards: createHttpGuards(config.rateLimit),
  };
  const attendance =
    service ??
    new AttendanceService(getPool(), {
      qrHmacSecret: config.qrHmacSecret,
      runtime: config.runtime,
      writeQueue: new ScanWriteQueue({ concurrency: config.runtime.scanConcurrency }),
    });
  app.locals.attendance = attendance;
  app.locals.runtime = runtime;
  if (config.trustProxy) {
    app.set('trust proxy', 1);
  }

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

  mountSwagger(app);
  mountRestApi(app, '/api');
  // Unprefixed aliases so older APKs that call /auth/login still work.
  mountRestApi(app);

  const webDir = resolveWebDist();
  if (webDir) {
    mountWebApp(app, webDir);
  } else {
    app.get('/', apiInfo);
  }

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({ error: 'Request body is not valid JSON' });
      return;
    }
    if (err instanceof ApiError) {
      const retry = err.details?.retry_after_seconds;
      if (err.statusCode === 429 && typeof retry === 'number') {
        res.setHeader('Retry-After', String(retry));
      }
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
