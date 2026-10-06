import { describe, expect, it } from 'bun:test';

import { loadConfig } from '../../src/config.ts';

function environment(values: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { JWT_SECRET: 'test-secret', ...values };
}

function productionEnvironment(values: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    APP_ENV: 'production',
    JWT_SECRET: 'j'.repeat(32),
    QR_HMAC_SECRET: 'q'.repeat(32),
    DATABASE_HOST: 'database.internal',
    DATABASE_USER: 'attendance_app',
    DATABASE_PASSWORD: 'non-default-password',
    DATABASE_SSL_MODE: 'verify-full',
    CORS_ALLOWED_ORIGINS: 'https://attendance.example.edu',
    TRUST_PROXY_HOPS: '1',
    ...values,
  };
}

describe('database pool configuration', () => {
  it('keeps compatibility-safe development defaults', () => {
    const configured = loadConfig(environment());
    expect(configured.environment).toBe('development');
    expect(configured.cors.allowedOrigins).toEqual(['*']);
    expect(configured.trustProxy).toBe(1);
    expect(configured.databaseTls).toEqual({ mode: 'disable' });
    expect(configured.databaseMigrations).toEqual({ autoApply: true });
    expect(configured.requestLimits).toEqual({
      jsonBytes: 8 * 1024 * 1024,
      textBytes: 8 * 1024 * 1024,
      fileBytes: 8 * 1024 * 1024,
    });
  });

  it('uses bounded production defaults', () => {
    expect(loadConfig(environment()).databasePool).toEqual({
      max: 30,
      connectionTimeoutMs: 5_000,
      idleTimeoutMs: 30_000,
      statementTimeoutMs: 30_000,
      lockTimeoutMs: 5_000,
      idleTransactionTimeoutMs: 30_000,
    });
  });

  it('supports the new settings and the legacy pool-size alias', () => {
    expect(loadConfig(environment({ PG_MAX_POOL: '17' })).databasePool.max).toBe(17);

    const configured = loadConfig(environment({
      PG_MAX_POOL: '17',
      PG_POOL_MAX: '24',
      PG_CONNECTION_TIMEOUT_MS: '2500',
      PG_IDLE_TIMEOUT_MS: '45000',
      PG_STATEMENT_TIMEOUT_MS: '12000',
      PG_LOCK_TIMEOUT_MS: '3000',
      PG_IDLE_TRANSACTION_TIMEOUT_MS: '20000',
    })).databasePool;

    expect(configured).toEqual({
      max: 24,
      connectionTimeoutMs: 2_500,
      idleTimeoutMs: 45_000,
      statementTimeoutMs: 12_000,
      lockTimeoutMs: 3_000,
      idleTransactionTimeoutMs: 20_000,
    });
  });

  it('exposes optional deployment metadata without inventing values', () => {
    expect(loadConfig(environment()).release).toEqual({ version: null, revision: null });
    expect(loadConfig(environment({
      RELEASE_VERSION: ' 1.4.0 ',
      RELEASE_REVISION: ' abc123 ',
    })).release).toEqual({ version: '1.4.0', revision: 'abc123' });
  });

  it('falls back for invalid negative and fractional values', () => {
    const configured = loadConfig(environment({
      PG_POOL_MAX: '-1',
      PG_CONNECTION_TIMEOUT_MS: '1.5',
      PG_STATEMENT_TIMEOUT_MS: '-20',
    })).databasePool;

    expect(configured.max).toBe(30);
    expect(configured.connectionTimeoutMs).toBe(5_000);
    expect(configured.statementTimeoutMs).toBe(30_000);
  });

  it('configures bounded idempotency cleanup and supports explicit disablement', () => {
    expect(loadConfig(environment()).maintenance).toEqual({
      idempotencyCleanupIntervalMs: 3_600_000,
      idempotencyCleanupBatchSize: 1_000,
    });
    expect(loadConfig(environment({
      IDEMPOTENCY_CLEANUP_INTERVAL_MS: '0',
      IDEMPOTENCY_CLEANUP_BATCH_SIZE: '250',
    })).maintenance).toEqual({
      idempotencyCleanupIntervalMs: 0,
      idempotencyCleanupBatchSize: 250,
    });
  });

  it('accepts an explicit hardened production configuration', () => {
    const configured = loadConfig(productionEnvironment({
      DATABASE_SSL_CA: 'line-one\\nline-two',
      CORS_ALLOWED_ORIGINS:
        'https://attendance.example.edu/,https://admin.example.edu',
      HTTP_JSON_LIMIT_BYTES: '1048576',
    }));

    expect(configured.environment).toBe('production');
    expect(configured.databaseMigrations).toEqual({ autoApply: false });
    expect(configured.cors.allowedOrigins).toEqual([
      'https://attendance.example.edu',
      'https://admin.example.edu',
    ]);
    expect(configured.databaseTls).toEqual({
      mode: 'verify-full',
      ca: 'line-one\nline-two',
    });
    expect(configured.requestLimits.jsonBytes).toBe(1_048_576);
  });

  it('rejects unsafe production defaults in one actionable startup error', () => {
    expect(() => loadConfig({ APP_ENV: 'production' })).toThrow(
      /JWT_SECRET is required.*QR_HMAC_SECRET is required.*DATABASE_PASSWORD.*DATABASE_USER.*CORS_ALLOWED_ORIGINS.*TRUST_PROXY_HOPS.*DATABASE_SSL_MODE/s,
    );
  });

  it('requires TLS for a remote production database', () => {
    expect(() => loadConfig(productionEnvironment({ DATABASE_SSL_MODE: 'disable' }))).toThrow(
      'DATABASE_SSL_MODE=disable is allowed only for a loopback database host.',
    );
  });

  it('allows explicitly disabled TLS only for a loopback production database', () => {
    const configured = loadConfig(productionEnvironment({
      DATABASE_HOST: '127.0.0.1',
      DATABASE_SSL_MODE: 'disable',
    }));
    expect(configured.databaseTls.mode).toBe('disable');
  });

  it('rejects wildcard production CORS and invalid proxy hop counts', () => {
    expect(() => loadConfig(productionEnvironment({ CORS_ALLOWED_ORIGINS: '*' }))).toThrow(
      'CORS_ALLOWED_ORIGINS must contain an explicit allowlist without wildcards.',
    );
    expect(() => loadConfig(environment({ TRUST_PROXY_HOPS: 'all' }))).toThrow(
      'TRUST_PROXY_HOPS must be an integer between 0 and 10.',
    );
  });

  it('rejects automatic production migrations', () => {
    expect(() => loadConfig(productionEnvironment({ AUTO_MIGRATE: 'true' }))).toThrow(
      'AUTO_MIGRATE must be false in production; run migrations as a deployment step.',
    );
  });
});
