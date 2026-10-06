import pg from 'pg';

import {
  databaseDisplay,
  getConfig,
  type DatabaseConfig,
  type DatabasePoolConfig,
  type DatabaseTlsConfig,
} from '../config.ts';
import type { Queryable } from '../types.ts';
import {
  applyLegacySchemaBootstrap,
  SchemaBootstrapError,
} from './schema-bootstrap.ts';

export { SchemaBootstrapError } from './schema-bootstrap.ts';

const { Pool, types } = pg;

// Drift used 64-bit identity columns; node-pg otherwise returns them as strings,
// which breaks Flutter's `json['id'] as int`.
types.setTypeParser(types.builtins.INT8, (value) => Number.parseInt(value, 10));
types.setTypeParser(types.builtins.INT4, (value) => Number.parseInt(value, 10));

function assertIdent(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return name;
}

type PoolMetricsState = {
  acquireCount: number;
  acquireFailureCount: number;
  acquireWaitMsTotal: number;
  idleClientErrorCount: number;
};

export type PoolMetricsSnapshot = {
  totalConnections: number;
  idleConnections: number;
  waitingRequests: number;
  acquireCount: number;
  acquireFailureCount: number;
  averageAcquireWaitMs: number;
  idleClientErrorCount: number;
};

export type DatabaseReadiness = {
  latencyMs: number;
  pool: PoolMetricsSnapshot;
};

const poolMetrics = new WeakMap<pg.Pool, PoolMetricsState>();

export function databaseSslOptions(tls: DatabaseTlsConfig) {
  return tls.mode === 'disable'
    ? false
    : {
        rejectUnauthorized: tls.mode === 'verify-full',
        ...(tls.ca ? { ca: tls.ca } : {}),
      };
}

function elapsedMs(startedAt: number): number {
  return Number((performance.now() - startedAt).toFixed(2));
}

export function createPool(
  config: DatabaseConfig = getConfig().database,
  schema = 'ssc',
  tuning: DatabasePoolConfig = getConfig().databasePool,
  tls: DatabaseTlsConfig = getConfig().databaseTls,
) {
  const schemaName = assertIdent(schema);
  const pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.name,
    user: config.user,
    password: config.password,
    ssl: databaseSslOptions(tls),
    max: tuning.max,
    connectionTimeoutMillis: tuning.connectionTimeoutMs,
    idleTimeoutMillis: tuning.idleTimeoutMs,
  });

  const metrics: PoolMetricsState = {
    acquireCount: 0,
    acquireFailureCount: 0,
    acquireWaitMsTotal: 0,
    idleClientErrorCount: 0,
  };
  poolMetrics.set(pool, metrics);

  pool.on('error', (err) => {
    metrics.idleClientErrorCount += 1;
    console.error('[pg-pool] Unexpected error on idle client:', err.message);
  });

  const configureClient = async (client: pg.PoolClient): Promise<void> => {
    await client.query(
      `SELECT
         set_config('search_path', $1, false),
         set_config('statement_timeout', $2, false),
         set_config('lock_timeout', $3, false),
         set_config('idle_in_transaction_session_timeout', $4, false)`,
      [
        schemaName,
        String(tuning.statementTimeoutMs),
        String(tuning.lockTimeoutMs),
        String(tuning.idleTransactionTimeoutMs),
      ],
    );
  };

  const originalConnect = pool.connect.bind(pool) as typeof pool.connect;
  pool.connect = ((cb?: Parameters<pg.Pool['connect']>[0]) => {
    const startedAt = performance.now();
    metrics.acquireCount += 1;
    if (cb) {
      return originalConnect((err, client, done) => {
        if (err || !client) {
          metrics.acquireFailureCount += 1;
          metrics.acquireWaitMsTotal += elapsedMs(startedAt);
          cb(err, client, done);
          return;
        }
        configureClient(client)
          .then(() => {
            metrics.acquireWaitMsTotal += elapsedMs(startedAt);
            cb(undefined, client, done);
          })
          .catch((e: unknown) => {
            const error = e instanceof Error ? e : new Error(String(e));
            metrics.acquireFailureCount += 1;
            metrics.acquireWaitMsTotal += elapsedMs(startedAt);
            done(error);
            cb(error, undefined, done);
          });
      });
    }
    return originalConnect().then(async (client) => {
      try {
        await configureClient(client);
        metrics.acquireWaitMsTotal += elapsedMs(startedAt);
        return client;
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        metrics.acquireFailureCount += 1;
        metrics.acquireWaitMsTotal += elapsedMs(startedAt);
        client.release(error);
        throw e;
      }
    }, (error: unknown) => {
      metrics.acquireFailureCount += 1;
      metrics.acquireWaitMsTotal += elapsedMs(startedAt);
      throw error;
    });
  }) as pg.Pool['connect'];

  return pool;
}

let shared: pg.Pool | undefined;

export function getPool(): pg.Pool {
  return (shared ??= createPool());
}

export function getPoolMetrics(pool: pg.Pool = getPool()): PoolMetricsSnapshot {
  const metrics = poolMetrics.get(pool) ?? {
    acquireCount: 0,
    acquireFailureCount: 0,
    acquireWaitMsTotal: 0,
    idleClientErrorCount: 0,
  };
  return {
    totalConnections: pool.totalCount,
    idleConnections: pool.idleCount,
    waitingRequests: pool.waitingCount,
    acquireCount: metrics.acquireCount,
    acquireFailureCount: metrics.acquireFailureCount,
    averageAcquireWaitMs: metrics.acquireCount
      ? Number((metrics.acquireWaitMsTotal / metrics.acquireCount).toFixed(2))
      : 0,
    idleClientErrorCount: metrics.idleClientErrorCount,
  };
}

export async function checkDatabaseReadiness(
  pool: pg.Pool = getPool(),
): Promise<DatabaseReadiness> {
  const startedAt = performance.now();
  await pool.query('SELECT 1');
  return { latencyMs: elapsedMs(startedAt), pool: getPoolMetrics(pool) };
}

export async function closePool(): Promise<void> {
  const pool = shared;
  shared = undefined;
  if (pool) await pool.end();
}

export async function ensureSchema(
  pool: pg.Pool = getPool(),
  schema = 'ssc',
): Promise<void> {
  const client = await pool.connect();
  try {
    await ensureSchemaOnClient(client, schema);
  } finally {
    client.release();
  }
}

/**
 * Compatibility bootstrap used only by migration 0001 and isolated tests.
 * Production application startup must use the versioned migration runner.
 */
export async function ensureSchemaOnClient(
  client: Queryable,
  schema = 'ssc',
): Promise<void> {
  await applyLegacySchemaBootstrap(client, schema);
}

export function poolDisplay(): string {
  return databaseDisplay(getConfig().database);
}

export async function withTransaction<T>(
  pool: pg.Pool | Queryable,
  fn: (client: Queryable) => Promise<T>,
): Promise<T> {
  if (!('connect' in pool) || typeof (pool as any).connect !== 'function') {
    return fn(pool);
  }
  const client = await (pool as pg.Pool).connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    throw e;
  } finally {
    client.release();
  }
}
