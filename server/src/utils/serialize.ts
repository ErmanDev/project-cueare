import { titleCaseName } from '../students/roster.ts';
import { isPastDate } from './time.ts';

export function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString();
}

export function userToApi(row: {
  id: number;
  name: string;
  username: string;
  role: string;
  created_at: Date;
  updated_at: Date;
}): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

export function studentToApi(row: {
  id: number;
  student_id_code: string;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  full_name: string;
  course?: string | null;
  year_level?: number | string | null;
  section: string | null;
  photo_url: string | null;
  created_at: Date;
  updated_at: Date;
}): Record<string, unknown> {
  const firstName = titleCaseName(row.first_name);
  const middleName = titleCaseName(row.middle_name) || null;
  const lastName = titleCaseName(row.last_name);
  const fullName =
    [firstName, middleName, lastName].filter(Boolean).join(' ') || titleCaseName(row.full_name);
  const yearLevel =
    row.year_level == null || row.year_level === '' ? null : Number(row.year_level);
  return {
    id: row.id,
    student_id_code: row.student_id_code,
    first_name: firstName || null,
    middle_name: middleName,
    last_name: lastName || null,
    full_name: fullName,
    course: row.course ? String(row.course).toUpperCase() : null,
    year_level: Number.isFinite(yearLevel) ? yearLevel : null,
    section: row.section,
    photo_url: row.photo_url,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

export function eventToApi(
  row: {
    id: number;
    name: string;
    event_date: Date;
    last_session_date?: Date;
    is_active: boolean;
    created_by: number;
    created_at: Date;
    updated_at: Date;
  },
  now: Date = new Date(),
): Record<string, unknown> {
  const expired = isPastDate(row.last_session_date ?? row.event_date, now);
  return {
    id: row.id,
    name: row.name,
    event_date: toIso(row.event_date),
    last_session_date: toIso(row.last_session_date ?? row.event_date),
    is_active: row.is_active && !expired,
    is_expired: expired,
    created_by: row.created_by,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

export function windowToApi(row: {
  id: number;
  event_id: number;
  session_label: string;
  session_date?: string;
  start_time: string;
  end_time: string;
  late_after?: string | null;
  in_end?: string | null;
  out_start?: string | null;
  out_end?: string | null;
  requires_checkout?: boolean;
  is_closed?: boolean;
  sort_order: number;
}): Record<string, unknown> {
  return {
    id: row.id,
    event_id: row.event_id,
    session_label: row.session_label,
    session_date: row.session_date ?? null,
    start_time: row.start_time,
    end_time: row.end_time,
    late_after: row.late_after ?? null,
    in_end: row.in_end ?? null,
    out_start: row.out_start ?? null,
    out_end: row.out_end ?? null,
    requires_checkout: row.requires_checkout ?? false,
    is_closed: row.is_closed ?? false,
    sort_order: row.sort_order,
  };
}

export function attendanceToApi(row: {
  id: number;
  event_id: number;
  student_id: number;
  session_window_id: number;
  direction: string;
  scanned_at: Date;
  scanned_by: number;
  status: string;
  device_note: string | null;
  updated_at: Date;
}): Record<string, unknown> {
  return {
    id: row.id,
    event_id: row.event_id,
    student_id: row.student_id,
    session_window_id: row.session_window_id,
    direction: row.direction,
    scanned_at: toIso(row.scanned_at),
    scanned_by: row.scanned_by,
    status: row.status,
    device_note: row.device_note,
    updated_at: toIso(row.updated_at),
  };
}

export function attendanceDetailToApi(row: AttendanceDetailRow): Record<string, unknown> {
  const firstName = titleCaseName(row.first_name);
  const middleName = titleCaseName(row.middle_name) || null;
  const lastName = titleCaseName(row.last_name);
  const fullName =
    [firstName, middleName, lastName].filter(Boolean).join(' ') || titleCaseName(row.student_name);
  const yearLevel =
    row.year_level == null || row.year_level === '' ? null : Number(row.year_level);
  return {
    ...attendanceToApi(row),
    student_id_code: row.student_id_code,
    first_name: firstName || null,
    middle_name: middleName,
    last_name: lastName || null,
    student_name: fullName || null,
    course: row.course ? String(row.course).toUpperCase() : null,
    year_level: Number.isFinite(yearLevel) ? yearLevel : null,
    student_section: row.student_section,
    session_label: row.session_label,
    scanned_by_name: row.scanned_by_name,
    event_name: row.event_name,
  };
}

export type AttendanceDetailRow = {
  id: number;
  event_id: number;
  student_id: number;
  session_window_id: number;
  direction: string;
  scanned_at: Date;
  scanned_by: number;
  status: string;
  device_note: string | null;
  updated_at: Date;
  student_id_code: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  student_name: string | null;
  course?: string | null;
  year_level?: number | string | null;
  student_section: string | null;
  session_label: string | null;
  scanned_by_name: string | null;
  event_name: string | null;
};
