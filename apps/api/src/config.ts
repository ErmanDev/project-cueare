import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(serverRoot, '.env') });

export type DatabaseConfig = {
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
};

export type DatabasePoolConfig = {
  max: number;
  connectionTimeoutMs: number;
  idleTimeoutMs: number;
  statementTimeoutMs: number;
  lockTimeoutMs: number;
  idleTransactionTimeoutMs: number;
};

export type ApplicationEnvironment =
  | 'development'
  | 'test'
  | 'staging'
  | 'production';

export type DatabaseTlsConfig = {
  mode: 'disable' | 'require' | 'verify-full';
  ca?: string;
};

export type CorsConfig = {
  allowedOrigins: string[];
};

export type RequestLimitConfig = {
  jsonBytes: number;
  textBytes: number;
  fileBytes: number;
};

export type DatabaseMigrationConfig = {
  autoApply: boolean;
};

export type ReleaseMetadata = {
  version: string | null;
  revision: string | null;
};

export type RuntimeTuning = {
  cacheTtlMs: number;
  eventTtlMs: number;
  cacheMaxEntries: number;
  batchWindowMs: number;
  batchMax: number;
  scanConcurrency: number;
};

export type RateLimitTuning = {
  enabled: boolean;
  loginMax: number;
  loginWindowMs: number;
  scanPreviewMax: number;
  scanWriteMax: number;
  scanWindowMs: number;
};

export type MaintenanceTuning = {
  idempotencyCleanupIntervalMs: number;
  idempotencyCleanupBatchSize: number;
};

export type AppConfig = {
  environment: ApplicationEnvironment;
  port: number;
  listenHost: string;
  trustProxy: number | false;
  release: ReleaseMetadata;
  database: DatabaseConfig;
  databaseTls: DatabaseTlsConfig;
  databaseMigrations: DatabaseMigrationConfig;
  databasePool: DatabasePoolConfig;
  jwtSecret: string;
  jwtTtlHours: number;
  qrHmacSecret: string | null;
  cors: CorsConfig;
  requestLimits: RequestLimitConfig;
  runtime: RuntimeTuning;
  rateLimit: RateLimitTuning;
  maintenance: MaintenanceTuning;
};

function loadOrCreateJwtSecret(
  env: NodeJS.ProcessEnv,
  environment: ApplicationEnvironment,
): string {
  if (env.JWT_SECRET && env.JWT_SECRET.trim()) return env.JWT_SECRET.trim();
  if (environment === 'production') return '';
  const file = path.join(process.cwd(), 'jwt_secret.txt');
  if (fs.existsSync(file)) {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing) return existing;
  }
  const secret = crypto.randomBytes(48).toString('base64url');
  fs.writeFileSync(file, secret);
  console.error(`[config] Generated new JWT secret at ${file}`);
  return secret;
}

