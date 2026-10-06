import type { IncomingMessage } from 'node:http';

const HEALTH_PATHS = ['/health', '/api/health', '/api/v1/health', '/v1/health', '/api/v2/health'];
const AUTH_PREFIXES = ['/auth', '/api/auth', '/api/v1/auth', '/v1/auth'];
const NEST_ROUTES = new Map<string, Set<string>>([
  ['GET', new Set([
    ...HEALTH_PATHS,
    ...AUTH_PREFIXES.map((prefix) => `${prefix}/me`),
    '/api/v2/auth/me',
  ])],
  ['HEAD', new Set(HEALTH_PATHS)],
  ['POST', new Set([
    ...AUTH_PREFIXES.map((prefix) => `${prefix}/login`),
    ...AUTH_PREFIXES.map((prefix) => `${prefix}/change-password`),
    '/api/v2/auth/login',
    '/api/v2/auth/change-password',
  ])],
]);

function requestPath(req: IncomingMessage): string {
  return new URL(req.url ?? '/', 'http://localhost').pathname.replace(/\/+$/, '') || '/';
}

/** Returns true only for routes that have completed migration to Nest. */
export function isNestOwnedRequest(req: IncomingMessage): boolean {
  const path = requestPath(req);
  if (path === '/api/v2' || path.startsWith('/api/v2/')) return true;
  return NEST_ROUTES.get(req.method ?? '')?.has(path) ?? false;
}
