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
  full_name: string;
  section: string | null;
  photo_url: string | null;
  created_at: Date;
  updated_at: Date;
}): Record<string, unknown> {
  return {
    id: row.id,
    student_id_code: row.student_id_code,
    full_name: row.full_name,
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
    is_active: boolean;
    created_by: number;
    created_at: Date;
    updated_at: Date;
  },
  now: Date = new Date(),
): Record<string, unknown> {
  const expired = isPastDate(row.event_date, now);
  return {
    id: row.id,
    name: row.name,
    event_date: toIso(row.event_date),
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
  start_time: string;
  end_time: string;
  sort_order: number;
}): Record<string, unknown> {
  return {
    id: row.id,
    event_id: row.event_id,
    session_label: row.session_label,
    start_time: row.start_time,
    end_time: row.end_time,
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
  return {
    ...attendanceToApi(row),
    student_id_code: row.student_id_code,
    student_name: row.student_name,
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
  student_name: string | null;
  student_section: string | null;
  session_label: string | null;
  scanned_by_name: string | null;
  event_name: string | null;
};
