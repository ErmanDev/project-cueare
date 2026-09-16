import { describe, expect, it } from 'bun:test';
import { cleanInetIp, getCleanClientIp } from '../src/utils/http.ts';

describe('cleanInetIp & getCleanClientIp', () => {
  it('strips port from IPv4 address', () => {
    expect(cleanInetIp('10.74.210.199:37334')).toBe('10.74.210.199');
  });

  it('strips IPv6 mapped prefix', () => {
    expect(cleanInetIp('::ffff:192.168.1.50')).toBe('192.168.1.50');
  });

  it('handles clean IPv4 and IPv6', () => {
    expect(cleanInetIp('127.0.0.1')).toBe('127.0.0.1');
    expect(cleanInetIp('::1')).toBe('::1');
  });

  it('returns default 127.0.0.1 for getCleanClientIp with missing headers', () => {
    const fakeReq = { headers: {} } as any;
    expect(getCleanClientIp(fakeReq)).toBe('127.0.0.1');
  });
});
