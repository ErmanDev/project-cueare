import { badRequest } from './errors.ts';

export const MAX_CODE_LENGTH = 64;
export const MAX_PAYLOAD_LENGTH = 512;

const PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function isValidStudentCode(code: string): boolean {
  return PATTERN.test(code);
}

export function requireValidStudentCode(
  code: string,
  field = 'student_id_code',
): string {
  const trimmed = code.trim();
  if (!trimmed) throw badRequest(`Field "${field}" is required`);
  if (trimmed.length > MAX_CODE_LENGTH || !isValidStudentCode(trimmed)) {
    throw badRequest(
      `Invalid ${field} — use letters, digits, hyphen or underscore ` +
        `(max ${MAX_CODE_LENGTH} characters)`,
      { code: 'INVALID_STUDENT_CODE' },
    );
  }
  return trimmed;
}

export function requirePayloadSize(raw: string): void {
  if (!raw.trim()) throw badRequest('Empty QR payload');
  if (raw.length > MAX_PAYLOAD_LENGTH) {
    throw badRequest('QR payload too large', { code: 'QR_PAYLOAD_TOO_LARGE' });
  }
}

export function escapeLike(input: string): string {
  return input.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}
