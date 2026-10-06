import type { ErrorRequestHandler, Express } from 'express';
import express from 'express';

import { AttendanceService } from '../attendance/service.ts';
import { getConfig } from '../config.ts';
import { getPool } from '../db/pool.ts';
import { createHttpGuards, type ServerRuntime } from '../infra/httpGuards.ts';
import { createHttpObservabilityMiddleware } from '../infra/http-observability.ts';
import {
  CORS_ALLOWED_HEADERS,
  CORS_METHODS,
  createSecurityHeadersMiddleware,
  isCorsOriginAllowed,
} from '../infra/http-security.ts';
import { ScanWriteQueue } from '../infra/queue.ts';
import { apiInfo, mountRestApi } from './routes/index.ts';
import { mountSwagger } from '../swagger/ui.ts';
import { ApiError, fromPgBusinessRule } from '../utils/errors.ts';
import { mountWebApp, resolveWebDist } from '../web.ts';

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
    app.set('trust proxy', config.trustProxy);
  }

  app.use(createSecurityHeadersMiddleware());
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && isCorsOriginAllowed(config.cors, origin)) {
      res.setHeader(
        'Access-Control-Allow-Origin',
        config.cors.allowedOrigins.includes('*') ? '*' : origin,
      );
      if (!config.cors.allowedOrigins.includes('*')) res.vary('Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', CORS_METHODS.join(', '));
    res.setHeader('Access-Control-Allow-Headers', CORS_ALLOWED_HEADERS.join(', '));
    res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id');
    res.setHeader('Permissions-Policy', 'camera=(self)');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json({ limit: config.requestLimits.jsonBytes }));
  app.use(
    express.text({
      type: ['text/csv', 'text/plain'],
      limit: config.requestLimits.textBytes,
    }),
  );
  app.use(
    express.raw({
      type: [
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ],
      limit: config.requestLimits.fileBytes,
    }),
  );

  app.use(createHttpObservabilityMiddleware());

  mountSwagger(app);
  mountRestApi(app, '/api');
  mountRestApi(app, '/api/v1');
  mountRestApi(app, '/v1');
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
    const pgRule = fromPgBusinessRule(err);
    if (pgRule) {
      res.status(pgRule.statusCode).json(pgRule.toBody());
      return;
    }
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  };
  app.use(errorHandler);

  return app;
}
