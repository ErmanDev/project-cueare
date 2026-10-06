import { Injectable } from '@nestjs/common';

import {
  checkDatabaseReadiness,
  type DatabaseReadiness,
  type PoolMetricsSnapshot,
} from '../../../db/pool.ts';
import { ApiError } from '../../../utils/errors.ts';

export type ReadinessResult = {
  status: 'ready';
  dependencies: {
    database: { status: 'ready'; latencyMs: number };
  };
  pool: PoolMetricsSnapshot;
};

export abstract class DatabaseReadinessProbe {
  abstract check(): Promise<DatabaseReadiness>;
}

@Injectable()
export class PostgresDatabaseReadinessProbe extends DatabaseReadinessProbe {
  check(): Promise<DatabaseReadiness> {
    return checkDatabaseReadiness();
  }
}

@Injectable()
export class ReadinessService {
  constructor(private readonly database: DatabaseReadinessProbe) {}

  async check(): Promise<ReadinessResult> {
    try {
      const result = await this.database.check();
      return {
        status: 'ready',
        dependencies: {
          database: { status: 'ready', latencyMs: result.latencyMs },
        },
        pool: result.pool,
      };
    } catch {
      throw new ApiError(503, 'Service is not ready.', {
        code: 'DATABASE_UNAVAILABLE',
        dependency: 'database',
      });
    }
  }
}
