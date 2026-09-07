import { describe, expect, it } from 'vitest';

import { ApiError } from '../src/utils/errors.ts';
import {
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
  });
});
