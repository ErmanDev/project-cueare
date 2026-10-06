import { badRequest } from '../../../../utils/errors.ts';

export function bodyObject(body: unknown): Record<string, unknown> {
  if (body == null || body === '') return {};
  if (typeof body === 'object' && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  throw badRequest('Request body must be a JSON object');
}

export function requiredString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw badRequest(`Field "${key}" is required`);
  }
  return value.trim();
}
