import type { AddressInfo } from 'node:net';
import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import express from 'express';

import {
  createHttpObservabilityMiddleware,
  HttpMetricsRegistry,
} from '../../src/infra/http-observability.ts';

describe('HTTP observability middleware', () => {
  const registry = new HttpMetricsRegistry();
  const logs: Array<{ level: string; entry: Record<string, unknown> }> = [];
  let url = '';
  let server: http.Server;

  beforeAll(async () => {
    const app = express();
    app.use(createHttpObservabilityMiddleware(
      registry,
      (level, entry) => logs.push({ level, entry }),
    ));
    app.get('/items/:id', (_request, response) => {
      response.status(503).json({ available: false });
    });
    server = http.createServer(app);
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
      server.listen(0, '127.0.0.1');
    });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('emits a correlated structured log without query values', async () => {
    const response = await fetch(`${url}/items/42?token=do-not-log`, {
      headers: { 'x-request-id': 'observability-test' },
    });
    await response.json();

    expect(response.headers.get('x-request-id')).toBe('observability-test');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      level: 'error',
      entry: {
        event: 'http_request',
        requestId: 'observability-test',
        method: 'GET',
        route: '/items/:id',
        statusCode: 503,
      },
    });
    expect(JSON.stringify(logs[0])).not.toContain('do-not-log');
  });

  it('records bounded route latency and error counters', () => {
    expect(registry.snapshot()).toMatchObject({
      requests: 1,
      clientErrors: 0,
      serverErrors: 1,
      routes: [{
        method: 'GET',
        route: '/items/:id',
        requests: 1,
        serverErrors: 1,
      }],
    });
  });

  it('caps route-label cardinality while retaining total request counts', () => {
    const bounded = new HttpMetricsRegistry();
    for (let index = 0; index < 250; index += 1) {
      bounded.record('GET', `/generated/${index}`, 200, 1);
    }
    const snapshot = bounded.snapshot();
    expect(snapshot.requests).toBe(250);
    expect(snapshot.routes.length).toBeLessThanOrEqual(200);
    expect(snapshot.routes).toContainEqual(expect.objectContaining({
      method: 'OTHER',
      route: '__other__',
    }));
  });
});
