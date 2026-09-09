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

export type AppConfig = {
  port: number;
  listenHost: string;
  trustProxy: boolean;
  database: DatabaseConfig;
  jwtSecret: string;
  jwtTtlHours: number;
  qrHmacSecret: string | null;
  runtime: RuntimeTuning;
  rateLimit: RateLimitTuning;
};

function loadOrCreateJwtSecret(env: NodeJS.ProcessEnv): string {
  if (env.JWT_SECRET && env.JWT_SECRET.trim()) return env.JWT_SECRET.trim();
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

function envFlag(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const raw = env[key]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
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
  const qr = env.QR_HMAC_SECRET?.trim();
  return {
    port: Number(env.PORT || env.HTTP_PLATFORM_PORT || 8080) || 8080,
    listenHost: env.LISTEN_HOST?.trim() || '127.0.0.1',
    trustProxy: envFlag(env, 'TRUST_PROXY', true),
    database: databaseFromEnv(env),
    jwtSecret: loadOrCreateJwtSecret(env),
    jwtTtlHours: Number(env.JWT_TTL_HOURS || 12) || 12,
    qrHmacSecret: qr ? qr : null,
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
  };
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
