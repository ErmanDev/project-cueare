import { describe, expect, it } from 'bun:test';

import {
  formatMinutes,
  isPastDate,
  isSameDay,
  minutesOfDay,
  normaliseTime,
  overlaps,
  parseIsoDateTime,
  parseMinutes,
} from '../src/utils/time.ts';

describe('TimeUtils', () => {
  it('parses and normalises HH:mm', () => {
    expect(parseMinutes('7:00')).toBe(7 * 60);
    expect(parseMinutes('07:00')).toBe(7 * 60);
    expect(parseMinutes('25:00')).toBeNull();
    expect(normaliseTime('7:00')).toBe('07:00');
    expect(formatMinutes(90)).toBe('01:30');
  });

  it('treats end as exclusive via overlap helper', () => {
    expect(overlaps(7 * 60, 12 * 60, 12 * 60, 13 * 60)).toBe(false);
    expect(overlaps(7 * 60, 12 * 60, 11 * 60, 13 * 60)).toBe(true);
  });

  it('compares calendar days in local time', () => {
    const a = new Date(2026, 8, 5, 8, 30);
    const b = new Date(2026, 8, 5, 23, 0);
    const c = new Date(2026, 8, 6, 0, 0);
    expect(isSameDay(a, b)).toBe(true);
    expect(isSameDay(a, c)).toBe(false);
    expect(isPastDate(new Date(2026, 8, 4), a)).toBe(true);
    expect(isPastDate(new Date(2026, 8, 5), a)).toBe(false);
  });

  it('parses date-only strings as local midnight', () => {
    const d = parseIsoDateTime('2026-09-05');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(8);
    expect(d!.getDate()).toBe(5);
    expect(minutesOfDay(new Date(2026, 8, 5, 8, 30))).toBe(8 * 60 + 30);
  });
});
