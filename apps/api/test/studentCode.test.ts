import { describe, expect, it } from 'bun:test';

import { ApiError } from '../src/utils/errors.ts';
import {
  extractStudentCodeFromRaw,
  isValidStudentCode,
  requirePayloadSize,
  requireValidStudentCode,
} from '../src/utils/studentCode.ts';

describe('StudentCode', () => {
  it('accepts letters, digits, hyphen, underscore', () => {
    expect(isValidStudentCode('STU-2026-0001')).toBe(true);
    expect(isValidStudentCode("'; DROP TABLE students;--")).toBe(false);
  });

  it('rejects oversized payloads', () => {
    expect(() => requirePayloadSize('A'.repeat(600))).toThrow(ApiError);
    try {
      requirePayloadSize('A'.repeat(600));
    } catch (e) {
      expect((e as ApiError).details?.code).toBe('QR_PAYLOAD_TOO_LARGE');
    }
  });

  it('requireValid throws INVALID_STUDENT_CODE', () => {
    expect(() => requireValidStudentCode('bad code')).toThrow(ApiError);
    expect(() => requireValidStudentCode('STU-1; SELECT * FROM users')).toThrow(ApiError);
  });

  it('extracts student ID from v1 legacy composite QR payloads', () => {
    expect(extractStudentCodeFromRaw('02-26-0011, Shairahh')).toBe('02-26-0011');
    expect(extractStudentCodeFromRaw('02-23-0125, Je-ann   Callo')).toBe('02-23-0125');
    expect(extractStudentCodeFromRaw('Shairahh, 02-26-0011')).toBe('02-26-0011');
    expect(extractStudentCodeFromRaw('STU-2026-0011 - Shairahh')).toBe('STU-2026-0011');
    expect(extractStudentCodeFromRaw('ID: 02-26-0011 | Name: Shairahh')).toBe('02-26-0011');
    expect(extractStudentCodeFromRaw('02-26-0011')).toBe('02-26-0011');
  });
});

