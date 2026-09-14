import { describe, expect, it } from 'bun:test';

import { issueToken, verifyToken } from '../src/auth/jwt.ts';
import {
  hashPassword,
  verifyPassword,
  verifyStudentLoginPassword,
} from '../src/auth/password.ts';
import { ROLES } from '../src/types.ts';

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

describe('Student login password', () => {
  it('accepts the student id, ignoring spaces and case', () => {
    expect(verifyStudentLoginPassword('02-26-0011', '02-26-0011')).toBe(true);
    expect(verifyStudentLoginPassword(' 02-26-0011 ', '02-26-0011')).toBe(true);
  });

  it('rejects a last name or an id-plus-last-name password', () => {
    expect(verifyStudentLoginPassword('Santos', '02-26-0011')).toBe(false);
    expect(verifyStudentLoginPassword('02-26-0011Santos', '02-26-0011')).toBe(false);
    expect(verifyStudentLoginPassword('02-26-0011,Santos', '02-26-0011')).toBe(false);
  });
});

describe('Student JWT', () => {
  it('accepts a student role token', () => {
    const token = issueToken({
      id: 42,
      username: '02-26-0011',
      role: ROLES.student,
    });
    expect(verifyToken(token)).toEqual({
      id: 42,
      username: '02-26-0011',
      role: ROLES.student,
    });
  });
});
