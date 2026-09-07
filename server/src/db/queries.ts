import type { AttendanceDetailRow } from '../utils/serialize.ts';
import { startOfDay } from '../utils/time.ts';
import { escapeLike } from '../utils/studentCode.ts';
import type {
  AttendanceFilter,
  AttendanceLogRow,
  EventRow,
  Queryable,
  SessionWindowRow,
  StudentRow,
  UserRow,
} from '../types.ts';

export async function one<T>(
  db: Queryable,
  text: string,
  values: unknown[] = [],
): Promise<T | null> {
  const res = await db.query(text, values);
  return (res.rows[0] as T | undefined) ?? null;
}

export async function many<T>(
  db: Queryable,
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const res = await db.query(text, values);
  return res.rows as T[];
}

export async function getUserById(db: Queryable, id: number): Promise<UserRow | null> {
  return one<UserRow>(db, 'SELECT * FROM users WHERE id = $1', [id]);
}

export async function getUserByUsername(db: Queryable, username: string): Promise<UserRow | null> {
  return one<UserRow>(
    db,
    'SELECT * FROM users WHERE LOWER(username) = LOWER($1)',
    [username],
  );
}

export async function getUserByUsernameExact(
  db: Queryable,
  username: string,
): Promise<UserRow | null> {
  return one<UserRow>(db, 'SELECT * FROM users WHERE username = $1', [username]);
}

export async function insertUser(
  db: Queryable,
  row: { name: string; username: string; passwordHash: string; role: string },
): Promise<UserRow> {
  const created = await one<UserRow>(
    db,
    `INSERT INTO users (name, username, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [row.name, row.username, row.passwordHash, row.role],
  );
  return created!;
}

export async function updateUser(
  db: Queryable,
  id: number,
  fields: {
    name?: string;
    username?: string;
    passwordHash?: string;
    role?: string;
  },
): Promise<UserRow> {
  const sets: string[] = ['updated_at = NOW()'];
  const values: unknown[] = [];
  let i = 1;
  if (fields.name != null) {
    sets.push(`name = $${i++}`);
    values.push(fields.name);
  }
  if (fields.username != null) {
    sets.push(`username = $${i++}`);
    values.push(fields.username);
  }
  if (fields.passwordHash != null) {
    sets.push(`password_hash = $${i++}`);
    values.push(fields.passwordHash);
  }
  if (fields.role != null) {
    sets.push(`role = $${i++}`);
    values.push(fields.role);
  }
  values.push(id);
  const row = await one<UserRow>(
    db,
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    values,
  );
  return row!;
}

export async function listModerators(db: Queryable): Promise<UserRow[]> {
  return many<UserRow>(
    db,
    `SELECT * FROM users WHERE role = 'moderator' ORDER BY name ASC`,
  );
}

export async function getModeratorById(db: Queryable, id: number): Promise<UserRow | null> {
  return one<UserRow>(
    db,
    `SELECT * FROM users WHERE id = $1 AND role = 'moderator'`,
    [id],
  );
}

export async function deleteUser(db: Queryable, id: number): Promise<void> {
  await db.query('DELETE FROM users WHERE id = $1', [id]);
}

export async function countScansByModerator(db: Queryable, userId: number): Promise<number> {
  const row = await one<{ n: string }>(
    db,
    'SELECT COUNT(*)::text AS n FROM attendance_logs WHERE scanned_by = $1',
    [userId],
  );
  return Number(row?.n ?? 0);
}

export async function listStudents(db: Queryable, q?: string | null): Promise<StudentRow[]> {
  if (!q) {
    return many<StudentRow>(db, 'SELECT * FROM students ORDER BY full_name ASC');
  }
  const like = `%${escapeLike(q.toLowerCase())}%`;
  return many<StudentRow>(
    db,
    `SELECT * FROM students
     WHERE LOWER(full_name) LIKE $1 ESCAPE '\\'
        OR LOWER(student_id_code) LIKE $1 ESCAPE '\\'
        OR LOWER(COALESCE(section, '')) LIKE $1 ESCAPE '\\'
     ORDER BY full_name ASC`,
    [like],
  );
}

export async function getStudentById(db: Queryable, id: number): Promise<StudentRow | null> {
  return one<StudentRow>(db, 'SELECT * FROM students WHERE id = $1', [id]);
}

export async function getStudentByCode(db: Queryable, code: string): Promise<StudentRow | null> {
  return one<StudentRow>(db, 'SELECT * FROM students WHERE student_id_code = $1', [code]);
}

export async function insertStudent(
  db: Queryable,
  row: {
    studentIdCode: string;
    fullName: string;
    section: string | null;
    photoUrl: string | null;
  },
): Promise<StudentRow> {
  const created = await one<StudentRow>(
    db,
    `INSERT INTO students (student_id_code, full_name, section, photo_url)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [row.studentIdCode, row.fullName, row.section, row.photoUrl],
  );
  return created!;
}

