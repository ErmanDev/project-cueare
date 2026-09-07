import type { Request } from 'express';

import { badRequest } from './errors.ts';
import { parseIsoDateTime } from './time.ts';

export function jsonObject(req: Request): Record<string, unknown> {
  const body = req.body;
  if (body == null || body === '') return {};
  if (typeof body === 'string') {
    const trimmed = body.trim();
    if (!trimmed) return {};
    try {
      const decoded: unknown = JSON.parse(trimmed);
      if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
        return decoded as Record<string, unknown>;
      }
      throw badRequest('Request body must be a JSON object');
    } catch (e) {
      if (e instanceof SyntaxError) throw badRequest('Request body is not valid JSON');
      throw e;
    }
  }
  if (typeof body === 'object' && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  throw badRequest('Request body must be a JSON object');
}

export function requireString(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  if (typeof v !== 'string' || !v.trim()) {
    throw badRequest(`Field "${key}" is required`);
  }
  return v.trim();
}

export function optionalString(body: Record<string, unknown>, key: string): string | null {
  const v = body[key];
  if (v == null) return null;
  if (typeof v !== 'string') throw badRequest(`Field "${key}" must be a string`);
  const t = v.trim();
  return t ? t : null;
}

export function requireInt(body: Record<string, unknown>, key: string): number {
  const v = optionalInt(body, key);
  if (v == null) throw badRequest(`Field "${key}" is required`);
  return v;
}

export function optionalInt(body: Record<string, unknown>, key: string): number | null {
  const v = body[key];
  if (v == null) return null;
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string') {
    const parsed = Number.parseInt(v, 10);
    if (!Number.isNaN(parsed) && String(parsed) === v.trim()) return parsed;
  }
  throw badRequest(`Field "${key}" must be an integer`);
}

export function optionalBool(body: Record<string, unknown>, key: string): boolean | null {
  const v = body[key];
  if (v == null) return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    if (v === 'true' || v === '1') return true;
    if (v === 'false' || v === '0') return false;
  }
  if (typeof v === 'number') return v !== 0;
  throw badRequest(`Field "${key}" must be a boolean`);
}

export function parsePathId(raw: string): number {
  const id = Number.parseInt(raw, 10);
  if (Number.isNaN(id) || String(id) !== raw) {
    throw badRequest(`Invalid id "${raw}"`);
  }
  return id;
}

export function queryString(req: Request, key: string): string | null {
  const raw = req.query[key];
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== 'string' || !v.trim()) return null;
  return v.trim();
}

export function queryInt(req: Request, key: string): number | null {
  const v = queryString(req, key);
  if (v == null) return null;
  const parsed = Number.parseInt(v, 10);
  if (Number.isNaN(parsed)) throw badRequest(`Query "${key}" must be an integer`);
  return parsed;
}

export function queryDate(req: Request, key: string): Date | null {
  const v = queryString(req, key);
  if (v == null) return null;
  const parsed = parseIsoDateTime(v);
  if (!parsed) throw badRequest(`Query "${key}" must be an ISO date`);
  return parsed;
}

export function parseDate(body: Record<string, unknown>, key: string): Date {
  const raw = requireString(body, key);
  const parsed = parseIsoDateTime(raw);
  if (!parsed) throw badRequest(`Field "${key}" must be an ISO-8601 date`);
  return parsed;
}

export function hasKey(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key);
}
