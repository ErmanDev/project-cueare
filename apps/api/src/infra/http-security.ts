import helmet from 'helmet';

import type { CorsConfig } from '../config.ts';

export const CORS_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
export const CORS_ALLOWED_HEADERS = [
  'Origin',
  'Content-Type',
  'Authorization',
  'Idempotency-Key',
  'X-Request-Id',
];

export function corsOriginSetting(config: CorsConfig): '*' | string[] {
  return config.allowedOrigins.includes('*') ? '*' : config.allowedOrigins;
}

export function isCorsOriginAllowed(config: CorsConfig, origin: string): boolean {
  return config.allowedOrigins.includes('*') || config.allowedOrigins.includes(origin);
}

export function createSecurityHeadersMiddleware() {
  return helmet({
    // Swagger UI and the bundled legacy web client currently use inline assets.
    // Keep CSP deployment-specific until those assets are nonce/hash based.
    contentSecurityPolicy: false,
  });
}
