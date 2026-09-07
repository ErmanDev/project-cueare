import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from '../src/auth/password.ts';

describe('PasswordHasher', () => {
  it('verifies correct password and rejects wrong one', () => {
    const h = hashPassword('changeme123', 1000);
    expect(verifyPassword('changeme123', h)).toBe(true);
    expect(verifyPassword('wrong', h)).toBe(false);
    expect(verifyPassword('changeme123', 'garbage')).toBe(false);
  });

  it('reads iterations and hash length from the stored string', () => {
    const h = hashPassword('secret', 500);
    expect(h.startsWith('pbkdf2$500$')).toBe(true);
    expect(verifyPassword('secret', h)).toBe(true);
  });
});
