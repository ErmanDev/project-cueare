import { badRequest } from '../../../../utils/errors.ts';

function atLocalMidnight(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function requireValidEventRange(start: Date, end: Date): void {
  if (end.getTime() < start.getTime()) {
    throw badRequest('event_end_date must be on or after event_start_date');
  }
}

export function requireEventDateNotPast(value: Date, now = new Date()): void {
  if (atLocalMidnight(value).getTime() < atLocalMidnight(now).getTime()) {
    throw badRequest('Event date cannot be in the past');
  }
}
