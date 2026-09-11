import * as XLSX from 'xlsx';

/** School spreadsheet headers from `server/scripts/sample_data.xls`. */
export const SAMPLE_DATA_HEADERS = [
  'StudentID',
  'FName',
  'LName',
  'MName',
  'COURSE',
  'YrLevel',
  'USN',
  'IDAdmission',
  'SYCode',
  'Acronym',
  'AStatus',
  'Datelog',
  'AdmissionYrLevel',
  'ScheduleType',
  'LearningMode',
  'Sectioning',
] as const;

export const PROGRAM_NAMES: Record<string, string> = {
  GEN: 'General',
  BSIT: 'Bachelor of Science in Information Technology',
  BSCS: 'Bachelor of Science in Computer Science',
  BSCPE: 'Bachelor of Science in Computer Engineering',
  BSIS: 'Bachelor of Science in Information Systems',
  ACT: 'Associate in Computer Technology',
  BSBA: 'Bachelor of Science in Business Administration',
  BSHM: 'Bachelor of Science in Hospitality Management',
  BSTM: 'Bachelor of Science in Tourism Management',
};

export type MappedImportStudent = {
  studentIdCode: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  programCode: string | null;
  yearLevel: number | null;
  section: string | null;
  photoUrl: string | null;
};

export type MapImportResult =
  | { ok: true; row: MappedImportStudent }
  | { ok: false; error: string };

export function normalizeHeader(header: string): string {
  return header.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

export function titleCaseName(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .trim()
    .split(/(\s+|-)/)
    .map((part) => {
      if (!part || /^\s+$/.test(part) || part === '-') return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join('');
}

export function cellText(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

export function parseYearLevel(raw: unknown): number | null {
  const text = cellText(raw);
  if (!text) return null;
  const match = text.match(/(\d+)/);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isInteger(n) || n < 1 || n > 20) return null;
  return n;
}

function field(map: Map<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = map.get(normalizeHeader(key));
    const text = cellText(value);
    if (text) return text;
  }
  return '';
}

function splitFullName(fullName: string): {
  firstName: string;
  middleName: string | null;
  lastName: string;
} {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: '', middleName: null, lastName: '' };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], middleName: null, lastName: parts[0] };
  }
  if (parts.length === 2) {
    return { firstName: parts[0], middleName: null, lastName: parts[1] };
  }
  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

export function mapImportRow(raw: Record<string, unknown>): MapImportResult {
  const map = new Map<string, unknown>();
  for (const [key, value] of Object.entries(raw)) {
    map.set(normalizeHeader(key), value);
  }

  const studentIdCode = field(map, 'StudentID', 'student_id_code', 'student_id', 'code');
  const firstName = field(map, 'FName', 'first_name');
  const lastName = field(map, 'LName', 'last_name');
  const middleName = field(map, 'MName', 'middle_name') || null;
  const fullName = field(map, 'full_name', 'name');
  const names =
    firstName && lastName
      ? { firstName, middleName, lastName }
      : fullName
        ? splitFullName(fullName)
        : { firstName, middleName, lastName };

  if (!studentIdCode || !names.firstName || !names.lastName) {
    return { ok: false, error: 'missing StudentID, FName, or LName' };
  }

  const programCode = field(map, 'COURSE', 'Acronym', 'program', 'course').toUpperCase().slice(0, 30) || null;
  const yearLevel = parseYearLevel(field(map, 'YrLevel', 'AdmissionYrLevel', 'year_level', 'year'));
  const sectionRaw = field(map, 'Sectioning', 'section');
  const section = sectionRaw ? sectionRaw.toUpperCase().slice(0, 30) : null;
  const photoUrl = field(map, 'photo_url', 'photo') || null;

  return {
    ok: true,
    row: {
      studentIdCode,
      firstName: titleCaseName(names.firstName),
      middleName: names.middleName ? titleCaseName(names.middleName) : null,
      lastName: titleCaseName(names.lastName),
      programCode,
      yearLevel,
      section,
      photoUrl,
    },
  };
}

export function rowsFromSpreadsheet(buf: Buffer): Record<string, unknown>[] {
  const workbook = XLSX.read(buf, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
}

export const SAMPLE_CSV_TEMPLATE = `StudentID,FName,LName,MName,COURSE,YrLevel,Sectioning
02-26-0999,Juan,Dela Cruz,Santos,BSIT,1st Year,A
02-26-1000,Maria,Clara,,BSBA,1st Year,B
`;