function parseDatabaseUrl(url: string): DatabaseConfig {
  const uri = new URL(url);
  if (uri.protocol !== 'postgres:' && uri.protocol !== 'postgresql:') {
    throw new Error(
      `DATABASE_URL must start with postgres:// or postgresql://, got: ${url}`,
    );
  }
  const name = decodeURIComponent(uri.pathname.replace(/^\//, '')) || 'aclc';
  return {
    host: uri.hostname || 'localhost',
    port: uri.port ? Number(uri.port) : 5432,
    name,
    user: decodeURIComponent(uri.username || 'postgres'),
    password: decodeURIComponent(uri.password || ''),
  };
}

function databaseFromEnv(env: NodeJS.ProcessEnv): DatabaseConfig {
  const url = env.DATABASE_URL?.trim();
  if (url) return parseDatabaseUrl(url);
  return {
    host: env.DATABASE_HOST?.trim() || 'localhost',
    port: Number(env.DATABASE_PORT || 5432) || 5432,
    name: env.DATABASE_NAME?.trim() || 'aclc',
    user: env.DATABASE_USER?.trim() || 'postgres',
    password: env.DATABASE_PASSWORD ?? 'postgres',
  };
}

function envInt(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw == null || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function positiveEnvInt(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const value = envInt(env, key, fallback);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function nonNegativeEnvInt(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const value = envInt(env, key, fallback);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function envFlag(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const raw = env[key]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
}

function applicationEnvironment(env: NodeJS.ProcessEnv): ApplicationEnvironment {
  const value = (env.APP_ENV ?? env.NODE_ENV ?? 'development').trim().toLowerCase();
  if (['development', 'test', 'staging', 'production'].includes(value)) {
    return value as ApplicationEnvironment;
  }
  throw new Error(
    'APP_ENV must be one of development, test, staging, or production.',
  );
}

function corsOrigins(
  env: NodeJS.ProcessEnv,
  environment: ApplicationEnvironment,
): string[] {
  const raw = env.CORS_ALLOWED_ORIGINS?.trim();
  if (!raw) return environment === 'production' ? [] : ['*'];
  const origins = [...new Set(raw.split(',').map((value) => value.trim()).filter(Boolean))];
  return origins.map((origin) => {
    if (origin === '*') return origin;
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`CORS_ALLOWED_ORIGINS contains an invalid origin: ${origin}`);
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin === 'null') {
      throw new Error(`CORS_ALLOWED_ORIGINS must use http or https: ${origin}`);
    }
    return parsed.origin;
  });
}

function trustProxySetting(env: NodeJS.ProcessEnv): number | false {
  const rawHops = env.TRUST_PROXY_HOPS?.trim();
  if (rawHops) {
    const hops = Number(rawHops);
    if (!Number.isInteger(hops) || hops < 0 || hops > 10) {
      throw new Error('TRUST_PROXY_HOPS must be an integer between 0 and 10.');
    }
    return hops === 0 ? false : hops;
  }
  // Preserve the existing boolean setting during migration. `true` always
  // means one trusted reverse-proxy hop, never Express's trust-all mode.
  return envFlag(env, 'TRUST_PROXY', true) ? 1 : false;
}

function databaseTls(env: NodeJS.ProcessEnv): DatabaseTlsConfig {
  const mode = (env.DATABASE_SSL_MODE?.trim().toLowerCase() || 'disable') as
    DatabaseTlsConfig['mode'];
  if (!['disable', 'require', 'verify-full'].includes(mode)) {
    throw new Error('DATABASE_SSL_MODE must be disable, require, or verify-full.');
  }
  const rawCa = env.DATABASE_SSL_CA?.trim();
  return {
    mode,
    ...(rawCa ? { ca: rawCa.replace(/\\n/g, '\n') } : {}),
  };
}

function isLoopbackHost(host: string): boolean {
  return ['localhost', '127.0.0.1', '::1'].includes(host.toLowerCase());
}

function validateProductionConfig(config: AppConfig, env: NodeJS.ProcessEnv): void {
  if (config.environment !== 'production') return;
  const errors: string[] = [];
  if (config.jwtSecret.length < 32) {
    errors.push('JWT_SECRET is required and must contain at least 32 characters.');
  }
  if (!config.qrHmacSecret || config.qrHmacSecret.length < 32) {
    errors.push('QR_HMAC_SECRET is required and must contain at least 32 characters.');
  }
  if (!config.database.password || config.database.password.toLowerCase() === 'postgres') {
    errors.push('DATABASE_PASSWORD must not be empty or use the default postgres password.');
  }
  if (config.database.user.toLowerCase() === 'postgres') {
    errors.push('DATABASE_USER must be a least-privilege application account, not postgres.');
  }
  if (!config.cors.allowedOrigins.length || config.cors.allowedOrigins.includes('*')) {
    errors.push('CORS_ALLOWED_ORIGINS must contain an explicit allowlist without wildcards.');
  }
  if (env.TRUST_PROXY_HOPS == null && env.TRUST_PROXY == null) {
    errors.push('TRUST_PROXY_HOPS must explicitly describe the production proxy topology.');
  }
  if (env.DATABASE_SSL_MODE == null) {
    errors.push('DATABASE_SSL_MODE must be explicitly configured in production.');
  }
  if (config.databaseTls.mode === 'disable' && !isLoopbackHost(config.database.host)) {
    errors.push('DATABASE_SSL_MODE=disable is allowed only for a loopback database host.');
  }
  if (config.databaseMigrations.autoApply) {
    errors.push('AUTO_MIGRATE must be false in production; run migrations as a deployment step.');
  }
  if (errors.length) {
    throw new Error(`Invalid production configuration:\n- ${errors.join('\n- ')}`);
  }
}

export function defaultRuntimeTuning(): RuntimeTuning {
  return {
    cacheTtlMs: 30_000,
    eventTtlMs: 15_000,
    cacheMaxEntries: 5_000,
    batchWindowMs: 8,
    batchMax: 50,
    scanConcurrency: 8,
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const environment = applicationEnvironment(env);
  const qr = env.QR_HMAC_SECRET?.trim();
  const legacyPoolMax = positiveEnvInt(env, 'PG_MAX_POOL', 30);
  const config: AppConfig = {
    environment,
    port: Number(env.PORT || env.HTTP_PLATFORM_PORT || 8080) || 8080,
    listenHost: env.LISTEN_HOST?.trim() || '127.0.0.1',
    trustProxy: trustProxySetting(env),
    release: {
      version: env.RELEASE_VERSION?.trim() || null,
      revision: env.RELEASE_REVISION?.trim() || null,
    },
    database: databaseFromEnv(env),
    databaseTls: databaseTls(env),
    databaseMigrations: {
      autoApply: envFlag(env, 'AUTO_MIGRATE', environment !== 'production'),
    },
    databasePool: {
      max: positiveEnvInt(env, 'PG_POOL_MAX', legacyPoolMax),
      connectionTimeoutMs: positiveEnvInt(env, 'PG_CONNECTION_TIMEOUT_MS', 5_000),
      idleTimeoutMs: positiveEnvInt(env, 'PG_IDLE_TIMEOUT_MS', 30_000),
      statementTimeoutMs: nonNegativeEnvInt(env, 'PG_STATEMENT_TIMEOUT_MS', 30_000),
      lockTimeoutMs: nonNegativeEnvInt(env, 'PG_LOCK_TIMEOUT_MS', 5_000),
      idleTransactionTimeoutMs: nonNegativeEnvInt(
        env,
        'PG_IDLE_TRANSACTION_TIMEOUT_MS',
        30_000,
      ),
    },
    jwtSecret: loadOrCreateJwtSecret(env, environment),
    jwtTtlHours: Number(env.JWT_TTL_HOURS || 12) || 12,
    qrHmacSecret: qr ? qr : null,
    cors: { allowedOrigins: corsOrigins(env, environment) },
    requestLimits: {
      jsonBytes: positiveEnvInt(env, 'HTTP_JSON_LIMIT_BYTES', 8 * 1024 * 1024),
      textBytes: positiveEnvInt(env, 'HTTP_TEXT_LIMIT_BYTES', 8 * 1024 * 1024),
      fileBytes: positiveEnvInt(env, 'HTTP_FILE_LIMIT_BYTES', 8 * 1024 * 1024),
    },
    runtime: {
      cacheTtlMs: envInt(env, 'SCAN_CACHE_TTL_MS', 30_000),
      eventTtlMs: envInt(env, 'EVENT_CACHE_TTL_MS', 15_000),
      cacheMaxEntries: envInt(env, 'SCAN_CACHE_MAX', 5_000),
      batchWindowMs: envInt(env, 'SCAN_BATCH_WINDOW_MS', 8),
      batchMax: envInt(env, 'SCAN_BATCH_MAX', 50),
      scanConcurrency: envInt(env, 'SCAN_WRITE_CONCURRENCY', 8),
    },
    rateLimit: {
      enabled: envFlag(env, 'RATE_LIMIT_ENABLED', true),
      loginMax: envInt(env, 'RATE_LIMIT_LOGIN_MAX', 10),
      loginWindowMs: envInt(env, 'RATE_LIMIT_LOGIN_WINDOW_MS', 300_000),
      scanPreviewMax: envInt(env, 'RATE_LIMIT_SCAN_PREVIEW_MAX', 40),
      scanWriteMax: envInt(env, 'RATE_LIMIT_SCAN_WRITE_MAX', 20),
      scanWindowMs: envInt(env, 'RATE_LIMIT_SCAN_WINDOW_MS', 10_000),
    },
    maintenance: {
      idempotencyCleanupIntervalMs: nonNegativeEnvInt(
        env,
        'IDEMPOTENCY_CLEANUP_INTERVAL_MS',
        3_600_000,
      ),
      idempotencyCleanupBatchSize: positiveEnvInt(
        env,
        'IDEMPOTENCY_CLEANUP_BATCH_SIZE',
        1_000,
      ),
    },
  };
  validateProductionConfig(config, env);
  return config;
}

export function databaseDisplay(db: DatabaseConfig): string {
  return `${db.user}@${db.host}:${db.port}/${db.name}`;
}

let cached: AppConfig | undefined;

export function getConfig(): AppConfig {
  return (cached ??= loadConfig());
}

export function overrideConfig(config: AppConfig): void {
  cached = config;
}
