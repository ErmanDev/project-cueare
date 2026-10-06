import type { Request, RequestHandler, Response } from 'express';

import { ensureRequestId } from '../nest/common/http/request-id.ts';

const LATENCY_BUCKETS_MS = [10, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 30_000] as const;
const MAX_ROUTE_LABELS = 200;

type RouteMetrics = {
  requests: number;
  clientErrors: number;
  serverErrors: number;
  durationMsTotal: number;
  maxDurationMs: number;
  buckets: number[];
};

export type HttpRouteMetricsSnapshot = {
  method: string;
  route: string;
  requests: number;
  clientErrors: number;
  serverErrors: number;
  averageDurationMs: number;
  maxDurationMs: number;
  latencyBuckets: Record<string, number>;
};

export type HttpMetricsSnapshot = {
  requests: number;
  clientErrors: number;
  serverErrors: number;
  routes: HttpRouteMetricsSnapshot[];
};

export class HttpMetricsRegistry {
  private readonly routes = new Map<string, RouteMetrics>();

  record(method: string, route: string, statusCode: number, durationMs: number): void {
    const proposed = `${method} ${route}`;
    const key = this.routes.has(proposed)
      ? proposed
      : this.routes.size < MAX_ROUTE_LABELS - 1
        ? proposed
        : 'OTHER __other__';
    const metrics = this.routes.get(key) ?? {
      requests: 0,
      clientErrors: 0,
      serverErrors: 0,
      durationMsTotal: 0,
      maxDurationMs: 0,
      buckets: LATENCY_BUCKETS_MS.map(() => 0),
    };
    metrics.requests += 1;
    if (statusCode >= 400 && statusCode < 500) metrics.clientErrors += 1;
    if (statusCode >= 500) metrics.serverErrors += 1;
    metrics.durationMsTotal += durationMs;
    metrics.maxDurationMs = Math.max(metrics.maxDurationMs, durationMs);
    LATENCY_BUCKETS_MS.forEach((limit, index) => {
      if (durationMs <= limit) metrics.buckets[index] += 1;
    });
    this.routes.set(key, metrics);
  }

  snapshot(): HttpMetricsSnapshot {
    const routes = [...this.routes.entries()].map(([key, metrics]) => {
      const separator = key.indexOf(' ');
      return {
        method: key.slice(0, separator),
        route: key.slice(separator + 1),
        requests: metrics.requests,
        clientErrors: metrics.clientErrors,
        serverErrors: metrics.serverErrors,
        averageDurationMs: Number((metrics.durationMsTotal / metrics.requests).toFixed(2)),
        maxDurationMs: Number(metrics.maxDurationMs.toFixed(2)),
        latencyBuckets: Object.fromEntries(
          LATENCY_BUCKETS_MS.map((limit, index) => [`le_${limit}ms`, metrics.buckets[index]]),
        ),
      };
    });
    return {
      requests: routes.reduce((sum, route) => sum + route.requests, 0),
      clientErrors: routes.reduce((sum, route) => sum + route.clientErrors, 0),
      serverErrors: routes.reduce((sum, route) => sum + route.serverErrors, 0),
      routes,
    };
  }
}

type StructuredLogWriter = (level: 'info' | 'warn' | 'error', entry: Record<string, unknown>) => void;

export function writeStructuredLog(
  level: 'info' | 'warn' | 'error',
  entry: Record<string, unknown>,
): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, ...entry });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function normalizedRoute(request: Request): string {
  const routePath = request.route?.path;
  if (typeof routePath === 'string') return `${request.baseUrl ?? ''}${routePath}` || '/';
  const path = request.path || '/';
  return path
    .split('/')
    .map((segment) => {
      if (/^\d+$/.test(segment)) return ':id';
      if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return ':uuid';
      return segment;
    })
    .join('/');
}

export const httpMetrics = new HttpMetricsRegistry();

export function createHttpObservabilityMiddleware(
  registry: HttpMetricsRegistry = httpMetrics,
  writeLog: StructuredLogWriter = writeStructuredLog,
): RequestHandler {
  return (request: Request, response: Response, next) => {
    const startedAt = performance.now();
    const requestId = ensureRequestId(request, response);
    response.once('finish', () => {
      const durationMs = Number((performance.now() - startedAt).toFixed(2));
      const route = normalizedRoute(request);
      registry.record(request.method, route, response.statusCode, durationMs);
      const auth = (request as Request & {
        auth?: { id?: number; role?: string };
      }).auth;
      const contentLength = response.getHeader('content-length');
      const level = response.statusCode >= 500
        ? 'error'
        : response.statusCode >= 400
          ? 'warn'
          : 'info';
      writeLog(level, {
        event: 'http_request',
        requestId,
        method: request.method,
        route,
        statusCode: response.statusCode,
        durationMs,
        ...(typeof contentLength === 'string' || typeof contentLength === 'number'
          ? { responseBytes: Number(contentLength) }
          : {}),
        ...(typeof auth?.id === 'number' ? { actorId: auth.id } : {}),
        ...(typeof auth?.role === 'string' ? { actorRole: auth.role } : {}),
      });
    });
    next();
  };
}
