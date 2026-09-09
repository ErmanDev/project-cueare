import type { AttendanceDetailRow } from '../utils/serialize.ts';
import { conflict, isPgUniqueViolation } from '../utils/errors.ts';
import { parseMinutes, startOfDay } from '../utils/time.ts';
import { escapeLike } from '../utils/studentCode.ts';
import { q } from './ident.ts';
import type {
  AttendanceFilter,
  AttendanceLogRow,
  EventRow,
  Queryable,
  SessionWindowRow,
  StudentRow,
  UserRow,
} from '../types.ts';

const DEFAULT_TERM = 'DEFAULT';
const DEFAULT_PROGRAM = 'GEN';

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

async function defaultTermId(db: Queryable): Promise<number> {
  const row = await one<{ academic_term_id: number }>(
    db,
    `SELECT ${q('academicTermId')} AS academic_term_id FROM ${q('AcademicTerms')} WHERE ${q('termCode')} = $1`,
    [DEFAULT_TERM],
  );
  if (!row) throw new Error('Default academic term is missing');
  return row.academic_term_id;
}

async function defaultProgramId(db: Queryable): Promise<number> {
  const row = await one<{ academic_program_id: number }>(
    db,
    `SELECT ${q('academicProgramId')} AS academic_program_id FROM ${q('AcademicPrograms')} WHERE ${q('programCode')} = $1`,
    [DEFAULT_PROGRAM],
  );
  if (!row) throw new Error('Default academic program is missing');
  return row.academic_program_id;
}

function splitFullName(fullName: string): {
  firstName: string;
  middleName: string | null;
  lastName: string;
} {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: 'Student', middleName: null, lastName: 'Unknown' };
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

