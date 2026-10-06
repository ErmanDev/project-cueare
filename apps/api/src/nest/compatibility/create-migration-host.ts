import 'reflect-metadata';

import http from 'node:http';

import type { INestApplication, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import type { Express } from 'express';

import type { AttendanceService } from '../../attendance/service.ts';
import { getConfig } from '../../config.ts';
import { createHttpObservabilityMiddleware } from '../../infra/http-observability.ts';
import {
  CORS_ALLOWED_HEADERS,
  CORS_METHODS,
  corsOriginSetting,
  createSecurityHeadersMiddleware,
} from '../../infra/http-security.ts';
import { createApp } from '../../legacy/app.ts';
import { AppModule } from '../app.module.ts';
import { ApiErrorFilter } from './api-error.filter.ts';
import { isNestOwnedRequest } from './route-ownership.ts';

export type MigrationHost = {
  nestApp: INestApplication;
  httpServer: http.Server;
};

/**
 * Builds a strangler host that sends explicitly migrated routes to Nest and all
 * other traffic to the unchanged Express application.
 *
 * Adding a legacy-compatible route to Nest requires both a controller and an
 * entry in route-ownership.ts. The additive /api/v2 namespace is reserved for
 * Nest so its success, error, and not-found contracts stay consistent.
 */
export async function createMigrationHost(
  attendanceService?: AttendanceService,
  rootModule: Type<unknown> = AppModule,
): Promise<MigrationHost> {
  const config = getConfig();
  const nestApp = await NestFactory.create(rootModule, new ExpressAdapter(), {
    bodyParser: false,
  });
  nestApp.use(createSecurityHeadersMiddleware());
  nestApp.use(express.json({ limit: config.requestLimits.jsonBytes }));
  nestApp.enableCors({
    origin: corsOriginSetting(config.cors),
    methods: CORS_METHODS,
    allowedHeaders: CORS_ALLOWED_HEADERS,
    exposedHeaders: ['X-Request-Id'],
  });
  nestApp.use(createHttpObservabilityMiddleware());
  nestApp.useGlobalFilters(new ApiErrorFilter());
  await nestApp.init();

  const nestHandler = nestApp.getHttpAdapter().getInstance() as Express;
  if (config.trustProxy) nestHandler.set('trust proxy', config.trustProxy);
  const legacyHandler = createApp(attendanceService);
  const httpServer = http.createServer((req, res) => {
    const handler = isNestOwnedRequest(req) ? nestHandler : legacyHandler;
    handler(req, res);
  });

  return { nestApp, httpServer };
}
