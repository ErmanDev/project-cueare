import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { Pool } from 'pg';

import { q } from '../../../../db/ident.ts';
import { writeStructuredLog } from '../../../../infra/http-observability.ts';

export type IdempotencyMaintenanceSnapshot = {
  runs: number;
  failures: number;
  recordsDeleted: number;
  lastRunAt: string | null;
};

@Injectable()
export class IdempotencyMaintenanceService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private active?: Promise<number>;
  private readonly metrics: IdempotencyMaintenanceSnapshot = {
    runs: 0,
    failures: 0,
    recordsDeleted: 0,
    lastRunAt: null,
  };

  constructor(
    private readonly pool: Pool,
    private readonly intervalMs: number,
    private readonly batchSize: number,
  ) {}

  onModuleInit(): void {
    if (this.intervalMs <= 0) return;
    this.timer = setInterval(() => void this.runScheduledCleanup(), this.intervalMs);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.active?.catch(() => undefined);
  }

  cleanup(): Promise<number> {
    if (this.active) return this.active;
    const task = this.deleteExpiredBatch().finally(() => {
      this.active = undefined;
    });
    this.active = task;
    return task;
  }

  snapshot(): IdempotencyMaintenanceSnapshot {
    return { ...this.metrics };
  }

  private async runScheduledCleanup(): Promise<void> {
    try {
      const deleted = await this.cleanup();
      if (deleted > 0) {
        writeStructuredLog('info', {
          event: 'idempotency_cleanup',
          recordsDeleted: deleted,
        });
      }
    } catch (error) {
      writeStructuredLog('error', {
        event: 'idempotency_cleanup_failed',
        errorType: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  }

  private async deleteExpiredBatch(): Promise<number> {
    try {
      const result = await this.pool.query(
        `WITH expired AS (
           SELECT ${q('attendanceConfirmationIdempotencyId')}
           FROM ${q('AttendanceConfirmationIdempotency')}
           WHERE ${q('expiresAtUtc')} <= clock_timestamp()
           ORDER BY ${q('expiresAtUtc')}
           LIMIT $1
           FOR UPDATE SKIP LOCKED
         )
         DELETE FROM ${q('AttendanceConfirmationIdempotency')} target
         USING expired
         WHERE target.${q('attendanceConfirmationIdempotencyId')} =
               expired.${q('attendanceConfirmationIdempotencyId')}`,
        [this.batchSize],
      );
      const deleted = result.rowCount ?? 0;
      this.metrics.runs += 1;
      this.metrics.recordsDeleted += deleted;
      this.metrics.lastRunAt = new Date().toISOString();
      return deleted;
    } catch (error) {
      this.metrics.runs += 1;
      this.metrics.failures += 1;
      this.metrics.lastRunAt = new Date().toISOString();
      throw error;
    }
  }
}
