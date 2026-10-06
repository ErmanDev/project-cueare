import { describe, expect, it } from 'bun:test';
import { decimal, dueDate, moneyCents, positiveId } from '../src/contributions/validation.ts';

describe('contribution input validation', () => {
  it('keeps currency exact to cents and accepts the supported maximum', () => {
    expect(moneyCents('100.01')).toBe(10001);
    expect(moneyCents(0.1)).toBe(10);
    expect(decimal(moneyCents('9999999999.99'))).toBe('9999999999.99');
    expect(moneyCents('0.00', 'waiver', true)).toBe(0);
  });
  it('rejects invalid, negative, excessive precision, and zero payments', () => {
    for (const value of [null, true, '', ' 1 ', '1e3', -1, 0, '0.00', '1.001', Infinity, '10000000000.00']) {
      expect(() => moneyCents(value)).toThrow();
    }
  });
  it('rejects unsafe identifiers and invalid calendar dates', () => {
    for (const value of [0, -1, '1x', 1.2, true, '9007199254740992']) expect(() => positiveId(value)).toThrow();
    expect(positiveId('12')).toBe(12);
    expect(dueDate('2028-02-29')).toBe('2028-02-29');
    expect(dueDate('')).toBeNull();
    for (const value of ['2026-02-29', '2026-04-31', '2026-13-01', 'yesterday']) expect(() => dueDate(value)).toThrow();
  });
});
