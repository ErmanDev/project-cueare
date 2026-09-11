import type { AttendanceDetailRow } from '../utils/serialize.ts';
import { conflict, isPgBusinessRule, isPgUniqueViolation, pgErrorMessage } from '../utils/errors.ts';
import { parseMinutes, startOfDay } from '../utils/time.ts';
import { PROGRAM_NAMES, type MappedImportStudent } from '../students/roster.ts';
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
  return ensureProgram(db, DEFAULT_PROGRAM);
}

async function activeTermId(db: Queryable): Promise<number | null> {
  const row = await one<{ academic_term_id: number }>(
    db,
    `SELECT ${q('academicTermId')} AS academic_term_id FROM ${q('AcademicTerms')}
     WHERE ${q('isActive')} = true
     ORDER BY ${q('startsOn')} DESC
     LIMIT 1`,
  );
  return row?.academic_term_id ?? null;
}

export async function ensureProgram(db: Queryable, code: string): Promise<number> {
  const programCode = code.trim().toUpperCase().slice(0, 30) || DEFAULT_PROGRAM;
  const name = PROGRAM_NAMES[programCode] ?? programCode;
  const row = await one<{ academic_program_id: number }>(
    db,
    `INSERT INTO ${q('AcademicPrograms')} (${q('programCode')}, ${q('programName')})
     VALUES ($1, $2)
     ON CONFLICT (${q('programCode')}) DO UPDATE SET ${q('programName')} = EXCLUDED.${q('programName')}
     RETURNING ${q('academicProgramId')} AS academic_program_id`,
    [programCode, name],
  );
  return row!.academic_program_id;
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
    s.${q('firstName')} AS first_name,
    s.${q('middleName')} AS middle_name,
    s.${q('lastName')} AS last_name,
    trim(concat_ws(' ', s.${q('firstName')}, s.${q('middleName')}, s.${q('lastName')}, s.suffix)) AS full_name,
    prog.${q('programCode')} AS course,
    cur.year_level,
    sec.${q('sectionName')} AS section,
    s.${q('photoUrl')} AS photo_url,
    s.${q('createdAtUtc')} AS created_at,
    s.${q('updatedAtUtc')} AS updated_at
  FROM ${q('Students')} s
  LEFT JOIN LATERAL (
    SELECT
      se.${q('sectionId')} AS section_id,
      se.${q('academicProgramId')} AS program_id,
      se.${q('yearLevel')} AS year_level
    FROM ${q('StudentEnrollments')} se
    WHERE se.${q('studentId')} = s.${q('studentId')} AND se.${q('effectiveToUtc')} IS NULL
    ORDER BY se.${q('studentEnrollmentId')} DESC
    LIMIT 1
  ) cur ON true
  LEFT JOIN ${q('Sections')} sec ON sec.${q('sectionId')} = cur.section_id
  LEFT JOIN ${q('AcademicPrograms')} prog ON prog.${q('academicProgramId')} = cur.program_id
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
    s.${q('firstName')} AS first_name,
    s.${q('middleName')} AS middle_name,
    s.${q('lastName')} AS last_name,
    trim(concat_ws(' ', s.${q('firstName')}, s.${q('middleName')}, s.${q('lastName')}, s.suffix)) AS student_name,
    prog.${q('programCode')} AS course,
    cur.year_level,
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
    SELECT
      se.${q('sectionId')} AS section_id,
      se.${q('academicProgramId')} AS program_id,
      se.${q('yearLevel')} AS year_level
    FROM ${q('StudentEnrollments')} se
    WHERE se.${q('studentId')} = s.${q('studentId')} AND se.${q('effectiveToUtc')} IS NULL
    ORDER BY se.${q('studentEnrollmentId')} DESC
    LIMIT 1
  ) cur ON true
  LEFT JOIN ${q('Sections')} sec ON sec.${q('sectionId')} = cur.section_id
  LEFT JOIN ${q('AcademicPrograms')} prog ON prog.${q('academicProgramId')} = cur.program_id
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

function studentSearchFilter(search?: string | null): { where: string; values: unknown[] } {
  if (!search) return { where: '', values: [] };
  const like = `%${escapeLike(search.toLowerCase())}%`;
  return {
    where: `WHERE LOWER(trim(concat_ws(' ', s.${q('firstName')}, s.${q('middleName')}, s.${q('lastName')}, s.suffix))) LIKE $1 ESCAPE '\\'
        OR LOWER(s.${q('studentNumber')}) LIKE $1 ESCAPE '\\'
        OR LOWER(COALESCE(sec.${q('sectionName')}, '')) LIKE $1 ESCAPE '\\'`,
    values: [like],
  };
}

export async function listStudents(db: Queryable, search?: string | null): Promise<StudentRow[]> {
  const { where, values } = studentSearchFilter(search);
  return many<StudentRow>(db, `${STUDENT_SELECT} ${where} ORDER BY full_name ASC`, values);
}

