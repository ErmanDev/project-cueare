import { describe, expect, it } from 'bun:test';
import type { Pool } from 'pg';

import { IdempotencyMaintenanceService } from '../../src/nest/modules/attendance/infrastructure/idempotency-maintenance.service.ts';

describe('idempotency maintenance', () => {
  it('coalesces overlapping cleanup runs and records deletion metrics', async () => {
    let calls = 0;
    let releaseQuery: (() => void) | undefined;
    const pool = {
      query: async () => {
        calls += 1;
        await new Promise<void>((resolve) => {
          releaseQuery = resolve;
        });
        return { rowCount: 3, rows: [] };
      },
    } as unknown as Pool;
    const service = new IdempotencyMaintenanceService(pool, 0, 100);

    const first = service.cleanup();
    const second = service.cleanup();
    expect(second).toBe(first);
    releaseQuery?.();

    expect(await first).toBe(3);
    expect(calls).toBe(1);
    expect(service.snapshot()).toMatchObject({
      runs: 1,
      failures: 0,
      recordsDeleted: 3,
      lastRunAt: expect.any(String),
    });
  });

  it('tracks cleanup failures without exposing database messages in metrics', async () => {
    const pool = {
      query: async () => {
        throw new Error('secret database detail');
      },
    } as unknown as Pool;
    const service = new IdempotencyMaintenanceService(pool, 0, 100);

    await expect(service.cleanup()).rejects.toThrow('secret database detail');
    expect(service.snapshot()).toMatchObject({ runs: 1, failures: 1, recordsDeleted: 0 });
    expect(JSON.stringify(service.snapshot())).not.toContain('secret database detail');
  });
});
