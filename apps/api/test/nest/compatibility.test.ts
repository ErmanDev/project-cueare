import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import type { AttendanceService } from '../../src/attendance/service.ts';
import { createMigrationHost } from '../../src/nest/compatibility/create-migration-host.ts';

describe('Nest migration compatibility shell', () => {
  let url = '';
  let close: () => Promise<void> = async () => {};

  beforeAll(async () => {
    const { nestApp, httpServer } = await createMigrationHost({} as AttendanceService);
    await new Promise<void>((resolve, reject) => {
      httpServer.once('listening', resolve);
      httpServer.once('error', reject);
      httpServer.listen(0, '127.0.0.1');
    });

    const { port } = httpServer.address() as AddressInfo;
    url = `http://127.0.0.1:${port}`;
    close = async () => {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
      await nestApp.close();
    };
  });

  afterAll(async () => {
    await close();
  });

  it('preserves canonical and legacy health routes', async () => {
    const [canonical, legacy] = await Promise.all([
      fetch(`${url}/api/health`),
      fetch(`${url}/health`),
    ]);

    expect(canonical.status).toBe(200);
    expect(legacy.status).toBe(200);
    expect((await canonical.json() as { status: string }).status).toBe('ok');
    expect((await legacy.json() as { status: string }).status).toBe('ok');
  });

  it('applies security headers and development CORS compatibility', async () => {
    const response = await fetch(`${url}/api/v2/health`, {
      headers: { Origin: 'https://local-development.example' },
    });

    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN');
  });

  it('serves the migrated versioned health aliases from Nest', async () => {
    const [apiV1, v1] = await Promise.all([
      fetch(`${url}/api/v1/health`),
      fetch(`${url}/v1/health`),
    ]);

    expect(apiV1.status).toBe(200);
    expect(v1.status).toBe(200);
    expect((await apiV1.json() as { status: string }).status).toBe('ok');
    expect((await v1.json() as { status: string }).status).toBe('ok');
  });

  it('adds the v2 envelope without changing legacy health responses', async () => {
    const v2 = await fetch(`${url}/api/v2/health`, {
      headers: { 'x-request-id': 'health-contract-test' },
    });
    const legacy = await fetch(`${url}/api/health`);

    expect(v2.status).toBe(200);
    expect(await v2.json()).toEqual({
      data: {
        status: 'ok',
        serverTime: expect.any(String),
      },
      meta: { requestId: 'health-contract-test' },
    });
    const legacyBody = await legacy.json() as Record<string, unknown>;
    expect(legacyBody.status).toBe('ok');
    expect(legacyBody.data).toBeUndefined();
  });

  it('returns the v2 error contract for unknown v2 routes', async () => {
    const response = await fetch(`${url}/api/v2/does-not-exist`, {
      headers: { 'x-request-id': 'missing-route-test' },
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Cannot GET /api/v2/does-not-exist',
      },
      meta: { requestId: 'missing-route-test' },
    });
  });

  it('preserves API metadata and JSON not-found responses', async () => {
    const info = await fetch(`${url}/api`);
    expect(info.status).toBe(200);
    expect((await info.json() as { api: string }).api).toBe('/api');

    const missing = await fetch(`${url}/api/does-not-exist`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'Not found' });
  });
});
