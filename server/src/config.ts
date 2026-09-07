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

export type AppConfig = {
  port: number;
  database: DatabaseConfig;
  jwtSecret: string;
  jwtTtlHours: number;
  qrHmacSecret: string | null;
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const qr = env.QR_HMAC_SECRET?.trim();
  return {
    port: Number(env.PORT || 8080) || 8080,
    database: databaseFromEnv(env),
    jwtSecret: loadOrCreateJwtSecret(env),
    jwtTtlHours: Number(env.JWT_TTL_HOURS || 12) || 12,
    qrHmacSecret: qr ? qr : null,
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
