import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { createApp } from '../src/legacy/app.ts';
import type { AttendanceService } from '../src/attendance/service.ts';
import { issueToken } from '../src/auth/jwt.ts';

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

  it('protects contribution reads and writes from anonymous, student, and moderator access', async () => {
    for (const role of [null, 'student', 'moderator']) {
      const headers: Record<string, string> = role ? { Authorization: `Bearer ${issueToken({ id: 1, username: 'test', role })}` } : {};
      for (const [method, path] of [['GET', ''], ['POST', '/types'], ['POST', '/types/1/assign'],
        ['POST', '/1/payments'], ['POST', '/1/waive'], ['POST', '/payments/1/void']]) {
        const response = await fetch(`${url}/api/admin/events/1/contributions${path}`, { method, headers });
        expect(response.status).toBe(role ? 403 : 401);
      }
    }
  });

  it('validates contribution event ids before accessing the database', async () => {
    const response = await fetch(`${url}/api/admin/events/invalid/contributions`, {
      headers: { Authorization: `Bearer ${issueToken({ id: 1, username: 'test', role: 'superadmin' })}` },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'event_id must be a positive integer' });
  });
});
