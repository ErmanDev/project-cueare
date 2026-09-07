import crypto from 'node:crypto';

const DEFAULT_ITERATIONS = 30_000;
const KEY_LENGTH = 32;

export function hashPassword(password: string, iterations = DEFAULT_ITERATIONS): string {
  const salt = crypto.randomBytes(16);
  const dk = crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, 'sha256');
  return `pbkdf2$${iterations}$${salt.toString('base64')}$${dk.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(iterations)) return false;
  const salt = Buffer.from(parts[2], 'base64');
  const expected = Buffer.from(parts[3], 'base64');
  if (expected.length === 0) return false;
  const actual = crypto.pbkdf2Sync(password, salt, iterations, expected.length, 'sha256');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}
