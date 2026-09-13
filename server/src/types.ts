import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

export const ROLES = {
  superadmin: 'superadmin',
  moderator: 'moderator',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const DIRECTION = {
  in: 'IN',
  out: 'OUT',
  alreadyComplete: 'ALREADY_COMPLETE',
} as const;

export const SCAN_STATUS = {
  confirmed: 'confirmed',
  cancelled: 'cancelled',
} as const;

export type AuthUser = {
  id: number;
  username: string;
  role: string;
};

export type Queryable = {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
};

export type Db = Pool;

export type Tx = PoolClient;

export type UserRow = {
  id: number;
  name: string;
  username: string;
  password_hash: string;
  role: string;
  created_at: Date;
  updated_at: Date;
};

export type StudentRow = {
  id: number;
  student_id_code: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  full_name: string;
  course: string | null;
  year_level: number | null;
  section: string | null;
  photo_url: string | null;
  created_at: Date;
  updated_at: Date;
};

export type EventRow = {
  id: number;
  name: string;
  event_date: Date;
  is_active: boolean;
  created_by: number;
  created_at: Date;
  updated_at: Date;
};

export type SessionWindowRow = {
  id: number;
  event_id: number;
  session_label: string;
  start_time: string;
  end_time: string;
  late_after?: string | null;
  in_end?: string | null;
  out_start?: string | null;
  out_end?: string | null;
  requires_checkout?: boolean;
  sort_order: number;
};

export type AttendanceLogRow = {
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
};

export type AttendanceFilter = {
  eventId?: number | null;
  studentId?: number | null;
  sessionWindowId?: number | null;
  scannedBy?: number | null;
  status?: string | null;
  date?: Date | null;
  search?: string | null;
  limit?: number | null;
};