export async function listStudentsPage(
  db: Queryable,
  args: { search?: string | null; limit: number; offset: number },
): Promise<{ rows: StudentRow[]; total: number }> {
  const { where, values } = studentSearchFilter(args.search);
  const countRow = await one<{ n: number }>(
    db,
    `SELECT COUNT(*)::int AS n FROM (${STUDENT_SELECT} ${where}) listed`,
    values,
  );
  const limitIdx = values.length + 1;
  const offsetIdx = values.length + 2;
  const rows = await many<StudentRow>(
    db,
    `${STUDENT_SELECT} ${where} ORDER BY full_name ASC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    [...values, args.limit, args.offset],
  );
  return { rows, total: countRow?.n ?? 0 };
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
  args: { termId: number; programId: number; yearLevel: number; section: string },
): Promise<number> {
  const code = args.section.trim().slice(0, 30);
  const yearLevel = args.yearLevel;
  const existing = await one<{ section_id: number }>(
    db,
    `SELECT ${q('sectionId')} AS section_id FROM ${q('Sections')}
     WHERE ${q('academicTermId')} = $1 AND ${q('academicProgramId')} = $2
       AND ${q('yearLevel')} = $3 AND ${q('sectionCode')} = $4`,
    [args.termId, args.programId, yearLevel, code],
  );
  if (existing) return existing.section_id;
  const created = await one<{ section_id: number }>(
    db,
    `INSERT INTO ${q('Sections')} (
        ${q('academicTermId')}, ${q('academicProgramId')}, ${q('yearLevel')}, ${q('sectionCode')}, ${q('sectionName')}
     ) VALUES ($1, $2, $3, $4, $5)
     RETURNING ${q('sectionId')} AS section_id`,
    [args.termId, args.programId, yearLevel, code, args.section.trim().slice(0, 100)],
  );
  return created!.section_id;
}

async function resolveEnrollmentTermId(db: Queryable, studentId?: number): Promise<number> {
  if (studentId != null) {
    const current = await one<{ academic_term_id: number }>(
      db,
      `SELECT ${q('academicTermId')} AS academic_term_id FROM ${q('StudentEnrollments')}
       WHERE ${q('studentId')} = $1 AND ${q('effectiveToUtc')} IS NULL
       ORDER BY ${q('studentEnrollmentId')} DESC
       LIMIT 1`,
      [studentId],
    );
    if (current) return current.academic_term_id;
  }
  return (await activeTermId(db)) ?? (await defaultTermId(db));
}

async function upsertCurrentEnrollment(
  db: Queryable,
  args: {
    studentId: number;
    section: string | null;
    hasSection?: boolean;
    programCode?: string | null;
    yearLevel?: number | null;
    termId?: number;
  },
): Promise<void> {
  const termId = args.termId ?? (await defaultTermId(db));
  const programId = args.programCode
    ? await ensureProgram(db, args.programCode)
    : await defaultProgramId(db);
  const yearLevel = args.yearLevel ?? 1;
  let sectionId: number | null | undefined;
  if (args.hasSection === false) {
    sectionId = undefined;
  } else if (args.section == null || args.section.trim() === '') {
    sectionId = null;
  } else {
    sectionId = await findOrCreateSection(db, {
      termId,
      programId,
      yearLevel,
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
       ) VALUES ($1, $2, $3, $4, $5, 'ENROLLED', clock_timestamp())`,
      [args.studentId, termId, programId, sectionId ?? null, yearLevel],
    );
    return;
  }

  if (sectionId !== undefined) {
    await db.query(
      `UPDATE ${q('StudentEnrollments')} SET ${q('sectionId')} = $1, ${q('academicProgramId')} = $2, ${q('yearLevel')} = $3
       WHERE ${q('studentEnrollmentId')} = $4`,
      [sectionId, programId, yearLevel, current.student_enrollment_id],
    );
  } else if (args.programCode || args.yearLevel != null) {
    await db.query(
      `UPDATE ${q('StudentEnrollments')} SET ${q('academicProgramId')} = $1, ${q('yearLevel')} = $2
       WHERE ${q('studentEnrollmentId')} = $3`,
      [programId, yearLevel, current.student_enrollment_id],
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
    fullName?: string;
    firstName?: string;
    middleName?: string | null;
    lastName?: string;
    section: string | null;
    photoUrl: string | null;
    programCode?: string | null;
    yearLevel?: number | null;
    termId?: number;
  },
): Promise<StudentRow> {
  const names =
    row.firstName && row.lastName
      ? { firstName: row.firstName, middleName: row.middleName ?? null, lastName: row.lastName }
      : splitFullName(row.fullName ?? '');
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
    programCode: row.programCode,
    yearLevel: row.yearLevel,
    termId: row.termId,
  });
  return (await getStudentById(db, created!.student_id))!;
}

