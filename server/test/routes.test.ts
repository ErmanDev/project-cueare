import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { createApp } from '../src/app.ts';
import type { AttendanceService } from '../src/attendance/service.ts';

describe('REST API routes', () => {
  let url = '';
  let close: () => Promise<void> = async () => {};

  beforeAll(async () => {
    const app = createApp({} as AttendanceService);
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', () => resolve());
      server.once('error', reject);
    });
    const { port } = server.address() as AddressInfo;
    url = `http://127.0.0.1:${port}`;
    close = () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
  });

  afterAll(async () => {
    await close();
  });

  it('GET /api returns the API info', async () => {
    const res = await fetch(`${url}/api`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; api: string };
    expect(body.status).toBe('ok');
    expect(body.api).toBe('/api');
  });

  it('GET /api/health and /health both work', async () => {
    const prefixed = await fetch(`${url}/api/health`);
    const alias = await fetch(`${url}/health`);
    expect(prefixed.status).toBe(200);
    expect(alias.status).toBe(200);
    expect((await prefixed.json() as { status: string }).status).toBe('ok');
    expect((await alias.json() as { status: string }).status).toBe('ok');
  });

  it('unknown /api path returns 404 JSON', async () => {
    const res = await fetch(`${url}/api/does-not-exist`);
    expect(res.status).toBe(404);
    expect((await res.json() as { error: string }).error).toBe('Not found');
  });
});