export async function updateStudent(
  db: Queryable,
  id: number,
  fields: {
    studentIdCode?: string;
    fullName?: string;
    section?: string | null;
    photoUrl?: string | null;
    hasSection?: boolean;
    hasPhoto?: boolean;
  },
): Promise<StudentRow> {
  const sets: string[] = ['updated_at = NOW()'];
  const values: unknown[] = [];
  let i = 1;
  if (fields.studentIdCode != null) {
    sets.push(`student_id_code = $${i++}`);
    values.push(fields.studentIdCode);
  }
  if (fields.fullName != null) {
    sets.push(`full_name = $${i++}`);
    values.push(fields.fullName);
  }
  if (fields.hasSection) {
    sets.push(`section = $${i++}`);
    values.push(fields.section);
  }
  if (fields.hasPhoto) {
    sets.push(`photo_url = $${i++}`);
    values.push(fields.photoUrl);
  }
  values.push(id);
  const row = await one<StudentRow>(
    db,
    `UPDATE students SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    values,
  );
  return row!;
}

export async function deleteStudent(db: Queryable, id: number): Promise<void> {
  await db.query('DELETE FROM students WHERE id = $1', [id]);
}

export async function listEvents(db: Queryable): Promise<EventRow[]> {
  return many<EventRow>(db, 'SELECT * FROM events ORDER BY event_date DESC');
}

export async function listActiveEvents(db: Queryable): Promise<EventRow[]> {
  return many<EventRow>(
    db,
    `SELECT * FROM events WHERE is_active = TRUE ORDER BY event_date DESC`,
  );
}

export async function getEventById(db: Queryable, id: number): Promise<EventRow | null> {
  return one<EventRow>(db, 'SELECT * FROM events WHERE id = $1', [id]);
}

export async function insertEvent(
  db: Queryable,
  row: { name: string; eventDate: Date; isActive: boolean; createdBy: number },
): Promise<EventRow> {
  const created = await one<EventRow>(
    db,
    `INSERT INTO events (name, event_date, is_active, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [row.name, row.eventDate, row.isActive, row.createdBy],
  );
  return created!;
}

export async function updateEvent(
  db: Queryable,
  id: number,
  fields: { name?: string; eventDate?: Date; isActive?: boolean },
): Promise<EventRow> {
  const sets: string[] = ['updated_at = NOW()'];
  const values: unknown[] = [];
  let i = 1;
  if (fields.name != null) {
    sets.push(`name = $${i++}`);
    values.push(fields.name);
  }
  if (fields.eventDate != null) {
    sets.push(`event_date = $${i++}`);
    values.push(fields.eventDate);
  }
  if (fields.isActive != null) {
    sets.push(`is_active = $${i++}`);
    values.push(fields.isActive);
  }
  values.push(id);
  const row = await one<EventRow>(
    db,
    `UPDATE events SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    values,
  );
  return row!;
}

export async function deleteEvent(db: Queryable, id: number): Promise<void> {
  await db.query('DELETE FROM events WHERE id = $1', [id]);
}

export async function deactivateEvent(db: Queryable, id: number): Promise<void> {
  await db.query(
    `UPDATE events SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
    [id],
  );
}

export async function windowsForEvent(db: Queryable, eventId: number): Promise<SessionWindowRow[]> {
  return many<SessionWindowRow>(
    db,
    `SELECT * FROM session_windows WHERE event_id = $1 ORDER BY sort_order ASC`,
    [eventId],
  );
}

export async function listAllWindows(db: Queryable): Promise<SessionWindowRow[]> {
  return many<SessionWindowRow>(
    db,
    `SELECT * FROM session_windows ORDER BY sort_order ASC`,
  );
}

export async function getWindowById(
  db: Queryable,
  id: number,
): Promise<SessionWindowRow | null> {
  return one<SessionWindowRow>(db, 'SELECT * FROM session_windows WHERE id = $1', [id]);
}

export async function insertWindow(
  db: Queryable,
  row: {
    eventId: number;
    sessionLabel: string;
    startTime: string;
    endTime: string;
    sortOrder: number;
  },
): Promise<SessionWindowRow> {
  const created = await one<SessionWindowRow>(
    db,
    `INSERT INTO session_windows (event_id, session_label, start_time, end_time, sort_order)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [row.eventId, row.sessionLabel, row.startTime, row.endTime, row.sortOrder],
  );
  return created!;
}

export async function updateWindow(
  db: Queryable,
  id: number,
  fields: {
    sessionLabel?: string;
    startTime: string;
    endTime: string;
    sortOrder?: number;
  },
): Promise<SessionWindowRow> {
  const sets = [`start_time = $1`, `end_time = $2`];
  const values: unknown[] = [fields.startTime, fields.endTime];
  let i = 3;
  if (fields.sessionLabel != null) {
    sets.push(`session_label = $${i++}`);
    values.push(fields.sessionLabel);
  }
  if (fields.sortOrder != null) {
    sets.push(`sort_order = $${i++}`);
    values.push(fields.sortOrder);
  }
  values.push(id);
  const row = await one<SessionWindowRow>(
    db,
    `UPDATE session_windows SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    values,
  );
  return row!;
}

export async function deleteWindow(db: Queryable, id: number): Promise<void> {
  await db.query('DELETE FROM session_windows WHERE id = $1', [id]);
}

export async function countAttendanceForWindow(db: Queryable, windowId: number): Promise<number> {
  const row = await one<{ n: string }>(
    db,
    'SELECT COUNT(*)::text AS n FROM attendance_logs WHERE session_window_id = $1',
    [windowId],
  );
  return Number(row?.n ?? 0);
}

export async function confirmedLogs(
  db: Queryable,
  args: { eventId: number; studentId: number; sessionWindowId: number },
  forUpdate = false,
): Promise<AttendanceLogRow[]> {
  const lock = forUpdate ? ' FOR UPDATE' : '';
  return many<AttendanceLogRow>(
    db,
    `SELECT * FROM attendance_logs
     WHERE event_id = $1 AND student_id = $2 AND session_window_id = $3
       AND status = 'confirmed'
     ORDER BY scanned_at ASC${lock}`,
    [args.eventId, args.studentId, args.sessionWindowId],
  );
}

export async function insertAttendance(
  db: Queryable,
  row: {
    eventId: number;
    studentId: number;
    sessionWindowId: number;
    direction: string;
    scannedAt: Date;
    scannedBy: number;
    status: string;
    deviceNote: string | null;
  },
): Promise<AttendanceLogRow> {
  const created = await one<AttendanceLogRow>(
    db,
    `INSERT INTO attendance_logs
       (event_id, student_id, session_window_id, direction, scanned_at, scanned_by, status, device_note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      row.eventId,
      row.studentId,
      row.sessionWindowId,
      row.direction,
      row.scannedAt,
      row.scannedBy,
      row.status,
      row.deviceNote,
    ],
  );
  return created!;
}

export async function getAttendanceById(
  db: Queryable,
  id: number,
): Promise<AttendanceLogRow | null> {
  return one<AttendanceLogRow>(db, 'SELECT * FROM attendance_logs WHERE id = $1', [id]);
}

export async function deleteAttendance(db: Queryable, id: number): Promise<void> {
  await db.query('DELETE FROM attendance_logs WHERE id = $1', [id]);
}

export async function updateAttendance(
  db: Queryable,
  id: number,
  fields: {
    direction?: string;
    status?: string;
    sessionWindowId?: number;
    scannedAt?: Date;
    deviceNote?: string | null;
    hasNote?: boolean;
  },
): Promise<void> {
  const sets: string[] = ['updated_at = NOW()'];
  const values: unknown[] = [];
  let i = 1;
  if (fields.direction != null) {
    sets.push(`direction = $${i++}`);
    values.push(fields.direction);
  }
  if (fields.status != null) {
    sets.push(`status = $${i++}`);
    values.push(fields.status);
  }
  if (fields.sessionWindowId != null) {
    sets.push(`session_window_id = $${i++}`);
    values.push(fields.sessionWindowId);
  }
  if (fields.scannedAt != null) {
    sets.push(`scanned_at = $${i++}`);
    values.push(fields.scannedAt);
  }
  if (fields.hasNote) {
    sets.push(`device_note = $${i++}`);
    values.push(fields.deviceNote);
  }
  values.push(id);
  await db.query(`UPDATE attendance_logs SET ${sets.join(', ')} WHERE id = $${i}`, values);
}

const DETAIL_SELECT = `
  SELECT
    l.*,
    s.student_id_code,
    s.full_name AS student_name,
    s.section AS student_section,
    w.session_label,
    u.name AS scanned_by_name,
    e.name AS event_name
  FROM attendance_logs l
  LEFT JOIN students s ON s.id = l.student_id
  LEFT JOIN session_windows w ON w.id = l.session_window_id
  LEFT JOIN users u ON u.id = l.scanned_by
  LEFT JOIN events e ON e.id = l.event_id
`;

export async function getAttendanceDetail(
  db: Queryable,
  id: number,
): Promise<AttendanceDetailRow | null> {
  return one<AttendanceDetailRow>(db, `${DETAIL_SELECT} WHERE l.id = $1`, [id]);
}

export async function listAttendance(
  db: Queryable,
  f: AttendanceFilter,
): Promise<AttendanceDetailRow[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (f.eventId != null) {
    conditions.push(`l.event_id = $${i++}`);
    values.push(f.eventId);
  }
  if (f.studentId != null) {
    conditions.push(`l.student_id = $${i++}`);
    values.push(f.studentId);
  }
  if (f.sessionWindowId != null) {
    conditions.push(`l.session_window_id = $${i++}`);
    values.push(f.sessionWindowId);
  }
  if (f.scannedBy != null) {
    conditions.push(`l.scanned_by = $${i++}`);
    values.push(f.scannedBy);
  }
  if (f.status != null) {
    conditions.push(`l.status = $${i++}`);
    values.push(f.status);
  }
  if (f.date != null) {
    const start = startOfDay(f.date);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    conditions.push(`l.scanned_at >= $${i++}`);
    values.push(start);
    conditions.push(`l.scanned_at < $${i++}`);
    values.push(end);
  }
  if (f.search) {
    const like = `%${escapeLike(f.search.toLowerCase())}%`;
    conditions.push(
      `(LOWER(s.full_name) LIKE $${i} ESCAPE '\\' OR LOWER(s.student_id_code) LIKE $${i} ESCAPE '\\')`,
    );
    values.push(like);
    i++;
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  let limitSql = '';
  if (f.limit != null) {
    limitSql = `LIMIT $${i++}`;
    values.push(Math.max(0, Math.trunc(f.limit)));
  }
  return many<AttendanceDetailRow>(
    db,
    `${DETAIL_SELECT} ${where} ORDER BY l.scanned_at DESC ${limitSql}`,
    values,
  );
}