export async function updateStudent(
  db: Queryable,
  id: number,
  fields: {
    studentIdCode?: string;
    fullName?: string;
    firstName?: string;
    middleName?: string | null;
    lastName?: string;
    section?: string | null;
    photoUrl?: string | null;
    hasSection?: boolean;
    hasPhoto?: boolean;
    programCode?: string | null;
    yearLevel?: number | null;
    termId?: number;
  },
): Promise<StudentRow> {
  const sets: string[] = [`${q('updatedAtUtc')} = clock_timestamp()`];
  const values: unknown[] = [];
  let i = 1;
  if (fields.studentIdCode != null) {
    sets.push(`${q('studentNumber')} = $${i++}`);
    values.push(fields.studentIdCode);
  }
  const names =
    fields.firstName && fields.lastName
      ? { firstName: fields.firstName, middleName: fields.middleName ?? null, lastName: fields.lastName }
      : fields.fullName != null
        ? splitFullName(fields.fullName)
        : null;
  if (names) {
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
  if (fields.hasSection || fields.programCode || fields.yearLevel != null) {
    await upsertCurrentEnrollment(db, {
      studentId: id,
      section: fields.section ?? null,
      hasSection: fields.hasSection,
      programCode: fields.programCode,
      yearLevel: fields.yearLevel,
      termId: fields.termId,
    });
  }
  return (await getStudentById(db, id))!;
}

export async function upsertImportedStudent(
  db: Queryable,
  row: MappedImportStudent,
  skipExisting: boolean,
): Promise<'created' | 'updated' | 'skipped'> {
  const existing = await getStudentByCode(db, row.studentIdCode);
  const termId = await resolveEnrollmentTermId(db, existing?.id);
  if (!existing) {
    await insertStudent(db, {
      studentIdCode: row.studentIdCode,
      firstName: row.firstName,
      middleName: row.middleName,
      lastName: row.lastName,
      section: row.section,
      photoUrl: row.photoUrl,
      programCode: row.programCode,
      yearLevel: row.yearLevel,
      termId,
    });
    return 'created';
  }
  if (skipExisting) return 'skipped';
  await updateStudent(db, existing.id, {
    firstName: row.firstName,
    middleName: row.middleName,
    lastName: row.lastName,
    hasSection: true,
    section: row.section ?? existing.section,
    hasPhoto: row.photoUrl != null,
    photoUrl: row.photoUrl ?? existing.photo_url,
    programCode: row.programCode,
    yearLevel: row.yearLevel,
    termId,
  });
  return 'updated';
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

async function eventStatusCode(db: Queryable, eventId: number): Promise<string> {
  const row = await one<{ status: string }>(
    db,
    `SELECT ${q('eventStatusCode')} AS status FROM ${q('Events')} WHERE ${q('eventId')} = $1`,
    [eventId],
  );
  if (!row) throw new Error('Event not found');
  return row.status;
}

export async function ensureEventRoster(
  db: Queryable,
  eventId: number,
  actorUserId: number,
): Promise<void> {
  const students = await many<{ student_id: number }>(
    db,
    `SELECT ${q('studentId')} AS student_id FROM ${q('Students')} WHERE ${q('isActive')} = true`,
  );
  for (const student of students) {
    await getOrCreateEnrollment(db, student.student_id);
  }
  await db.query(
    `INSERT INTO ${q('EventParticipants')} (
        ${q('eventSessionId')}, ${q('academicTermId')}, ${q('studentEnrollmentId')},
        ${q('studentId')}, ${q('addedByUserId')}
     )
     SELECT es.${q('eventSessionId')}, COALESCE(es.${q('academicTermId')}, e.${q('academicTermId')}),
            se.${q('studentEnrollmentId')}, se.${q('studentId')}, $2
     FROM ${q('EventSessions')} es
     JOIN ${q('Events')} e ON e.${q('eventId')} = es.${q('eventId')}
     JOIN ${q('StudentEnrollments')} se
       ON se.${q('academicTermId')} = e.${q('academicTermId')}
      AND se.${q('effectiveToUtc')} IS NULL
      AND se.${q('enrollmentStatusCode')} = 'ENROLLED'
     WHERE es.${q('eventId')} = $1
     ON CONFLICT (${q('eventSessionId')}, ${q('studentId')}) DO NOTHING`,
    [eventId, actorUserId],
  );
}

export async function publishEvent(
  db: Queryable,
  eventId: number,
  actorUserId: number,
): Promise<EventRow> {
  const status = await eventStatusCode(db, eventId);
  if (status === 'PUBLISHED') return (await getEventById(db, eventId))!;
  if (status !== 'DRAFT') {
    throw conflict('Closed or cancelled events cannot be reactivated. Create a new event.');
  }
  await ensureEventRoster(db, eventId, actorUserId);
  try {
    await db.query(
      `UPDATE ${q('Events')}
       SET ${q('eventStatusCode')} = 'PUBLISHED', ${q('updatedAtUtc')} = clock_timestamp()
       WHERE ${q('eventId')} = $1 AND ${q('eventStatusCode')} = 'DRAFT'`,
      [eventId],
    );
  } catch (err) {
    if (isPgBusinessRule(err) && /publish requires/i.test(pgErrorMessage(err))) {
      return (await getEventById(db, eventId))!;
    }
    throw err;
  }
  return (await getEventById(db, eventId))!;
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
    [term, code.slice(0, 50), row.name, row.eventDate, 'DRAFT', row.createdBy],
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
  if (sets.length > 1) {
    values.push(id);
    await db.query(`UPDATE ${q('Events')} SET ${sets.join(', ')} WHERE ${q('eventId')} = $${i}`, values);
  }

  if (fields.eventDate != null) {
    const windows = await windowsForEvent(db, id);
    for (const w of windows) {
      await updateWindow(db, w.id, {
        startTime: w.start_time,
        endTime: w.end_time,
      });
    }
  }

  if (fields.isActive === true) {
    return publishEvent(db, id, existing.created_by);
  }
  if (fields.isActive === false) {
    const status = await eventStatusCode(db, id);
    if (status === 'PUBLISHED') await deactivateEvent(db, id);
  }

  return (await getEventById(db, id)) ?? existing;
}

export async function deleteEvent(db: Queryable, id: number): Promise<void> {
  await db.query(`DELETE FROM ${q('Events')} WHERE ${q('eventId')} = $1`, [id]);
}

export async function deactivateEvent(db: Queryable, id: number): Promise<void> {
  await db.query(
    `UPDATE ${q('EventSessions')} SET ${q('isClosed')} = TRUE WHERE ${q('eventId')} = $1`,
    [id],
  );
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
        ${q('lateAfterUtc')}, ${q('checkOutOpensAtUtc')}, ${q('checkOutClosesAtUtc')},
        ${q('requiresCheckOut')}, ${q('sortOrder')}
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,$12)
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

// --- Fine Policy & Rule Engine Queries ---

export async function listFineTemplates(db: Queryable): Promise<any[]> {
  const templates = await many<{
    template_id: number;
    template_code: string;
    template_name: string;
    description: string | null;
    is_active: boolean;
    version_id: number | null;
    version_number: number | null;
    currency_code: string | null;
    max_fine_per_student: number | null;
  }>(
    db,
    `SELECT 
       t.${q('finePolicyTemplateId')} AS template_id,
       t.${q('templateCode')} AS template_code,
       t.${q('templateName')} AS template_name,
       t.${q('description')} AS description,
       t.${q('isActive')} AS is_active,
       v.${q('finePolicyTemplateVersionId')} AS version_id,
       v.${q('versionNumber')} AS version_number,
       v.${q('currencyCode')} AS currency_code,
       v.${q('maximumFinePerStudent')} AS max_fine_per_student
     FROM ${q('FinePolicyTemplates')} t
     LEFT JOIN LATERAL (
       SELECT * FROM ${q('FinePolicyTemplateVersions')} pv
       WHERE pv.${q('finePolicyTemplateId')} = t.${q('finePolicyTemplateId')}
         AND pv.${q('versionStatusCode')} = 'PUBLISHED'
       ORDER BY pv.${q('versionNumber')} DESC
       LIMIT 1
     ) v ON TRUE
     WHERE t.${q('isActive')} = TRUE
     ORDER BY t.${q('templateName')}`,
  );

  const versionIds = templates.map((t) => t.version_id).filter((id): id is number => id != null);
  const rulesMap = new Map<number, any[]>();
  if (versionIds.length > 0) {
    const rules = await many<{
      rule_id: number;
      version_id: number;
      session_type_code: string;
      violation_code: string;
      fine_amount: number;
      priority_order: number;
    }>(
      db,
      `SELECT 
         ${q('finePolicyTemplateRuleId')} AS rule_id,
         ${q('finePolicyTemplateVersionId')} AS version_id,
         ${q('sessionTypeCode')} AS session_type_code,
         ${q('violationCode')} AS violation_code,
         ${q('fineAmount')} AS fine_amount,
         ${q('priorityOrder')} AS priority_order
       FROM ${q('FinePolicyTemplateRules')}
       WHERE ${q('finePolicyTemplateVersionId')} = ANY($1::bigint[])
         AND ${q('isActive')} = TRUE
       ORDER BY ${q('priorityOrder')}`,
      [versionIds],
    );
    for (const r of rules) {
      const list = rulesMap.get(r.version_id) ?? [];
      list.push({
        rule_id: r.rule_id,
        session_type_code: r.session_type_code,
        violation_code: r.violation_code,
        fine_amount: Number(r.fine_amount),
        priority_order: r.priority_order,
      });
      rulesMap.set(r.version_id, list);
    }
  }

  return templates.map((t) => ({
    template_id: t.template_id,
    template_code: t.template_code,
    template_name: t.template_name,
    description: t.description,
    is_active: t.is_active,
    active_version: t.version_id
      ? {
          version_id: t.version_id,
          version_number: t.version_number,
          currency_code: t.currency_code,
          max_fine_per_student: t.max_fine_per_student ? Number(t.max_fine_per_student) : null,
          rules: rulesMap.get(t.version_id) ?? [],
        }
      : null,
  }));
}

export async function getEventFinePolicy(db: Queryable, eventId: number): Promise<any | null> {
  const policy = await one<{
    policy_id: number;
    event_id: number;
    policy_code: string;
    policy_name: string;
    currency_code: string;
    maximum_fine_per_student: number | null;
    policy_status_code: string;
  }>(
    db,
    `SELECT 
       ${q('eventFinePolicyId')} AS policy_id,
       ${q('eventId')} AS event_id,
       ${q('policyCode')} AS policy_code,
       ${q('policyName')} AS policy_name,
       ${q('currencyCode')} AS currency_code,
       ${q('maximumFinePerStudent')} AS maximum_fine_per_student,
       ${q('policyStatusCode')} AS policy_status_code
     FROM ${q('EventFinePolicies')}
     WHERE ${q('eventId')} = $1`,
    [eventId],
  );

  const sessionRows = await many<{
    session_id: number;
    session_code: string;
    session_name: string;
    session_type_code: string;
    rule_id: number | null;
    violation_code: string | null;
    base_fine_amount: number | null;
    priority_order: number | null;
    is_rule_active: boolean | null;
    override_id: number | null;
    override_fine_amount: number | null;
    override_reason: string | null;
  }>(
    db,
    `SELECT
       s.${q('eventSessionId')} AS session_id,
       s.${q('sessionCode')} AS session_code,
       s.${q('sessionName')} AS session_name,
       s.${q('sessionTypeCode')} AS session_type_code,
       r.${q('eventFineRuleId')} AS rule_id,
       r.${q('violationCode')} AS violation_code,
       r.${q('fineAmount')} AS base_fine_amount,
       r.${q('priorityOrder')} AS priority_order,
       r.${q('isActive')} AS is_rule_active,
       o.${q('eventFineRuleOverrideId')} AS override_id,
       o.${q('fineAmount')} AS override_fine_amount,
       o.${q('overrideReason')} AS override_reason
     FROM ${q('EventSessions')} s
     LEFT JOIN ${q('EventFineRules')} r 
       ON r.${q('eventSessionId')} = s.${q('eventSessionId')} AND r.${q('isActive')} = TRUE
     LEFT JOIN ${q('EventFineRuleOverrides')} o 
       ON o.${q('eventFineRuleId')} = r.${q('eventFineRuleId')}
     WHERE s.${q('eventId')} = $1
     ORDER BY s.${q('startsAtUtc')}, s.${q('eventSessionId')}, r.${q('priorityOrder')}, r.${q('violationCode')}`,
    [eventId],
  );

  const sessionMap = new Map<number, any>();
  for (const row of sessionRows) {
    let session = sessionMap.get(row.session_id);
    if (!session) {
      session = {
        session_id: row.session_id,
        session_code: row.session_code,
        session_name: row.session_name,
        session_type_code: row.session_type_code,
        rules: [],
      };
      sessionMap.set(row.session_id, session);
    }

    if (row.rule_id && row.violation_code) {
      const baseAmount = Number(row.base_fine_amount ?? 0);
      const overrideAmount = row.override_fine_amount != null ? Number(row.override_fine_amount) : null;
      session.rules.push({
        rule_id: row.rule_id,
        violation_code: row.violation_code,
        base_fine_amount: baseAmount,
        effective_fine_amount: overrideAmount ?? baseAmount,
        priority_order: row.priority_order ?? 100,
        override: row.override_id
          ? {
              override_id: row.override_id,
              fine_amount: overrideAmount,
              override_reason: row.override_reason,
            }
          : null,
      });
    }
  }

  return {
    event_id: eventId,
    fine_policy: policy
      ? {
          policy_id: policy.policy_id,
          policy_code: policy.policy_code,
          policy_name: policy.policy_name,
          currency_code: policy.currency_code,
          maximum_fine_per_student: policy.maximum_fine_per_student ? Number(policy.maximum_fine_per_student) : null,
          status: policy.policy_status_code,
        }
      : null,
    sessions: Array.from(sessionMap.values()),
  };
}

export async function applyFinePolicyTemplateToEvent(
  db: Queryable,
  params: {
    eventId: number;
    templateVersionId: number;
    policyCode: string;
    policyName: string;
    actorUserId: number;
  },
): Promise<number> {
  const row = await one<{ policy_id: number }>(
    db,
    `SELECT sp_event_fine_policy_create_from_template($1, $2, $3, $4, $5) AS policy_id`,
    [
      params.eventId,
      params.templateVersionId,
      params.policyCode,
      params.policyName,
      params.actorUserId,
    ],
  );
  return row!.policy_id;
}

export type UpsertFineRuleInput = {
  sessionId: number;
  violationCode: string;
  fineAmount: number;
  priorityOrder?: number;
  override?: {
    fineAmount: number;
    overrideReason: string;
  } | null;
};

export async function upsertEventFineRules(
  db: Queryable,
  params: {
    eventId: number;
    actorUserId: number;
    policyCode?: string;
    policyName?: string;
    rules: UpsertFineRuleInput[];
  },
): Promise<void> {
  let policy = await one<{ policy_id: number }>(
    db,
    `SELECT ${q('eventFinePolicyId')} AS policy_id FROM ${q('EventFinePolicies')} WHERE ${q('eventId')} = $1`,
    [params.eventId],
  );

  if (!policy) {
    const code = params.policyCode || `FP-EVENT-${params.eventId}`;
    const name = params.policyName || `Event ${params.eventId} Fine Policy`;
    const created = await one<{ policy_id: number }>(
      db,
      `INSERT INTO ${q('EventFinePolicies')} (
         ${q('eventId')}, ${q('policyCode')}, ${q('policyName')}, ${q('createdByUserId')}
       ) VALUES ($1, $2, $3, $4)
       RETURNING ${q('eventFinePolicyId')} AS policy_id`,
      [params.eventId, code, name, params.actorUserId],
    );
    policy = created!;
  }

  for (const r of params.rules) {
    const priority = r.priorityOrder ?? 100;
    const ruleRow = await one<{ rule_id: number }>(
      db,
      `INSERT INTO ${q('EventFineRules')} (
         ${q('eventFinePolicyId')}, ${q('eventId')}, ${q('eventSessionId')}, ${q('violationCode')}, ${q('fineAmount')}, ${q('priorityOrder')}, ${q('isActive')}
       ) VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       ON CONFLICT (${q('eventFinePolicyId')}, ${q('eventSessionId')}, ${q('violationCode')})
       DO UPDATE SET ${q('fineAmount')} = EXCLUDED.${q('fineAmount')},
                     ${q('priorityOrder')} = EXCLUDED.${q('priorityOrder')},
                     ${q('isActive')} = TRUE
       RETURNING ${q('eventFineRuleId')} AS rule_id`,
      [policy.policy_id, params.eventId, r.sessionId, r.violationCode, r.fineAmount, priority],
    );

    const ruleId = ruleRow!.rule_id;

    if (r.override) {
      await db.query(
        `INSERT INTO ${q('EventFineRuleOverrides')} (
           ${q('eventFineRuleId')}, ${q('fineAmount')}, ${q('overrideReason')}, ${q('overriddenByUserId')}, ${q('overriddenAtUtc')}
         ) VALUES ($1, $2, $3, $4, clock_timestamp())
         ON CONFLICT (${q('eventFineRuleId')})
         DO UPDATE SET ${q('fineAmount')} = EXCLUDED.${q('fineAmount')},
                       ${q('overrideReason')} = EXCLUDED.${q('overrideReason')},
                       ${q('overriddenByUserId')} = EXCLUDED.${q('overriddenByUserId')},
                       ${q('overriddenAtUtc')} = clock_timestamp()`,
        [ruleId, r.override.fineAmount, r.override.overrideReason, params.actorUserId],
      );
    } else if (r.override === null) {
      await db.query(
        `DELETE FROM ${q('EventFineRuleOverrides')} WHERE ${q('eventFineRuleId')} = $1`,
        [ruleId],
      );
    }
  }
}

// --- Composite Event & Fine Management Lifecycle ---

export type CompositeSessionInput = {
  sessionId?: number;
  sessionCode: string;
  sessionName: string;
  sessionTypeCode?: string;
  startsAtUtc: string | Date;
  endsAtUtc: string | Date;
  checkInOpensAtUtc: string | Date;
  checkInClosesAtUtc: string | Date;
  lateAfterUtc: string | Date;
  checkOutOpensAtUtc?: string | Date | null;
  checkOutClosesAtUtc?: string | Date | null;
  requiresCheckOut?: boolean;
  minimumMinutes?: number;
};

export type CompositeAudienceRuleInput = {
  audienceScopeCode: 'ALL_STUDENTS' | 'PROGRAM' | 'YEAR_LEVEL' | 'SECTION' | 'STUDENT';
  academicProgramId?: number | null;
  sectionId?: number | null;
  yearLevel?: number | null;
  studentId?: number | null;
  isRequired?: boolean;
};

export type CompositeFinePolicyInput = {
  templateVersionId?: number | null;
  policyCode?: string | null;
  policyName?: string | null;
  maximumFinePerStudent?: number | null;
  customRules?: Array<{
    sessionCode: string;
    violationCode: string;
    fineAmount: number;
    priorityOrder?: number;
    override?: {
      fineAmount: number;
      overrideReason: string;
    } | null;
  }>;
};

export async function upsertCompositeEvent(
  db: Queryable,
  params: {
    eventId?: number;
    academicTermId?: number;
    eventCode: string;
    eventName: string;
    eventDate?: string | Date;
    actorUserId: number;
    sessions?: CompositeSessionInput[];
    audienceRules?: CompositeAudienceRuleInput[];
    finePolicy?: CompositeFinePolicyInput;
  },
): Promise<number> {
  const termId = params.academicTermId ?? (await defaultTermId(db));
  const eventDate = params.eventDate ?? new Date();

  let eventId = params.eventId;
  if (!eventId) {
    const created = await one<{ eventId: number }>(
      db,
      `INSERT INTO ${q('Events')} (
         ${q('academicTermId')}, ${q('eventCode')}, ${q('eventName')}, ${q('eventDate')}, ${q('eventStatusCode')}, ${q('createdByUserId')}
       ) VALUES ($1, $2, $3, $4, 'DRAFT', $5)
       ON CONFLICT (${q('eventCode')}) DO UPDATE
       SET ${q('eventName')} = EXCLUDED.${q('eventName')},
           ${q('eventDate')} = EXCLUDED.${q('eventDate')}
       RETURNING ${q('eventId')}`,
      [termId, params.eventCode, params.eventName, eventDate, params.actorUserId],
    );
    eventId = created!.eventId;
  } else {
    await db.query(
      `UPDATE ${q('Events')}
       SET ${q('eventName')} = $1,
           ${q('eventCode')} = $2,
           ${q('eventDate')} = COALESCE($3, ${q('eventDate')})
       WHERE ${q('eventId')} = $4`,
      [params.eventName, params.eventCode, params.eventDate, eventId],
    );
  }

  // Upsert Sessions
  const sessionCodeToIdMap = new Map<string, number>();
  if (Array.isArray(params.sessions)) {
    for (const s of params.sessions) {
      const typeCode = s.sessionTypeCode || 'GENERAL';
      const reqOut = s.requiresCheckOut ?? false;
      const minMin = s.minimumMinutes ?? 0;
      const sessRow = await one<{ eventSessionId: number }>(
        db,
        `INSERT INTO ${q('EventSessions')} (
           ${q('eventId')}, ${q('academicTermId')}, ${q('sessionCode')}, ${q('sessionName')}, ${q('sessionTypeCode')},
           ${q('startsAtUtc')}, ${q('endsAtUtc')}, ${q('checkInOpensAtUtc')}, ${q('checkInClosesAtUtc')}, ${q('lateAfterUtc')},
           ${q('checkOutOpensAtUtc')}, ${q('checkOutClosesAtUtc')}, ${q('requiresCheckOut')}, ${q('minimumMinutes')}, ${q('isClosed')}
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8, $9, $10,
           $11, $12, $13, $14, FALSE
         )
         ON CONFLICT (${q('eventId')}, ${q('sessionCode')}) DO UPDATE
         SET ${q('sessionName')} = EXCLUDED.${q('sessionName')},
             ${q('sessionTypeCode')} = EXCLUDED.${q('sessionTypeCode')},
             ${q('startsAtUtc')} = EXCLUDED.${q('startsAtUtc')},
             ${q('endsAtUtc')} = EXCLUDED.${q('endsAtUtc')},
             ${q('checkInOpensAtUtc')} = EXCLUDED.${q('checkInOpensAtUtc')},
             ${q('checkInClosesAtUtc')} = EXCLUDED.${q('checkInClosesAtUtc')},
             ${q('lateAfterUtc')} = EXCLUDED.${q('lateAfterUtc')},
             ${q('checkOutOpensAtUtc')} = EXCLUDED.${q('checkOutOpensAtUtc')},
             ${q('checkOutClosesAtUtc')} = EXCLUDED.${q('checkOutClosesAtUtc')},
             ${q('requiresCheckOut')} = EXCLUDED.${q('requiresCheckOut')},
             ${q('minimumMinutes')} = EXCLUDED.${q('minimumMinutes')}
         RETURNING ${q('eventSessionId')}`,
        [
          eventId,
          termId,
          s.sessionCode,
          s.sessionName,
          typeCode,
          s.startsAtUtc,
          s.endsAtUtc,
          s.checkInOpensAtUtc,
          s.checkInClosesAtUtc,
          s.lateAfterUtc,
          s.checkOutOpensAtUtc ?? null,
          s.checkOutClosesAtUtc ?? null,
          reqOut,
          minMin,
        ],
      );
      sessionCodeToIdMap.set(s.sessionCode, sessRow!.eventSessionId);
    }
  }

  // Upsert Audience Rules
  if (Array.isArray(params.audienceRules)) {
    for (const ar of params.audienceRules) {
      await db.query(
        `INSERT INTO ${q('EventAudienceRules')} (
           ${q('eventId')}, ${q('academicTermId')}, ${q('audienceScopeCode')},
           ${q('academicProgramId')}, ${q('sectionId')}, ${q('yearLevel')}, ${q('studentId')},
           ${q('isRequired')}, ${q('createdByUserId')}
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (${q('eventId')}, ${q('audienceScopeCode')}, ${q('academicProgramId')}, ${q('sectionId')}, ${q('yearLevel')}, ${q('studentId')})
         DO UPDATE SET ${q('isRequired')} = EXCLUDED.${q('isRequired')}`,
        [
          eventId,
          termId,
          ar.audienceScopeCode,
          ar.academicProgramId ?? null,
          ar.sectionId ?? null,
          ar.yearLevel ?? null,
          ar.studentId ?? null,
          ar.isRequired ?? true,
          params.actorUserId,
        ],
      );
    }
  }

  // Upsert Fine Policy
  if (params.finePolicy) {
    const fp = params.finePolicy;
    let policyId: number;

    const existingPolicy = await one<{ policy_id: number }>(
      db,
      `SELECT ${q('eventFinePolicyId')} AS policy_id FROM ${q('EventFinePolicies')} WHERE ${q('eventId')} = $1`,
      [eventId],
    );

    if (!existingPolicy) {
      if (fp.templateVersionId) {
        const pCode = fp.policyCode || `FP-${params.eventCode}`;
        const pName = fp.policyName || `${params.eventName} Fine Policy`;
        policyId = await applyFinePolicyTemplateToEvent(db, {
          eventId,
          templateVersionId: fp.templateVersionId,
          policyCode: pCode,
          policyName: pName,
          actorUserId: params.actorUserId,
        });
      } else {
        const pCode = fp.policyCode || `FP-${params.eventCode}`;
        const pName = fp.policyName || `${params.eventName} Fine Policy`;
        const np = await one<{ policy_id: number }>(
          db,
          `INSERT INTO ${q('EventFinePolicies')} (
             ${q('eventId')}, ${q('policyCode')}, ${q('policyName')}, ${q('maximumFinePerStudent')}, ${q('createdByUserId')}
           ) VALUES ($1, $2, $3, $4, $5)
           RETURNING ${q('eventFinePolicyId')} AS policy_id`,
          [eventId, pCode, pName, fp.maximumFinePerStudent ?? 500.0, params.actorUserId],
        );
        policyId = np!.policy_id;
      }
    } else {
      policyId = existingPolicy.policy_id;
      if (fp.maximumFinePerStudent != null) {
        await db.query(
          `UPDATE ${q('EventFinePolicies')} SET ${q('maximumFinePerStudent')} = $1 WHERE ${q('eventFinePolicyId')} = $2`,
          [fp.maximumFinePerStudent, policyId],
        );
      }
    }

    // Custom Rules
    if (Array.isArray(fp.customRules)) {
      const fineRulesInput: UpsertFineRuleInput[] = [];
      for (const cr of fp.customRules) {
        let sId = sessionCodeToIdMap.get(cr.sessionCode);
        if (!sId) {
          const fetchedSess = await one<{ eventSessionId: number }>(
            db,
            `SELECT ${q('eventSessionId')} FROM ${q('EventSessions')} WHERE ${q('eventId')} = $1 AND ${q('sessionCode')} = $2`,
            [eventId, cr.sessionCode],
          );
          sId = fetchedSess?.eventSessionId;
        }
        if (sId) {
          fineRulesInput.push({
            sessionId: sId,
            violationCode: cr.violationCode,
            fineAmount: cr.fineAmount,
            priorityOrder: cr.priorityOrder ?? 100,
            override: cr.override,
          });
        }
      }
      if (fineRulesInput.length > 0) {
        await upsertEventFineRules(db, {
          eventId,
          actorUserId: params.actorUserId,
          rules: fineRulesInput,
        });
      }
    }
  }

  return eventId;
}

export async function upsertFineTemplateWithVersion(
  db: Queryable,
  params: {
    templateCode: string;
    templateName: string;
    description?: string | null;
    versionNumber?: number;
    currencyCode?: string;
    maximumFinePerStudent?: number | null;
    publish?: boolean;
    actorUserId: number;
    rules: Array<{
      sessionTypeCode: string;
      violationCode: string;
      fineAmount: number;
      priorityOrder?: number;
    }>;
  },
): Promise<{ templateId: number; versionId: number }> {
  const tplRow = await one<{ template_id: number }>(
    db,
    `INSERT INTO ${q('FinePolicyTemplates')} (
       ${q('templateCode')}, ${q('templateName')}, ${q('description')}, ${q('isActive')}, ${q('createdByUserId')}
     ) VALUES ($1, $2, $3, TRUE, $4)
     ON CONFLICT (${q('templateCode')}) DO UPDATE
     SET ${q('templateName')} = EXCLUDED.${q('templateName')},
         ${q('description')} = EXCLUDED.${q('description')},
         ${q('isActive')} = TRUE
     RETURNING ${q('finePolicyTemplateId')} AS template_id`,
    [params.templateCode, params.templateName, params.description ?? null, params.actorUserId],
  );
  const templateId = tplRow!.template_id;

  const verNum = params.versionNumber ?? 1;
  const status = params.publish ? 'PUBLISHED' : 'DRAFT';
  const currency = params.currencyCode || 'PHP';

  const verRow = await one<{ version_id: number }>(
    db,
    `INSERT INTO ${q('FinePolicyTemplateVersions')} (
       ${q('finePolicyTemplateId')}, ${q('versionNumber')}, ${q('versionStatusCode')},
       ${q('currencyCode')}, ${q('maximumFinePerStudent')}, ${q('createdByUserId')}, ${q('publishedAtUtc')}
     ) VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $3 = 'PUBLISHED' THEN clock_timestamp() ELSE NULL END)
     ON CONFLICT (${q('finePolicyTemplateId')}, ${q('versionNumber')}) DO UPDATE
     SET ${q('versionStatusCode')} = EXCLUDED.${q('versionStatusCode')},
         ${q('maximumFinePerStudent')} = EXCLUDED.${q('maximumFinePerStudent')},
         ${q('publishedAtUtc')} = CASE WHEN EXCLUDED.${q('versionStatusCode')} = 'PUBLISHED' THEN clock_timestamp() ELSE ${q('FinePolicyTemplateVersions')}.${q('publishedAtUtc')} END
     RETURNING ${q('finePolicyTemplateVersionId')} AS version_id`,
    [templateId, verNum, status, currency, params.maximumFinePerStudent ?? null, params.actorUserId],
  );
  const versionId = verRow!.version_id;

  for (const r of params.rules) {
    await db.query(
      `INSERT INTO ${q('FinePolicyTemplateRules')} (
         ${q('finePolicyTemplateVersionId')}, ${q('sessionTypeCode')}, ${q('violationCode')},
         ${q('fineAmount')}, ${q('priorityOrder')}, ${q('isActive')}
       ) VALUES ($1, $2, $3, $4, $5, TRUE)
       ON CONFLICT (${q('finePolicyTemplateVersionId')}, ${q('sessionTypeCode')}, ${q('violationCode')}) DO UPDATE
       SET ${q('fineAmount')} = EXCLUDED.${q('fineAmount')},
           ${q('priorityOrder')} = EXCLUDED.${q('priorityOrder')},
           ${q('isActive')} = TRUE`,
      [versionId, r.sessionTypeCode || 'GENERAL', r.violationCode, r.fineAmount, r.priorityOrder ?? 100],
    );
  }

  return { templateId, versionId };
}

export async function publishEventRoster(
  db: Queryable,
  eventId: number,
  actorUserId: number,
): Promise<{ newRegistrationsCount: number; newParticipantsCount: number }> {
  await db.query(`CALL ssc.sp_event_roster_generate_from_audience_rules($1, $2, 0, 0)`, [eventId, actorUserId]);
  await db.query(
    `UPDATE ${q('Events')} SET ${q('eventStatusCode')} = 'PUBLISHED' WHERE ${q('eventId')} = $1`,
    [eventId],
  );
  const regs = await one<{ count: number }>(
    db,
    `SELECT COUNT(*)::int AS count FROM ${q('EventRegistrations')} WHERE ${q('eventId')} = $1`,
    [eventId],
  );
  const parts = await one<{ count: number }>(
    db,
    `SELECT COUNT(*)::int AS count FROM ${q('EventParticipants')} p
     JOIN ${q('EventSessions')} s ON s.${q('eventSessionId')} = p.${q('eventSessionId')}
     WHERE s.${q('eventId')} = $1`,
    [eventId],
  );
  return {
    newRegistrationsCount: regs?.count ?? 0,
    newParticipantsCount: parts?.count ?? 0,
  };
}

export async function closeSessionAndAssessFines(
  db: Queryable,
  sessionId: number,
  actorUserId: number,
): Promise<{ assessmentsCreated: number; totalAmountAssessed: number }> {
  await db.query(
    `UPDATE ${q('EventSessions')} SET ${q('isClosed')} = TRUE WHERE ${q('eventSessionId')} = $1`,
    [sessionId],
  );
  await db.query(
    `CALL ssc.sp_student_fine_assess_closed_session($1, $2, 0, 0)`,
    [sessionId, actorUserId],
  );
  const totals = await one<{ count: number; total: number }>(
    db,
    `SELECT COUNT(*)::int AS count, COALESCE(SUM(${q('assessedAmount')}), 0.00)::numeric AS total
     FROM ${q('StudentFineAssessments')}
     WHERE ${q('eventSessionId')} = $1`,
    [sessionId],
  );
  return {
    assessmentsCreated: totals?.count ?? 0,
    totalAmountAssessed: Number(totals?.total ?? 0),
  };
}

export async function listStudentFineBalances(
  db: Queryable,
  filters: {
    studentId?: number;
    studentNumber?: string;
    sessionId?: number;
    violationCode?: string;
    status?: string;
  },
): Promise<any[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (filters.studentId != null) {
    conditions.push(`"studentId" = $${i++}`);
    values.push(filters.studentId);
  }
  if (filters.studentNumber) {
    conditions.push(`"studentNumber" = $${i++}`);
    values.push(filters.studentNumber);
  }
  if (filters.sessionId != null) {
    conditions.push(`"eventSessionId" = $${i++}`);
    values.push(filters.sessionId);
  }
  if (filters.violationCode) {
    conditions.push(`"violationCode" = $${i++}`);
    values.push(filters.violationCode);
  }
  if (filters.status) {
    conditions.push(`"assessmentStatusCode" = $${i++}`);
    values.push(filters.status);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return many<any>(
    db,
    `SELECT * FROM ssc."VwStudentFineBalances" ${where} ORDER BY "studentFineAssessmentId" DESC`,
    values,
  );
}

export async function postFinePayment(
  db: Queryable,
  params: {
    paymentReference: string;
    paymentMethodCode: string;
    totalAmount: number;
    externalPaymentReference?: string | null;
    actorUserId: number;
    allocations: Array<{ assessment_id: number; amount: number }>;
  },
): Promise<number> {
  const row = await one<{ payment_id: number }>(
    db,
    `SELECT sp_fine_payment_post($1, $2, $3, $4, $5, $6::jsonb) AS payment_id`,
    [
      params.paymentReference,
      params.paymentMethodCode,
      params.totalAmount,
      params.actorUserId,
      params.externalPaymentReference ?? null,
      JSON.stringify(params.allocations),
    ],
  );
  return row!.payment_id;
}

export async function voidFinePayment(
  db: Queryable,
  params: {
    paymentId: number;
    voidReason: string;
    actorUserId: number;
  },
): Promise<void> {
  await db.query(`CALL ssc.sp_fine_payment_void($1, $2, $3)`, [
    params.paymentId,
    params.voidReason,
    params.actorUserId,
  ]);
}

export async function requestFineWaiver(
  db: Queryable,
  params: {
    assessmentId: number;
    waiverReason: string;
    actorUserId: number;
  },
): Promise<number> {
  const row = await one<{ waiver_id: number }>(
    db,
    `SELECT sp_fine_waiver_request($1, $2, $3) AS waiver_id`,
    [params.assessmentId, params.waiverReason, params.actorUserId],
  );
  return row!.waiver_id;
}

export async function reviewFineWaiver(
  db: Queryable,
  params: {
    waiverRequestId: number;
    decision: 'APPROVED' | 'REJECTED';
    reviewNotes: string;
    actorUserId: number;
  },
): Promise<void> {
  await db.query(`CALL ssc.sp_fine_waiver_review($1, $2, $3, $4)`, [
    params.waiverRequestId,
    params.decision,
    params.reviewNotes,
    params.actorUserId,
  ]);
}


