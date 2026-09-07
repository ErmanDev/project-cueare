import { badRequest } from './errors.ts';

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function parseMinutes(value: string | null | undefined): number | null {
  if (value == null) return null;
  const m = HHMM.exec(value.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function isValidTime(value: string | null | undefined): boolean {
  return parseMinutes(value) != null;
}

export function formatMinutes(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

export function normaliseTime(value: string): string {
  const minutes = parseMinutes(value);
  if (minutes == null) throw badRequest('start_time and end_time must be "HH:mm"');
  return formatMinutes(minutes);
}

export function minutesOfDay(t: Date): number {
  return t.getHours() * 60 + t.getMinutes();
}

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function startOfDay(t: Date): Date {
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isPastDate(date: Date, relativeTo: Date = new Date()): boolean {
  return startOfDay(date).getTime() < startOfDay(relativeTo).getTime();
}

export function isTodayOrFuture(date: Date, relativeTo: Date = new Date()): boolean {
  return !isPastDate(date, relativeTo);
}

/** Parse ISO date/datetime. Date-only strings (`YYYY-MM-DD`) are local midnight. */
export function parseIsoDateTime(raw: string): Date | null {
  const trimmed = raw.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}