function hhmm(value: Date): string {
  const h = String(value.getHours()).padStart(2, '0');
  const m = String(value.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function combineDateAndTime(day: Date, time: string): Date {
  const mins = parseMinutes(time);
  if (mins == null) throw new Error(`Invalid time ${time}`);
  const d = startOfDay(day);
  d.setMinutes(mins);
  return d;
}

function sessionBounds(eventDate: Date, startTime: string, endTime: string) {
  const starts = combineDateAndTime(eventDate, startTime);
  const ends = combineDateAndTime(eventDate, endTime);
  return {
    startsAtUtc: starts,
    endsAtUtc: ends,
    checkInOpensAtUtc: starts,
    checkInClosesAtUtc: ends,
    lateAfterUtc: starts,
    checkOutOpensAtUtc: starts,
    checkOutClosesAtUtc: ends,
  };
}

function slugCode(value: string, max: number): string {
  const slug = value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max);
  return slug || 'X';
}

function eventDateFromRow(value: Date | string): Date {
  if (value instanceof Date) return startOfDay(value);
  const d = new Date(value);
  return startOfDay(d);
}

function toWindow(row: {
  event_session_id: number;
  event_id: number;
  session_name: string;
  starts_at_utc: Date;
  ends_at_utc: Date;
  sort_order: number;
}): SessionWindowRow {
  return {
    id: row.event_session_id,
    event_id: row.event_id,
    session_label: row.session_name,
    start_time: hhmm(row.starts_at_utc),
    end_time: hhmm(row.ends_at_utc),
    sort_order: row.sort_order,
  };
}

function mapEvent(row: {
  id: number;
  name: string;
  event_date: Date | string;
  is_active: boolean;
  created_by: number;
  created_at: Date;
  updated_at: Date;
}): EventRow {
  return {
    id: row.id,
    name: row.name,
    event_date: eventDateFromRow(row.event_date),
    is_active: row.is_active,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const USER_SELECT = `
  SELECT
    u.${q('userId')} AS id,
    u.${q('displayName')} AS name,
    u.username,
    u.${q('passwordHash')} AS password_hash,
    u.role,
    u.${q('createdAtUtc')} AS created_at,
    u.${q('updatedAtUtc')} AS updated_at
  FROM ${q('Users')} u
`;

const STUDENT_SELECT = `
  SELECT
    s.${q('studentId')} AS id,
    s.${q('studentNumber')} AS student_id_code,
    trim(concat_ws(' ', s.${q('firstName')}, s.${q('middleName')}, s.${q('lastName')}, s.suffix)) AS full_name,
    sec.${q('sectionName')} AS section,
    s.${q('photoUrl')} AS photo_url,
    s.${q('createdAtUtc')} AS created_at,
    s.${q('updatedAtUtc')} AS updated_at
  FROM ${q('Students')} s
  LEFT JOIN LATERAL (
    SELECT se.${q('sectionId')} AS section_id
    FROM ${q('StudentEnrollments')} se
    WHERE se.${q('studentId')} = s.${q('studentId')} AND se.${q('effectiveToUtc')} IS NULL
    ORDER BY se.${q('studentEnrollmentId')} DESC
    LIMIT 1
  ) cur ON true
  LEFT JOIN ${q('Sections')} sec ON sec.${q('sectionId')} = cur.section_id
`;

const EVENT_SELECT = `
  SELECT
    e.${q('eventId')} AS id,
    e.${q('eventName')} AS name,
    e.${q('eventDate')}::timestamp AS event_date,
    (e.${q('eventStatusCode')} = 'PUBLISHED') AS is_active,
    e.${q('createdByUserId')} AS created_by,
    e.${q('createdAtUtc')} AS created_at,
    e.${q('updatedAtUtc')} AS updated_at
  FROM ${q('Events')} e
`;

const LOG_SELECT = `
  SELECT
    l.${q('attendanceLogId')} AS id,
    es.${q('eventId')} AS event_id,
    ep.${q('studentId')} AS student_id,
    es.${q('eventSessionId')} AS session_window_id,
    CASE l.${q('actionCode')} WHEN 'CHECK_OUT' THEN 'OUT' ELSE 'IN' END AS direction,
    l.${q('recordedAtUtc')} AS scanned_at,
    l.${q('actorUserId')} AS scanned_by,
    CASE WHEN l.${q('isCancelled')} THEN 'cancelled' ELSE 'confirmed' END AS status,
    l.${q('deviceNote')} AS device_note,
    l.${q('recordedAtUtc')} AS updated_at
  FROM ${q('AttendanceLogs')} l
  JOIN ${q('AttendanceRecords')} ar ON ar.${q('attendanceRecordId')} = l.${q('attendanceRecordId')}
  JOIN ${q('EventParticipants')} ep ON ep.${q('eventParticipantId')} = ar.${q('eventParticipantId')}
  JOIN ${q('EventSessions')} es ON es.${q('eventSessionId')} = ep.${q('eventSessionId')}
`;

const DETAIL_SELECT = `
  SELECT
    l.${q('attendanceLogId')} AS id,
    es.${q('eventId')} AS event_id,
    ep.${q('studentId')} AS student_id,
    es.${q('eventSessionId')} AS session_window_id,
    CASE l.${q('actionCode')} WHEN 'CHECK_OUT' THEN 'OUT' ELSE 'IN' END AS direction,
    l.${q('recordedAtUtc')} AS scanned_at,
    l.${q('actorUserId')} AS scanned_by,
    CASE WHEN l.${q('isCancelled')} THEN 'cancelled' ELSE 'confirmed' END AS status,
    l.${q('deviceNote')} AS device_note,
    l.${q('recordedAtUtc')} AS updated_at,
    s.${q('studentNumber')} AS student_id_code,
    trim(concat_ws(' ', s.${q('firstName')}, s.${q('middleName')}, s.${q('lastName')}, s.suffix)) AS student_name,
    sec.${q('sectionName')} AS student_section,
    es.${q('sessionName')} AS session_label,
    actor.${q('displayName')} AS scanned_by_name,
    ev.${q('eventName')} AS event_name
  FROM ${q('AttendanceLogs')} l
  JOIN ${q('AttendanceRecords')} ar ON ar.${q('attendanceRecordId')} = l.${q('attendanceRecordId')}
  JOIN ${q('EventParticipants')} ep ON ep.${q('eventParticipantId')} = ar.${q('eventParticipantId')}
  JOIN ${q('EventSessions')} es ON es.${q('eventSessionId')} = ep.${q('eventSessionId')}
  JOIN ${q('Events')} ev ON ev.${q('eventId')} = es.${q('eventId')}
  JOIN ${q('Students')} s ON s.${q('studentId')} = ep.${q('studentId')}
  JOIN ${q('Users')} actor ON actor.${q('userId')} = l.${q('actorUserId')}
  LEFT JOIN LATERAL (
    SELECT se.${q('sectionId')} AS section_id
    FROM ${q('StudentEnrollments')} se
    WHERE se.${q('studentId')} = s.${q('studentId')} AND se.${q('effectiveToUtc')} IS NULL
    ORDER BY se.${q('studentEnrollmentId')} DESC
    LIMIT 1
  ) cur ON true
  LEFT JOIN ${q('Sections')} sec ON sec.${q('sectionId')} = cur.section_id
`;

export async function getUserById(db: Queryable, id: number): Promise<UserRow | null> {
  return one<UserRow>(db, `${USER_SELECT} WHERE u.${q('userId')} = $1`, [id]);
}

export async function getUserByUsername(db: Queryable, username: string): Promise<UserRow | null> {
  return one<UserRow>(
    db,
    `${USER_SELECT} WHERE LOWER(u.username) = LOWER($1)`,
    [username],
  );
}

export async function getUserByUsernameExact(
  db: Queryable,
  username: string,
): Promise<UserRow | null> {
  return one<UserRow>(db, `${USER_SELECT} WHERE u.username = $1`, [username]);
}

export async function insertUser(
  db: Queryable,
  row: { name: string; username: string; passwordHash: string; role: string },
): Promise<UserRow> {
  const created = await one<UserRow>(
    db,
    `INSERT INTO ${q('Users')} (username, ${q('passwordHash')}, ${q('displayName')}, role)
     VALUES ($1, $2, $3, $4)
     RETURNING
       ${q('userId')} AS id,
       ${q('displayName')} AS name,
       username,
       ${q('passwordHash')} AS password_hash,
       role,
       ${q('createdAtUtc')} AS created_at,
       ${q('updatedAtUtc')} AS updated_at`,
    [row.username, row.passwordHash, row.name, row.role],
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
  const sets: string[] = [`${q('updatedAtUtc')} = clock_timestamp()`];
  const values: unknown[] = [];
  let i = 1;
  if (fields.name != null) {
    sets.push(`${q('displayName')} = $${i++}`);
    values.push(fields.name);
  }
  if (fields.username != null) {
    sets.push(`username = $${i++}`);
    values.push(fields.username);
  }
  if (fields.passwordHash != null) {
    sets.push(`${q('passwordHash')} = $${i++}`);
    values.push(fields.passwordHash);
  }
  if (fields.role != null) {
    sets.push(`role = $${i++}`);
    values.push(fields.role);
  }
  values.push(id);
  await db.query(`UPDATE ${q('Users')} SET ${sets.join(', ')} WHERE ${q('userId')} = $${i}`, values);
  return (await getUserById(db, id))!;
}

export async function listModerators(db: Queryable): Promise<UserRow[]> {
  return many<UserRow>(
    db,
    `${USER_SELECT} WHERE u.role = 'moderator' ORDER BY u.${q('displayName')} ASC`,
  );
}

export async function getModeratorById(db: Queryable, id: number): Promise<UserRow | null> {
  return one<UserRow>(
    db,
    `${USER_SELECT} WHERE u.${q('userId')} = $1 AND u.role = 'moderator'`,
    [id],
  );
}

export async function deleteUser(db: Queryable, id: number): Promise<void> {
  await db.query(`DELETE FROM ${q('Users')} WHERE ${q('userId')} = $1`, [id]);
}

export async function countScansByModerator(db: Queryable, userId: number): Promise<number> {
  const row = await one<{ n: string }>(
    db,
    `SELECT COUNT(*)::text AS n FROM ${q('AttendanceLogs')} WHERE ${q('actorUserId')} = $1`,
    [userId],
  );
  return Number(row?.n ?? 0);
}

export async function listStudents(db: Queryable, search?: string | null): Promise<StudentRow[]> {
  if (!search) {
    return many<StudentRow>(db, `${STUDENT_SELECT} ORDER BY full_name ASC`);
  }
  const like = `%${escapeLike(search.toLowerCase())}%`;
  return many<StudentRow>(
    db,
    `${STUDENT_SELECT}
     WHERE LOWER(trim(concat_ws(' ', s.${q('firstName')}, s.${q('middleName')}, s.${q('lastName')}, s.suffix))) LIKE $1 ESCAPE '\\'
        OR LOWER(s.${q('studentNumber')}) LIKE $1 ESCAPE '\\'
        OR LOWER(COALESCE(sec.${q('sectionName')}, '')) LIKE $1 ESCAPE '\\'
     ORDER BY full_name ASC`,
    [like],
  );
}

export async function getStudentById(db: Queryable, id: number): Promise<StudentRow | null> {
  return one<StudentRow>(db, `${STUDENT_SELECT} WHERE s.${q('studentId')} = $1`, [id]);
}

export async function getStudentByCode(db: Queryable, code: string): Promise<StudentRow | null> {
  return one<StudentRow>(db, `${STUDENT_SELECT} WHERE s.${q('studentNumber')} = $1`, [code]);
}

export async function getStudentsByCodes(
  db: Queryable,
  codes: string[],
): Promise<StudentRow[]> {
  if (codes.length === 0) return [];
  return many<StudentRow>(
    db,
    `${STUDENT_SELECT} WHERE s.${q('studentNumber')} = ANY($1::text[])`,
    [codes],
  );
}

/** Transaction-scoped lock for one student in one session (blocks other writers). */
export async function lockStudentSession(
  db: Queryable,
  studentId: number,
  sessionWindowId: number,
): Promise<void> {
  await db.query('SELECT pg_advisory_xact_lock($1::int, $2::int)', [
    studentId,
    sessionWindowId,
  ]);
}

async function findOrCreateSection(
  db: Queryable,
  args: { termId: number; programId: number; section: string },
): Promise<number> {
  const code = args.section.trim().slice(0, 30);
  const existing = await one<{ section_id: number }>(
    db,
    `SELECT ${q('sectionId')} AS section_id FROM ${q('Sections')}
     WHERE ${q('academicTermId')} = $1 AND ${q('academicProgramId')} = $2 AND ${q('sectionCode')} = $3`,
    [args.termId, args.programId, code],
  );
  if (existing) return existing.section_id;
  const created = await one<{ section_id: number }>(
    db,
    `INSERT INTO ${q('Sections')} (
        ${q('academicTermId')}, ${q('academicProgramId')}, ${q('yearLevel')}, ${q('sectionCode')}, ${q('sectionName')}
     ) VALUES ($1, $2, 1, $3, $4)
     RETURNING ${q('sectionId')} AS section_id`,
    [args.termId, args.programId, code, args.section.trim().slice(0, 100)],
  );
  return created!.section_id;
}

async function upsertCurrentEnrollment(
  db: Queryable,
  args: {
    studentId: number;
    section: string | null;
    hasSection?: boolean;
  },
): Promise<void> {
  const termId = await defaultTermId(db);
  const programId = await defaultProgramId(db);
  let sectionId: number | null | undefined;
  if (args.hasSection === false) {
    sectionId = undefined;
  } else if (args.section == null || args.section.trim() === '') {
    sectionId = null;
  } else {
    sectionId = await findOrCreateSection(db, {
      termId,
      programId,
      section: args.section,
    });
  }

  const current = await one<{ student_enrollment_id: number }>(
    db,
    `SELECT ${q('studentEnrollmentId')} AS student_enrollment_id FROM ${q('StudentEnrollments')}
     WHERE ${q('studentId')} = $1 AND ${q('academicTermId')} = $2
       AND ${q('effectiveToUtc')} IS NULL`,
    [args.studentId, termId],
  );

  if (!current) {
    await db.query(
      `INSERT INTO ${q('StudentEnrollments')} (
          ${q('studentId')}, ${q('academicTermId')}, ${q('academicProgramId')}, ${q('sectionId')},
          ${q('yearLevel')}, ${q('enrollmentStatusCode')}, ${q('effectiveFromUtc')}
       ) VALUES ($1, $2, $3, $4, 1, 'ENROLLED', clock_timestamp())`,
      [args.studentId, termId, programId, sectionId ?? null],
    );
    return;
  }

  if (sectionId !== undefined) {
    await db.query(
      `UPDATE ${q('StudentEnrollments')} SET ${q('sectionId')} = $1, ${q('academicProgramId')} = $2, ${q('yearLevel')} = 1
       WHERE ${q('studentEnrollmentId')} = $3`,
      [sectionId, programId, current.student_enrollment_id],
    );
  }
}

async function getOrCreateEnrollment(
  db: Queryable,
  studentId: number,
): Promise<{ student_enrollment_id: number; academic_term_id: number }> {
  const termId = await defaultTermId(db);
  const existing = await one<{ student_enrollment_id: number; academic_term_id: number }>(
    db,
    `SELECT ${q('studentEnrollmentId')} AS student_enrollment_id, ${q('academicTermId')} AS academic_term_id
     FROM ${q('StudentEnrollments')}
     WHERE ${q('studentId')} = $1 AND ${q('academicTermId')} = $2
       AND ${q('effectiveToUtc')} IS NULL`,
    [studentId, termId],
  );
  if (existing) return existing;
  await upsertCurrentEnrollment(db, { studentId, section: null });
  const created = await one<{ student_enrollment_id: number; academic_term_id: number }>(
    db,
    `SELECT ${q('studentEnrollmentId')} AS student_enrollment_id, ${q('academicTermId')} AS academic_term_id
     FROM ${q('StudentEnrollments')}
     WHERE ${q('studentId')} = $1 AND ${q('academicTermId')} = $2
       AND ${q('effectiveToUtc')} IS NULL`,
    [studentId, termId],
  );
  return created!;
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
  const names = splitFullName(row.fullName);
  const created = await one<{ student_id: number }>(
    db,
    `INSERT INTO ${q('Students')} (
        ${q('studentNumber')}, ${q('firstName')}, ${q('middleName')}, ${q('lastName')}, ${q('photoUrl')}
     ) VALUES ($1, $2, $3, $4, $5)
     RETURNING ${q('studentId')} AS student_id`,
    [row.studentIdCode, names.firstName, names.middleName, names.lastName, row.photoUrl],
  );
  await upsertCurrentEnrollment(db, {
    studentId: created!.student_id,
    section: row.section,
  });
  return (await getStudentById(db, created!.student_id))!;
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
  const sets: string[] = [`${q('updatedAtUtc')} = clock_timestamp()`];
  const values: unknown[] = [];
  let i = 1;
  if (fields.studentIdCode != null) {
    sets.push(`${q('studentNumber')} = $${i++}`);
    values.push(fields.studentIdCode);
  }
  if (fields.fullName != null) {
    const names = splitFullName(fields.fullName);
    sets.push(`${q('firstName')} = $${i++}`);
    values.push(names.firstName);
    sets.push(`${q('middleName')} = $${i++}`);
    values.push(names.middleName);
    sets.push(`${q('lastName')} = $${i++}`);
    values.push(names.lastName);
  }
  if (fields.hasPhoto) {
    sets.push(`${q('photoUrl')} = $${i++}`);
    values.push(fields.photoUrl);
  }
  values.push(id);
  await db.query(`UPDATE ${q('Students')} SET ${sets.join(', ')} WHERE ${q('studentId')} = $${i}`, values);
  if (fields.hasSection) {
    await upsertCurrentEnrollment(db, {
      studentId: id,
      section: fields.section ?? null,
      hasSection: true,
    });
  }
  return (await getStudentById(db, id))!;
}

export async function deleteStudent(db: Queryable, id: number): Promise<void> {
  await db.query(`DELETE FROM ${q('Students')} WHERE ${q('studentId')} = $1`, [id]);
}

export async function listEvents(db: Queryable): Promise<EventRow[]> {
  const rows = await many<Parameters<typeof mapEvent>[0]>(
    db,
    `${EVENT_SELECT} ORDER BY e.${q('eventDate')} DESC, e.${q('eventId')} DESC`,
  );
  return rows.map(mapEvent);
}

export async function listActiveEvents(db: Queryable): Promise<EventRow[]> {
  const rows = await many<Parameters<typeof mapEvent>[0]>(
    db,
    `${EVENT_SELECT} WHERE e.${q('eventStatusCode')} = 'PUBLISHED' ORDER BY e.${q('eventDate')} DESC`,
  );
  return rows.map(mapEvent);
}

export async function getEventById(db: Queryable, id: number): Promise<EventRow | null> {
  const row = await one<Parameters<typeof mapEvent>[0]>(
    db,
    `${EVENT_SELECT} WHERE e.${q('eventId')} = $1`,
    [id],
  );
  return row ? mapEvent(row) : null;
}

async function eventTermId(db: Queryable, eventId: number): Promise<number> {
  const row = await one<{ academic_term_id: number }>(
    db,
    `SELECT ${q('academicTermId')} AS academic_term_id FROM ${q('Events')} WHERE ${q('eventId')} = $1`,
    [eventId],
  );
  if (!row) throw new Error('Event not found');
  return row.academic_term_id;
}

export async function insertEvent(
  db: Queryable,
  row: { name: string; eventDate: Date; isActive: boolean; createdBy: number },
): Promise<EventRow> {
  const term = await defaultTermId(db);
  const code = `EVT-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
  const created = await one<{ event_id: number }>(
    db,
    `INSERT INTO ${q('Events')} (
        ${q('academicTermId')}, ${q('eventCode')}, ${q('eventName')}, ${q('eventDate')},
        ${q('eventStatusCode')}, ${q('createdByUserId')}
     ) VALUES ($1, $2, $3, $4::date, $5, $6)
     RETURNING ${q('eventId')} AS event_id`,
    [
      term,
      code.slice(0, 50),
      row.name,
      row.eventDate,
      row.isActive ? 'PUBLISHED' : 'CLOSED',
      row.createdBy,
    ],
  );
  return (await getEventById(db, created!.event_id))!;
}

export async function updateEvent(
  db: Queryable,
  id: number,
  fields: { name?: string; eventDate?: Date; isActive?: boolean },
): Promise<EventRow> {
  const existing = (await getEventById(db, id))!;
  const sets: string[] = [`${q('updatedAtUtc')} = clock_timestamp()`];
  const values: unknown[] = [];
  let i = 1;
  if (fields.name != null) {
    sets.push(`${q('eventName')} = $${i++}`);
    values.push(fields.name);
  }
  if (fields.eventDate != null) {
    sets.push(`${q('eventDate')} = $${i++}::date`);
    values.push(fields.eventDate);
  }
  if (fields.isActive != null) {
    sets.push(`${q('eventStatusCode')} = $${i++}`);
    values.push(fields.isActive ? 'PUBLISHED' : 'CLOSED');
  }
  values.push(id);
  await db.query(`UPDATE ${q('Events')} SET ${sets.join(', ')} WHERE ${q('eventId')} = $${i}`, values);

  if (fields.eventDate != null) {
    const windows = await windowsForEvent(db, id);
    for (const w of windows) {
      await updateWindow(db, w.id, {
        startTime: w.start_time,
        endTime: w.end_time,
      });
    }
  }

  return (await getEventById(db, id)) ?? existing;
}

export async function deleteEvent(db: Queryable, id: number): Promise<void> {
  await db.query(`DELETE FROM ${q('Events')} WHERE ${q('eventId')} = $1`, [id]);
}

export async function deactivateEvent(db: Queryable, id: number): Promise<void> {
  await db.query(
    `UPDATE ${q('Events')}
     SET ${q('eventStatusCode')} = 'CLOSED', ${q('updatedAtUtc')} = clock_timestamp()
     WHERE ${q('eventId')} = $1`,
    [id],
  );
}

export async function windowsForEvent(db: Queryable, eventId: number): Promise<SessionWindowRow[]> {
  const rows = await many<{
    event_session_id: number;
    event_id: number;
    session_name: string;
    starts_at_utc: Date;
    ends_at_utc: Date;
    sort_order: number;
  }>(
    db,
    `SELECT ${q('eventSessionId')} AS event_session_id, ${q('eventId')} AS event_id, ${q('sessionName')} AS session_name,
            ${q('startsAtUtc')} AS starts_at_utc, ${q('endsAtUtc')} AS ends_at_utc, ${q('sortOrder')} AS sort_order
     FROM ${q('EventSessions')}
     WHERE ${q('eventId')} = $1
     ORDER BY ${q('sortOrder')} ASC, ${q('startsAtUtc')} ASC`,
    [eventId],
  );
  return rows.map(toWindow);
}

export async function listAllWindows(db: Queryable): Promise<SessionWindowRow[]> {
  const rows = await many<{
    event_session_id: number;
    event_id: number;
    session_name: string;
    starts_at_utc: Date;
    ends_at_utc: Date;
    sort_order: number;
  }>(
    db,
    `SELECT ${q('eventSessionId')} AS event_session_id, ${q('eventId')} AS event_id, ${q('sessionName')} AS session_name,
            ${q('startsAtUtc')} AS starts_at_utc, ${q('endsAtUtc')} AS ends_at_utc, ${q('sortOrder')} AS sort_order
     FROM ${q('EventSessions')}
     ORDER BY ${q('sortOrder')} ASC, ${q('startsAtUtc')} ASC`,
  );
  return rows.map(toWindow);
}

export async function getWindowById(
  db: Queryable,
  id: number,
): Promise<SessionWindowRow | null> {
  const row = await one<{
    event_session_id: number;
    event_id: number;
    session_name: string;
    starts_at_utc: Date;
    ends_at_utc: Date;
    sort_order: number;
  }>(
    db,
    `SELECT ${q('eventSessionId')} AS event_session_id, ${q('eventId')} AS event_id, ${q('sessionName')} AS session_name,
            ${q('startsAtUtc')} AS starts_at_utc, ${q('endsAtUtc')} AS ends_at_utc, ${q('sortOrder')} AS sort_order
     FROM ${q('EventSessions')} WHERE ${q('eventSessionId')} = $1`,
    [id],
  );
  return row ? toWindow(row) : null;
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
  const event = await getEventById(db, row.eventId);
  if (!event) throw new Error('Event not found');
  const termId = await eventTermId(db, row.eventId);
  const bounds = sessionBounds(event.event_date, row.startTime, row.endTime);
  const code = `${slugCode(row.sessionLabel, 20)}-${row.sortOrder}`.slice(0, 30);
  const created = await one<{ event_session_id: number }>(
    db,
    `INSERT INTO ${q('EventSessions')} (
        ${q('eventId')}, ${q('academicTermId')}, ${q('sessionCode')}, ${q('sessionName')},
        ${q('startsAtUtc')}, ${q('endsAtUtc')}, ${q('checkInOpensAtUtc')}, ${q('checkInClosesAtUtc')},
        ${q('lateAfterUtc')}, ${q('checkOutOpensAtUtc')}, ${q('checkOutClosesAtUtc')}, ${q('sortOrder')}
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING ${q('eventSessionId')} AS event_session_id`,
    [
      row.eventId,
      termId,
      code,
      row.sessionLabel,
      bounds.startsAtUtc,
      bounds.endsAtUtc,
      bounds.checkInOpensAtUtc,
      bounds.checkInClosesAtUtc,
      bounds.lateAfterUtc,
      bounds.checkOutOpensAtUtc,
      bounds.checkOutClosesAtUtc,
      row.sortOrder,
    ],
  );
  return (await getWindowById(db, created!.event_session_id))!;
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
  const existing = await getWindowById(db, id);
  if (!existing) throw new Error('Session not found');
  const event = await getEventById(db, existing.event_id);
  if (!event) throw new Error('Event not found');
  const bounds = sessionBounds(event.event_date, fields.startTime, fields.endTime);
  const sets = [
    `${q('startsAtUtc')} = $1`,
    `${q('endsAtUtc')} = $2`,
    `${q('checkInOpensAtUtc')} = $3`,
    `${q('checkInClosesAtUtc')} = $4`,
    `${q('lateAfterUtc')} = $5`,
    `${q('checkOutOpensAtUtc')} = $6`,
    `${q('checkOutClosesAtUtc')} = $7`,
  ];
  const values: unknown[] = [
    bounds.startsAtUtc,
    bounds.endsAtUtc,
    bounds.checkInOpensAtUtc,
    bounds.checkInClosesAtUtc,
    bounds.lateAfterUtc,
    bounds.checkOutOpensAtUtc,
    bounds.checkOutClosesAtUtc,
  ];
  let i = 8;
  if (fields.sessionLabel != null) {
    sets.push(`${q('sessionName')} = $${i++}`);
    values.push(fields.sessionLabel);
  }
  if (fields.sortOrder != null) {
    sets.push(`${q('sortOrder')} = $${i++}`);
    values.push(fields.sortOrder);
  }
  values.push(id);
  await db.query(
    `UPDATE ${q('EventSessions')} SET ${sets.join(', ')} WHERE ${q('eventSessionId')} = $${i}`,
    values,
  );
  return (await getWindowById(db, id))!;
}

export async function deleteWindow(db: Queryable, id: number): Promise<void> {
  await db.query(`DELETE FROM ${q('EventSessions')} WHERE ${q('eventSessionId')} = $1`, [id]);
}

export async function countAttendanceForWindow(db: Queryable, windowId: number): Promise<number> {
  const row = await one<{ n: string }>(
    db,
    `SELECT COUNT(*)::text AS n
     FROM ${q('AttendanceLogs')} l
     JOIN ${q('AttendanceRecords')} ar ON ar.${q('attendanceRecordId')} = l.${q('attendanceRecordId')}
     JOIN ${q('EventParticipants')} ep ON ep.${q('eventParticipantId')} = ar.${q('eventParticipantId')}
     WHERE ep.${q('eventSessionId')} = $1`,
    [windowId],
  );
  return Number(row?.n ?? 0);
}

async function ensureScanTarget(
  db: Queryable,
  args: { eventId: number; studentId: number; sessionWindowId: number; actorUserId: number },
): Promise<{ recordId: number }> {
  const session = await one<{
    event_session_id: number;
    academic_term_id: number;
    event_id: number;
  }>(
    db,
    `SELECT ${q('eventSessionId')} AS event_session_id, ${q('academicTermId')} AS academic_term_id, ${q('eventId')} AS event_id
     FROM ${q('EventSessions')} WHERE ${q('eventSessionId')} = $1`,
    [args.sessionWindowId],
  );
  if (!session || session.event_id !== args.eventId) {
    throw new Error('Session window not found for this event');
  }
  const enrollment = await getOrCreateEnrollment(db, args.studentId);
  let participant = await one<{ event_participant_id: number }>(
    db,
    `SELECT ${q('eventParticipantId')} AS event_participant_id FROM ${q('EventParticipants')}
     WHERE ${q('eventSessionId')} = $1 AND ${q('studentId')} = $2`,
    [args.sessionWindowId, args.studentId],
  );
  if (!participant) {
    participant = await one<{ event_participant_id: number }>(
      db,
      `INSERT INTO ${q('EventParticipants')} (
          ${q('eventSessionId')}, ${q('academicTermId')}, ${q('studentEnrollmentId')},
          ${q('studentId')}, ${q('addedByUserId')}
       ) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (${q('eventSessionId')}, ${q('studentId')}) DO NOTHING
       RETURNING ${q('eventParticipantId')} AS event_participant_id`,
      [
        args.sessionWindowId,
        session.academic_term_id,
        enrollment.student_enrollment_id,
        args.studentId,
        args.actorUserId,
      ],
    );
    if (!participant) {
      participant = await one<{ event_participant_id: number }>(
        db,
        `SELECT ${q('eventParticipantId')} AS event_participant_id FROM ${q('EventParticipants')}
         WHERE ${q('eventSessionId')} = $1 AND ${q('studentId')} = $2`,
        [args.sessionWindowId, args.studentId],
      );
    }
  }
  let record = await one<{ attendance_record_id: number }>(
    db,
    `SELECT ${q('attendanceRecordId')} AS attendance_record_id FROM ${q('AttendanceRecords')}
     WHERE ${q('eventParticipantId')} = $1
     FOR UPDATE`,
    [participant!.event_participant_id],
  );
  if (!record) {
    record = await one<{ attendance_record_id: number }>(
      db,
      `INSERT INTO ${q('AttendanceRecords')} (
          ${q('eventParticipantId')}, ${q('lastChangedByUserId')}
       ) VALUES ($1, $2)
       ON CONFLICT (${q('eventParticipantId')}) DO NOTHING
       RETURNING ${q('attendanceRecordId')} AS attendance_record_id`,
      [participant!.event_participant_id, args.actorUserId],
    );
    if (!record) {
      record = await one<{ attendance_record_id: number }>(
        db,
        `SELECT ${q('attendanceRecordId')} AS attendance_record_id FROM ${q('AttendanceRecords')}
         WHERE ${q('eventParticipantId')} = $1
         FOR UPDATE`,
        [participant!.event_participant_id],
      );
    }
  }
  return { recordId: record!.attendance_record_id };
}

async function getRecordTimes(
  db: Queryable,
  recordId: number,
): Promise<{ checked_in_at_utc: Date | null; checked_out_at_utc: Date | null }> {
  const row = await one<{ checked_in_at_utc: Date | null; checked_out_at_utc: Date | null }>(
    db,
    `SELECT ${q('checkedInAtUtc')} AS checked_in_at_utc, ${q('checkedOutAtUtc')} AS checked_out_at_utc
     FROM ${q('AttendanceRecords')}
     WHERE ${q('attendanceRecordId')} = $1`,
    [recordId],
  );
  return row ?? { checked_in_at_utc: null, checked_out_at_utc: null };
}

export async function confirmedLogs(
  db: Queryable,
  args: { eventId: number; studentId: number; sessionWindowId: number },
  forUpdate = false,
): Promise<AttendanceLogRow[]> {
  const lock = forUpdate ? ' FOR UPDATE OF l' : '';
  return many<AttendanceLogRow>(
    db,
    `${LOG_SELECT}
     WHERE es.${q('eventId')} = $1 AND ep.${q('studentId')} = $2 AND es.${q('eventSessionId')} = $3
       AND l.${q('isCancelled')} = false
       AND l.${q('actionCode')} IN ('CHECK_IN', 'CHECK_OUT')
     ORDER BY l.${q('recordedAtUtc')} ASC${lock}`,
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
  const cancelled = row.status === 'cancelled';
  const action = row.direction === 'OUT' ? 'CHECK_OUT' : 'CHECK_IN';
  const { recordId } = await ensureScanTarget(db, {
    eventId: row.eventId,
    studentId: row.studentId,
    sessionWindowId: row.sessionWindowId,
    actorUserId: row.scannedBy,
  });
  const previous = await getRecordTimes(db, recordId);

  let newIn = previous.checked_in_at_utc;
  let newOut = previous.checked_out_at_utc;
  if (!cancelled) {
    if (action === 'CHECK_IN') newIn = row.scannedAt;
    if (action === 'CHECK_OUT') newOut = row.scannedAt;
    await db.query(
      `UPDATE ${q('AttendanceRecords')}
       SET ${q('checkedInAtUtc')} = $1,
           ${q('checkedOutAtUtc')} = $2,
           ${q('lastChangedByUserId')} = $3,
           ${q('lastChangedAtUtc')} = clock_timestamp()
       WHERE ${q('attendanceRecordId')} = $4`,
      [newIn, newOut, row.scannedBy, recordId],
    );
  }

  let created: { attendance_log_id: number } | null;
  try {
    created = await one<{ attendance_log_id: number }>(
      db,
      `INSERT INTO ${q('AttendanceLogs')} (
          ${q('attendanceRecordId')}, ${q('actionCode')},
          ${q('oldCheckInAtUtc')}, ${q('oldCheckOutAtUtc')},
          ${q('newCheckInAtUtc')}, ${q('newCheckOutAtUtc')},
          ${q('oldIsExcused')}, ${q('newIsExcused')},
          ${q('actorUserId')}, ${q('recordedAtUtc')}, ${q('deviceNote')}, ${q('isCancelled')}
       ) VALUES ($1,$2,$3,$4,$5,$6,false,false,$7,$8,$9,$10)
       RETURNING ${q('attendanceLogId')} AS attendance_log_id`,
      [
        recordId,
        action,
        previous.checked_in_at_utc,
        previous.checked_out_at_utc,
        cancelled ? previous.checked_in_at_utc : newIn,
        cancelled ? previous.checked_out_at_utc : newOut,
        row.scannedBy,
        row.scannedAt,
        row.deviceNote,
        cancelled,
      ],
    );
  } catch (e) {
    if (!cancelled && isPgUniqueViolation(e)) {
      throw conflict('Already recorded for this session', { code: 'ALREADY_COMPLETE' });
    }
    throw e;
  }
  return (await getAttendanceById(db, created!.attendance_log_id))!;
}

export async function getAttendanceById(
  db: Queryable,
  id: number,
): Promise<AttendanceLogRow | null> {
  return one<AttendanceLogRow>(db, `${LOG_SELECT} WHERE l.${q('attendanceLogId')} = $1`, [id]);
}

export async function deleteAttendance(db: Queryable, id: number): Promise<void> {
  const existing = await getAttendanceById(db, id);
  await db.query(`DELETE FROM ${q('AttendanceLogs')} WHERE ${q('attendanceLogId')} = $1`, [id]);
  if (existing) {
    await recomputeRecordFromLogs(db, existing);
  }
}

async function recomputeRecordFromLogs(
  db: Queryable,
  hint: { event_id: number; student_id: number; session_window_id: number },
): Promise<void> {
  const logs = await confirmedLogs(db, {
    eventId: hint.event_id,
    studentId: hint.student_id,
    sessionWindowId: hint.session_window_id,
  });
  const cin = logs.find((l) => l.direction === 'IN')?.scanned_at ?? null;
  const cout = logs.find((l) => l.direction === 'OUT')?.scanned_at ?? null;
  await db.query(
    `UPDATE ${q('AttendanceRecords')} ar
     SET ${q('checkedInAtUtc')} = $1,
         ${q('checkedOutAtUtc')} = $2,
         ${q('lastChangedAtUtc')} = clock_timestamp()
     FROM ${q('EventParticipants')} ep
     WHERE ar.${q('eventParticipantId')} = ep.${q('eventParticipantId')}
       AND ep.${q('studentId')} = $3
       AND ep.${q('eventSessionId')} = $4`,
    [cin, cin ? cout : null, hint.student_id, hint.session_window_id],
  );
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
  const existing = await getAttendanceById(db, id);
  if (!existing) return;

  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (fields.direction != null) {
    sets.push(`${q('actionCode')} = $${i++}`);
    values.push(fields.direction === 'OUT' ? 'CHECK_OUT' : 'CHECK_IN');
  }
  if (fields.status != null) {
    sets.push(`${q('isCancelled')} = $${i++}`);
    values.push(fields.status === 'cancelled');
  }
  if (fields.scannedAt != null) {
    sets.push(`${q('recordedAtUtc')} = $${i++}`);
    values.push(fields.scannedAt);
  }
  if (fields.hasNote) {
    sets.push(`${q('deviceNote')} = $${i++}`);
    values.push(fields.deviceNote);
  }
  if (sets.length) {
    values.push(id);
    await db.query(
      `UPDATE ${q('AttendanceLogs')} SET ${sets.join(', ')} WHERE ${q('attendanceLogId')} = $${i}`,
      values,
    );
  }

  const updated = (await getAttendanceById(db, id))!;
  if (fields.sessionWindowId != null && fields.sessionWindowId !== existing.session_window_id) {
    const { recordId } = await ensureScanTarget(db, {
      eventId: existing.event_id,
      studentId: existing.student_id,
      sessionWindowId: fields.sessionWindowId,
      actorUserId: existing.scanned_by,
    });
    await db.query(
      `UPDATE ${q('AttendanceLogs')} SET ${q('attendanceRecordId')} = $1 WHERE ${q('attendanceLogId')} = $2`,
      [recordId, id],
    );
    await recomputeRecordFromLogs(db, existing);
    await recomputeRecordFromLogs(db, {
      ...updated,
      session_window_id: fields.sessionWindowId,
    });
    return;
  }

  await recomputeRecordFromLogs(db, updated);
}

export async function getAttendanceDetail(
  db: Queryable,
  id: number,
): Promise<AttendanceDetailRow | null> {
  return one<AttendanceDetailRow>(db, `${DETAIL_SELECT} WHERE l.${q('attendanceLogId')} = $1`, [id]);
}

export async function listAttendance(
  db: Queryable,
  f: AttendanceFilter,
): Promise<AttendanceDetailRow[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (f.eventId != null) {
    conditions.push(`es.${q('eventId')} = $${i++}`);
    values.push(f.eventId);
  }
  if (f.studentId != null) {
    conditions.push(`ep.${q('studentId')} = $${i++}`);
    values.push(f.studentId);
  }
  if (f.sessionWindowId != null) {
    conditions.push(`es.${q('eventSessionId')} = $${i++}`);
    values.push(f.sessionWindowId);
  }
  if (f.scannedBy != null) {
    conditions.push(`l.${q('actorUserId')} = $${i++}`);
    values.push(f.scannedBy);
  }
  if (f.status != null) {
    conditions.push(`l.${q('isCancelled')} = $${i++}`);
    values.push(f.status === 'cancelled');
  }
  if (f.date != null) {
    const start = startOfDay(f.date);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    conditions.push(`l.${q('recordedAtUtc')} >= $${i++}`);
    values.push(start);
    conditions.push(`l.${q('recordedAtUtc')} < $${i++}`);
    values.push(end);
  }
  if (f.search) {
    const like = `%${escapeLike(f.search.toLowerCase())}%`;
    conditions.push(
      `(LOWER(trim(concat_ws(' ', s.${q('firstName')}, s.${q('middleName')}, s.${q('lastName')}, s.suffix))) LIKE $${i} ESCAPE '\\'
        OR LOWER(s.${q('studentNumber')}) LIKE $${i} ESCAPE '\\')`,
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
    `${DETAIL_SELECT} ${where} ORDER BY l.${q('recordedAtUtc')} DESC ${limitSql}`,
    values,
  );
}
