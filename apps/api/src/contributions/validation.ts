import { badRequest } from '../utils/errors.ts';

export function positiveId(value: unknown, field = 'id'): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || !/^\d+$/.test(String(value))) {
    throw badRequest(`${field} must be a positive integer`);
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw badRequest(`${field} must be a positive integer`);
  return id;
}

/** Parse decimal currency as integer cents so payment comparisons are exact. */
export function moneyCents(value: unknown, field = 'amount', allowZero = false): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || !/^\d{1,10}(\.\d{1,2})?$/.test(String(value))) {
    throw badRequest(`${field} must be a positive amount with at most two decimal places`);
  }
  const [whole, fraction = ''] = String(value).split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents < (allowZero ? 0 : 1) || cents > 999_999_999_999) {
    throw badRequest(`${field} is outside the supported range`);
  }
  return cents;
}

export function decimal(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

export function text(value: unknown, field: string, max = 100): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw badRequest(`${field} is required and must be at most ${max} characters`);
  }
  return value.trim();
}

export function dueDate(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
    throw badRequest('due_date must be a valid date (YYYY-MM-DD)');
  }
  return value;
}
