import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Module } from '@nestjs/common';

import type { AttendanceService } from '../../src/attendance/service.ts';
import { issueToken } from '../../src/auth/jwt.ts';
import { createMigrationHost } from '../../src/nest/compatibility/create-migration-host.ts';
import { AuthGuard } from '../../src/nest/modules/auth/api/auth.guard.ts';
import { HealthV2Controller } from '../../src/nest/modules/health/health-v2.controller.ts';
import { MetricsV2Controller } from '../../src/nest/modules/health/metrics-v2.controller.ts';
import { ROLES } from '../../src/types.ts';
import { ApiError } from '../../src/utils/errors.ts';
import {
  DatabaseReadinessProbe,
  ReadinessService,
} from '../../src/nest/modules/health/readiness.service.ts';

const pool = {
  totalConnections: 8,
  idleConnections: 5,
  waitingRequests: 0,
  acquireCount: 20,
  acquireFailureCount: 0,
  averageAcquireWaitMs: 1.25,
  idleClientErrorCount: 0,
};

const readyProbe = {
  check: async () => ({ latencyMs: 2.5, pool }),
} as DatabaseReadinessProbe;

@Module({
  controllers: [HealthV2Controller, MetricsV2Controller],
  providers: [
    AuthGuard,
    ReadinessService,
    { provide: DatabaseReadinessProbe, useValue: readyProbe },
  ],
})
class TestReadinessAppModule {}

describe('readiness service', () => {
  it('reports database latency and non-sensitive pool telemetry', async () => {
    const probe = {
      check: async () => ({ latencyMs: 2.5, pool }),
    } as DatabaseReadinessProbe;

    expect(await new ReadinessService(probe).check()).toEqual({
      status: 'ready',
      dependencies: { database: { status: 'ready', latencyMs: 2.5 } },
      pool,
    });
  });

  it('maps database failures to a stable 503 contract without leaking the cause', async () => {
    const probe = {
      check: async () => {
        throw new Error('password authentication failed for secret-user');
      },
    } as DatabaseReadinessProbe;

    try {
      await new ReadinessService(probe).check();
      throw new Error('Expected readiness check to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        statusCode: 503,
        message: 'Service is not ready.',
        details: { code: 'DATABASE_UNAVAILABLE', dependency: 'database' },
      });
      expect(String(error)).not.toContain('secret-user');
    }
  });
});

describe('readiness HTTP contract', () => {
  let url = '';
  let close: () => Promise<void> = async () => {};

  beforeAll(async () => {
    const { nestApp, httpServer } = await createMigrationHost(
      {} as AttendanceService,
      TestReadinessAppModule,
    );
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

  afterAll(async () => close());

  it('serves readiness through the v2 response envelope', async () => {
    const response = await fetch(`${url}/api/v2/readiness`, {
      headers: { 'x-request-id': 'readiness-test' },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        status: 'ready',
        dependencies: { database: { status: 'ready', latencyMs: 2.5 } },
        pool,
      },
      meta: { requestId: 'readiness-test' },
    });
  });

  it('restricts operational metrics to superadmins', async () => {
    const unauthenticated = await fetch(`${url}/api/v2/metrics`);
    expect(unauthenticated.status).toBe(401);

    const moderator = issueToken({ id: 12, username: 'mod', role: ROLES.moderator });
    const forbidden = await fetch(`${url}/api/v2/metrics`, {
      headers: { authorization: `Bearer ${moderator}` },
    });
    expect(forbidden.status).toBe(403);

    const superadmin = issueToken({ id: 1, username: 'admin', role: ROLES.superadmin });
    const response = await fetch(`${url}/api/v2/metrics`, {
      headers: { authorization: `Bearer ${superadmin}` },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        http: {
          requests: expect.any(Number),
          clientErrors: expect.any(Number),
          serverErrors: expect.any(Number),
          routes: expect.any(Array),
        },
        database: {
          totalConnections: expect.any(Number),
          waitingRequests: expect.any(Number),
        },
      },
      meta: { requestId: expect.any(String) },
    });
  });
});
