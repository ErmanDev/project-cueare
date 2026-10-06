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

export type CandidatePayloadParse = {
  codes: string[];
  names: string[];
};

export function normalizeCode(input: string): string {
  return input.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
}

/** Sanitizes raw input by converting unicode hyphens/dashes, non-breaking spaces, and hidden whitespace to ASCII. */
export function sanitizeRawPayload(raw: string): string {
  return raw
    .replaceAll(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
    .replaceAll(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ')
    .trim();
}

export function extractCandidatePayloads(raw: string): CandidatePayloadParse {
  const sanitized = sanitizeRawPayload(raw);
  if (!sanitized) return { codes: [], names: [] };

  const codes: string[] = [];
  const names: string[] = [];

  // 1. Match formatted codes with hyphens, slashes, or dots (e.g. 02-23-0125, 02.23.0125, 02/23/0125, STU-2026-0011)
  const matches = sanitized.matchAll(/\b([A-Za-z0-9]+(?:[-_/.]\s*[A-Za-z0-9]+)+)\b/g);
  for (const match of matches) {
    const candidate = match[1].replaceAll(/\s+/g, '').replaceAll(/[/.]/g, '-');
    if (isValidStudentCode(candidate) && !codes.includes(candidate)) {
      codes.push(candidate);
    }
  }

  // 2. Tokenize by common delimiters (comma, semicolon, tab, pipe, newline)
  const tokens = sanitized
    .split(/[,;|\t\n\r]+/)
    .map((t) => t.trim().replaceAll(/\s+/g, ' '))
    .filter(Boolean);

  for (const token of tokens) {
    const cleanToken = token.replaceAll(/[/.]/g, '-');
    if (isValidStudentCode(cleanToken) && cleanToken.length <= MAX_CODE_LENGTH) {
      if (!codes.includes(cleanToken)) codes.push(cleanToken);
    } else if (/[A-Za-z]/.test(token) && token.length >= 2 && token.length <= 100) {
      if (!names.includes(token)) names.push(token);
    }
  }

  return { codes, names };
}

/**
 * Extracts a candidate student ID code from raw composite text (e.g. "02-26-0011, Shairahh" or "STU-2026-0011 - John Doe").
 * Useful for backward compatibility (v1) with legacy badges or CSV-like QR formats.
 */
export function extractStudentCodeFromRaw(raw: string): string | null {
  const parsed = extractCandidatePayloads(raw);
  if (parsed.codes.length > 0) return parsed.codes[0];
  return null;
}


