import type { AttendanceDetailRow } from '../utils/serialize.ts';
import { badRequest, conflict, isPgBusinessRule, isPgUniqueViolation, pgErrorMessage } from '../utils/errors.ts';
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

function sessionBounds(
  eventDate: Date,
  startTime: string,
  endTime: string,
  lateAfter?: string | null,
  inEnd?: string | null,
  outStart?: string | null,
  outEnd?: string | null,
) {
  const starts = combineDateAndTime(eventDate, startTime);
  let ends = combineDateAndTime(eventDate, endTime);
  if (ends <= starts) {
    ends = new Date(ends.getTime() + 24 * 60 * 60 * 1000);
  }
  let lateAfterUtc = lateAfter ? combineDateAndTime(eventDate, lateAfter) : starts;
  if (lateAfterUtc < starts) lateAfterUtc = starts;
  if (lateAfterUtc > ends) lateAfterUtc = ends;

  let inEndUtc = inEnd ? combineDateAndTime(eventDate, inEnd) : ends;
  if (inEndUtc < lateAfterUtc) inEndUtc = lateAfterUtc;
  if (inEndUtc > ends) inEndUtc = ends;

  let outStartUtc = outStart ? combineDateAndTime(eventDate, outStart) : starts;
  if (outStartUtc < starts) outStartUtc = starts;

  let outEndUtc = outEnd ? combineDateAndTime(eventDate, outEnd) : ends;
  if (outEndUtc < outStartUtc) outEndUtc = outStartUtc;
  if (outEndUtc < ends) outEndUtc = ends;

  return {
    startsAtUtc: starts,
    endsAtUtc: ends,
    checkInOpensAtUtc: starts,
    checkInClosesAtUtc: inEndUtc,
    lateAfterUtc: lateAfterUtc,
    checkOutOpensAtUtc: outStartUtc,
    checkOutClosesAtUtc: outEndUtc,
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
  late_after_utc?: Date | null;
  check_in_closes_at_utc?: Date | null;
  check_out_opens_at_utc?: Date | null;
  check_out_closes_at_utc?: Date | null;
  requires_check_out?: boolean;
  is_closed?: boolean;
  sort_order: number;
}): SessionWindowRow {
  const date = row.starts_at_utc;
  const sessionDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return {
    id: row.event_session_id,
    event_id: row.event_id,
    session_label: row.session_name,
    session_date: sessionDate,
    start_time: hhmm(row.starts_at_utc),
    end_time: hhmm(row.ends_at_utc),
    late_after: row.late_after_utc ? hhmm(row.late_after_utc) : null,
    in_end: row.check_in_closes_at_utc ? hhmm(row.check_in_closes_at_utc) : null,
    out_start: row.check_out_opens_at_utc ? hhmm(row.check_out_opens_at_utc) : null,
    out_end: row.check_out_closes_at_utc ? hhmm(row.check_out_closes_at_utc) : null,
    requires_checkout: row.requires_check_out ?? false,
    is_closed: row.is_closed ?? false,
    sort_order: row.sort_order,
  };
}

function mapEvent(row: {
  id: number;
  name: string;
  event_date: Date | string;
  last_session_date?: Date | string;
  is_active: boolean;
  created_by: number;
  created_at: Date;
  updated_at: Date;
}): EventRow {
  return {
    id: row.id,
    name: row.name,
    event_date: eventDateFromRow(row.event_date),
    last_session_date: row.last_session_date ? eventDateFromRow(row.last_session_date) : undefined,
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
    COALESCE((SELECT MAX(es.${q('startsAtUtc')}::date)
      FROM ${q('EventSessions')} es WHERE es.${q('eventId')} = e.${q('eventId')}),
      e.${q('eventDate')})::timestamp AS last_session_date,
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

export type EventAudienceScopeCode =
  | 'ALL_STUDENTS'
  | 'PROGRAM'
  | 'YEAR_LEVEL'
  | 'PROGRAM_YEAR_LEVEL'
  | 'SECTION'
  | 'STUDENT';

export type EventAudienceRuleInput = {
  audienceScopeCode: EventAudienceScopeCode;
  academicProgramId?: number | null;
  sectionId?: number | null;
  yearLevel?: number | null;
  studentId?: number | null;
  isRequired?: boolean;
};

export type EventAudienceRuleRow = {
  event_audience_rule_id: number;
  event_id: number;
  academic_term_id: number;
  audience_scope_code: EventAudienceScopeCode;
  academic_program_id: number | null;
  section_id: number | null;
  year_level: number | null;
  student_id: number | null;
  is_required: boolean;
  created_by_user_id: number;
  created_at_utc: string;
  program_code: string | null;
  program_name: string | null;
  section_name: string | null;
  student_number: string | null;
  first_name: string | null;
  last_name: string | null;
};

export async function listEventAudienceRules(db: Queryable, eventId: number): Promise<EventAudienceRuleRow[]> {
  return many<EventAudienceRuleRow>(
    db,
    `SELECT
       ar.${q('eventAudienceRuleId')} AS event_audience_rule_id,
       ar.${q('eventId')} AS event_id,
       ar.${q('academicTermId')} AS academic_term_id,
       ar.${q('audienceScopeCode')} AS audience_scope_code,
       ar.${q('academicProgramId')} AS academic_program_id,
       ar.${q('sectionId')} AS section_id,
       ar.${q('yearLevel')} AS year_level,
       ar.${q('studentId')} AS student_id,
       ar.${q('isRequired')} AS is_required,
       ar.${q('createdByUserId')} AS created_by_user_id,
       ar.${q('createdAtUtc')} AS created_at_utc,
       p.${q('programCode')} AS program_code,
       p.${q('programName')} AS program_name,
       sec.${q('sectionName')} AS section_name,
       s.${q('studentNumber')} AS student_number,
       s.${q('firstName')} AS first_name,
       s.${q('lastName')} AS last_name
     FROM ${q('EventAudienceRules')} ar
     LEFT JOIN ${q('AcademicPrograms')} p ON p.${q('academicProgramId')} = ar.${q('academicProgramId')}
     LEFT JOIN ${q('Sections')} sec ON sec.${q('sectionId')} = ar.${q('sectionId')}
     LEFT JOIN ${q('Students')} s ON s.${q('studentId')} = ar.${q('studentId')}
     WHERE ar.${q('eventId')} = $1
     ORDER BY ar.${q('eventAudienceRuleId')}`,
    [eventId],
  );
}

function normaliseAudienceRule(rule: EventAudienceRuleInput): EventAudienceRuleInput {
  const scope = rule.audienceScopeCode;
  const academicProgramId = rule.academicProgramId ?? null;
  const sectionId = rule.sectionId ?? null;
  const yearLevel = rule.yearLevel ?? null;
  const studentId = rule.studentId ?? null;
  if (scope === 'ALL_STUDENTS') return { audienceScopeCode: scope, isRequired: rule.isRequired ?? true };
  if (scope === 'PROGRAM' && academicProgramId) {
    return { audienceScopeCode: scope, academicProgramId, isRequired: rule.isRequired ?? true };
  }
  if (scope === 'YEAR_LEVEL' && yearLevel) {
    return { audienceScopeCode: scope, yearLevel, isRequired: rule.isRequired ?? true };
  }
  if (scope === 'PROGRAM_YEAR_LEVEL' && academicProgramId && yearLevel) {
    return { audienceScopeCode: scope, academicProgramId, yearLevel, isRequired: rule.isRequired ?? true };
  }
  if (scope === 'SECTION' && academicProgramId && sectionId && yearLevel) {
    return { audienceScopeCode: scope, academicProgramId, sectionId, yearLevel, isRequired: rule.isRequired ?? true };
  }
  if (scope === 'STUDENT' && studentId) {
    return { audienceScopeCode: scope, studentId, isRequired: rule.isRequired ?? true };
  }
  throw new Error(`Invalid audience rule for ${scope}`);
}

export async function replaceEventAudienceRules(
  db: Queryable,
  eventId: number,
  actorUserId: number,
  rules: EventAudienceRuleInput[],
): Promise<number> {
  const termId = await eventTermId(db, eventId);
  await db.query(`DELETE FROM ${q('EventAudienceRules')} WHERE ${q('eventId')} = $1`, [eventId]);
  let inserted = 0;
  for (const raw of rules) {
    const rule = normaliseAudienceRule(raw);
    const result = await db.query(
      `INSERT INTO ${q('EventAudienceRules')} (
         ${q('eventId')}, ${q('academicTermId')}, ${q('audienceScopeCode')},
         ${q('academicProgramId')}, ${q('sectionId')}, ${q('yearLevel')}, ${q('studentId')},
         ${q('isRequired')}, ${q('createdByUserId')})
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        eventId,
        termId,
        rule.audienceScopeCode,
        rule.academicProgramId ?? null,
        rule.sectionId ?? null,
        rule.yearLevel ?? null,
        rule.studentId ?? null,
        rule.isRequired ?? true,
        actorUserId,
      ],
    );
    inserted += result.rowCount ?? 0;
  }
  return inserted;
}

async function eventAudienceRuleCount(db: Queryable, eventId: number): Promise<number> {
  const row = await one<{ count: number }>(
    db,
    `SELECT COUNT(*)::int AS count FROM ${q('EventAudienceRules')} WHERE ${q('eventId')} = $1`,
    [eventId],
  );
  return row?.count ?? 0;
}

export async function ensureEventRoster(
  db: Queryable,
  eventId: number,
  actorUserId: number,
): Promise<void> {
  if ((await eventAudienceRuleCount(db, eventId)) > 0) {
    await registerEventStudentsFromAudienceRules(db, eventId, actorUserId);
    await syncEventSessionParticipants(db, eventId, actorUserId);
    return;
  }
  const students = await many<{ student_id: number }>(
    db,
    `SELECT ${q('studentId')} AS student_id FROM ${q('Students')} WHERE ${q('isActive')} = true`,
  );
  for (const student of students) {
    await getOrCreateEnrollment(db, student.student_id);
  }
  await registerEventStudents(db, eventId, actorUserId);
  await syncEventSessionParticipants(db, eventId, actorUserId);
}

async function registerEventStudentsFromAudienceRules(
  db: Queryable,
  eventId: number,
  actorUserId: number,
): Promise<number> {
  const result = await db.query(
    `WITH matched AS (
       SELECT DISTINCT ON (se.${q('studentId')})
         ar.${q('eventAudienceRuleId')},
         ar.${q('isRequired')},
         se.${q('studentEnrollmentId')},
         se.${q('studentId')}
       FROM ${q('EventAudienceRules')} ar
       JOIN ${q('Events')} e ON e.${q('eventId')} = ar.${q('eventId')}
       JOIN ${q('StudentEnrollments')} se ON se.${q('academicTermId')} = e.${q('academicTermId')}
       JOIN ${q('Students')} s ON s.${q('studentId')} = se.${q('studentId')}
       WHERE ar.${q('eventId')} = $1
         AND se.${q('effectiveToUtc')} IS NULL
         AND se.${q('enrollmentStatusCode')} = 'ENROLLED'
         AND s.${q('isActive')} = true
         AND (
           ar.${q('audienceScopeCode')} = 'ALL_STUDENTS'
           OR (ar.${q('audienceScopeCode')} = 'PROGRAM'
             AND se.${q('academicProgramId')} = ar.${q('academicProgramId')})
           OR (ar.${q('audienceScopeCode')} = 'YEAR_LEVEL'
             AND se.${q('yearLevel')} = ar.${q('yearLevel')})
           OR (ar.${q('audienceScopeCode')} = 'PROGRAM_YEAR_LEVEL'
             AND se.${q('academicProgramId')} = ar.${q('academicProgramId')}
             AND se.${q('yearLevel')} = ar.${q('yearLevel')})
           OR (ar.${q('audienceScopeCode')} = 'SECTION'
             AND se.${q('academicProgramId')} = ar.${q('academicProgramId')}
             AND se.${q('yearLevel')} = ar.${q('yearLevel')}
             AND se.${q('sectionId')} = ar.${q('sectionId')})
           OR (ar.${q('audienceScopeCode')} = 'STUDENT'
             AND se.${q('studentId')} = ar.${q('studentId')})
         )
       ORDER BY se.${q('studentId')}, ar.${q('eventAudienceRuleId')}
     )
     INSERT INTO ${q('EventRegistrations')} (
       ${q('eventId')}, ${q('studentEnrollmentId')}, ${q('studentId')},
       ${q('isRequired')}, ${q('sourceAudienceRuleId')}, ${q('registeredByUserId')})
     SELECT $1, ${q('studentEnrollmentId')}, ${q('studentId')}, ${q('isRequired')}, ${q('eventAudienceRuleId')}, $2
     FROM matched
     ON CONFLICT (${q('eventId')}, ${q('studentId')}) DO UPDATE
     SET ${q('isRequired')} = EXCLUDED.${q('isRequired')},
         ${q('sourceAudienceRuleId')} = EXCLUDED.${q('sourceAudienceRuleId')},
         ${q('registrationStatusCode')} = 'ACTIVE'`,
    [eventId, actorUserId],
  );
  return result.rowCount ?? 0;
}

async function registerEventStudents(
  db: Queryable,
  eventId: number,
  actorUserId: number,
  studentIds?: number[],
  sectionId?: number,
): Promise<number> {
  const result = await db.query(
    `INSERT INTO ${q('EventRegistrations')} (
       ${q('eventId')}, ${q('studentEnrollmentId')}, ${q('studentId')}, ${q('registeredByUserId')})
     SELECT $1, se.${q('studentEnrollmentId')}, se.${q('studentId')}, $2
     FROM ${q('Events')} e
     JOIN ${q('StudentEnrollments')} se ON se.${q('academicTermId')} = e.${q('academicTermId')}
     JOIN ${q('Students')} s ON s.${q('studentId')} = se.${q('studentId')}
     WHERE e.${q('eventId')} = $1
       AND se.${q('effectiveToUtc')} IS NULL
       AND se.${q('enrollmentStatusCode')} = 'ENROLLED'
       AND s.${q('isActive')} = true
       AND ($3::bigint[] IS NULL OR se.${q('studentId')} = ANY($3::bigint[]))
       AND ($4::bigint IS NULL OR se.${q('sectionId')} = $4)
     ON CONFLICT (${q('eventId')}, ${q('studentId')}) DO NOTHING`,
    [eventId, actorUserId, studentIds ?? null, sectionId ?? null],
  );
  return result.rowCount ?? 0;
}

async function syncEventSessionParticipants(db: Queryable, eventId: number, actorUserId: number): Promise<number> {
  const result = await db.query(
    `INSERT INTO ${q('EventParticipants')} (
       ${q('eventRegistrationId')}, ${q('eventSessionId')}, ${q('academicTermId')},
       ${q('studentEnrollmentId')}, ${q('studentId')}, ${q('isRequired')}, ${q('addedByUserId')})
     SELECT er.${q('eventRegistrationId')}, es.${q('eventSessionId')},
       e.${q('academicTermId')}, er.${q('studentEnrollmentId')},
       er.${q('studentId')}, er.${q('isRequired')}, $2
     FROM ${q('EventRegistrations')} er
     JOIN ${q('Events')} e ON e.${q('eventId')} = er.${q('eventId')}
     JOIN ${q('EventSessions')} es ON es.${q('eventId')} = e.${q('eventId')}
     WHERE er.${q('eventId')} = $1
       AND er.${q('registrationStatusCode')} = 'ACTIVE'
     ON CONFLICT (${q('eventSessionId')}, ${q('studentId')})
     DO UPDATE SET ${q('eventRegistrationId')} = EXCLUDED.${q('eventRegistrationId')}
     WHERE ${q('EventParticipants')}.${q('eventRegistrationId')} IS NULL`,
    [eventId, actorUserId],
  );
  await db.query(
    `INSERT INTO ${q('AttendanceRecords')} (${q('eventParticipantId')}, ${q('lastChangedByUserId')})
     SELECT ep.${q('eventParticipantId')}, $2
     FROM ${q('EventParticipants')} ep
     JOIN ${q('EventSessions')} es ON es.${q('eventSessionId')} = ep.${q('eventSessionId')}
     WHERE es.${q('eventId')} = $1 AND es.${q('isClosed')} = true
     ON CONFLICT (${q('eventParticipantId')}) DO NOTHING`,
    [eventId, actorUserId],
  );
  return result.rowCount ?? 0;
}

export async function syncRegisteredEventSessions(db: Queryable, eventId: number, actorUserId: number): Promise<number> {
  return syncEventSessionParticipants(db, eventId, actorUserId);
}

export async function countEventParticipants(db: Queryable, eventId: number): Promise<number> {
  const row = await one<{ count: string }>(
    db,
    `SELECT COUNT(*)::text AS count FROM ${q('EventRegistrations')}
     WHERE ${q('eventId')} = $1 AND ${q('registrationStatusCode')} = 'ACTIVE'`,
    [eventId],
  );
  return Number(row?.count ?? 0);
}

export async function listEventParticipantCounts(
  db: Queryable,
  eventIds: number[],
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (eventIds.length === 0) return map;
  const rows = await many<{ event_id: number; count: string }>(
    db,
    `SELECT er.${q('eventId')} AS event_id, COUNT(*)::text AS count
     FROM ${q('EventRegistrations')} er
     WHERE er.${q('eventId')} = ANY($1::bigint[])
       AND er.${q('registrationStatusCode')} = 'ACTIVE'
     GROUP BY er.${q('eventId')}`,
    [eventIds],
  );
  for (const r of rows) {
    map.set(r.event_id, Number(r.count));
  }
  return map;
}

export type EventParticipantRow = {
  student_id: number;
  student_id_code: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  course: string | null;
  year_level: number | null;
  section: string | null;
  added_at: string;
  sessions?: Array<{
    session_id: number;
    session_name: string;
    session_date: string;
    status: string;
    checked_in_at_utc: Date | null;
    checked_out_at_utc: Date | null;
  }>;
};

export async function listEventParticipants(
  db: Queryable,
  eventId: number,
  options: { q?: string; page?: number; limit?: number } = {},
): Promise<{ rows: EventParticipantRow[]; total: number }> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(500, Math.max(1, options.limit ?? 50));
  const offset = (page - 1) * limit;

  const conditions: string[] = [`er.${q('eventId')} = $1`, `er.${q('registrationStatusCode')} = 'ACTIVE'`];
  const params: unknown[] = [eventId];

  if (options.q && options.q.trim()) {
    params.push(`%${options.q.trim().toLowerCase()}%`);
    const idx = params.length;
    conditions.push(`(
      LOWER(s.${q('firstName')}) LIKE $${idx} OR
      LOWER(s.${q('lastName')}) LIKE $${idx} OR
      LOWER(COALESCE(s.${q('middleName')}, '')) LIKE $${idx} OR
      LOWER(COALESCE(s.${q('studentNumber')}, '')) LIKE $${idx} OR
      LOWER(COALESCE(sec.${q('sectionName')}, '')) LIKE $${idx}
    )`);
  }

  const whereClause = conditions.join(' AND ');

  const countRow = await one<{ count: string }>(
    db,
    `SELECT COUNT(*)::text AS count
     FROM ${q('EventRegistrations')} er
     JOIN ${q('Students')} s ON s.${q('studentId')} = er.${q('studentId')}
     LEFT JOIN ${q('StudentEnrollments')} se ON se.${q('studentEnrollmentId')} = er.${q('studentEnrollmentId')}
     LEFT JOIN ${q('Sections')} sec ON sec.${q('sectionId')} = se.${q('sectionId')}
     WHERE ${whereClause}`,
    params,
  );

  const total = Number(countRow?.count ?? 0);

  params.push(limit, offset);
  const limitIdx = params.length - 1;
  const offsetIdx = params.length;

  const rows = await many<EventParticipantRow>(
    db,
    `SELECT DISTINCT ON (s.${q('studentId')})
        s.${q('studentId')} AS student_id,
        s.${q('studentNumber')} AS student_id_code,
        s.${q('firstName')} AS first_name,
        s.${q('middleName')} AS middle_name,
        s.${q('lastName')} AS last_name,
        p.${q('programCode')} AS course,
        se.${q('yearLevel')} AS year_level,
        sec.${q('sectionName')} AS section,
        er.${q('registeredAtUtc')} AS added_at
     FROM ${q('EventRegistrations')} er
     JOIN ${q('Students')} s ON s.${q('studentId')} = er.${q('studentId')}
     LEFT JOIN ${q('StudentEnrollments')} se ON se.${q('studentEnrollmentId')} = er.${q('studentEnrollmentId')}
     LEFT JOIN ${q('AcademicPrograms')} p ON p.${q('academicProgramId')} = se.${q('academicProgramId')}
     LEFT JOIN ${q('Sections')} sec ON sec.${q('sectionId')} = se.${q('sectionId')}
     WHERE ${whereClause}
     ORDER BY s.${q('studentId')}, er.${q('registeredAtUtc')} ASC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params,
  );

  if (rows.length > 0) {
    const sessionRows = await many<{
      student_id: number;
      session_id: number;
      session_name: string;
      session_date: string;
      status: string;
      checked_in_at_utc: Date | null;
      checked_out_at_utc: Date | null;
    }>(
      db,
      `SELECT er.${q('studentId')} AS student_id,
         es.${q('eventSessionId')} AS session_id,
         es.${q('sessionName')} AS session_name,
         es.${q('startsAtUtc')}::date::text AS session_date,
         COALESCE(st.${q('attendanceStatusCode')}, 'PENDING') AS status,
         st.${q('checkedInAtUtc')} AS checked_in_at_utc,
         st.${q('checkedOutAtUtc')} AS checked_out_at_utc
       FROM ${q('EventRegistrations')} er
       JOIN ${q('EventSessions')} es ON es.${q('eventId')} = er.${q('eventId')}
       LEFT JOIN ${q('AttendanceSessionStatus')} st
         ON st.${q('eventSessionId')} = es.${q('eventSessionId')}
         AND st.${q('studentId')} = er.${q('studentId')}
       WHERE er.${q('eventId')} = $1
         AND er.${q('studentId')} = ANY($2::bigint[])
       ORDER BY es.${q('startsAtUtc')}, es.${q('sortOrder')}`,
      [eventId, rows.map((row) => row.student_id)],
    );
    const byStudent = new Map<number, EventParticipantRow['sessions']>();
    for (const session of sessionRows) {
      const current = byStudent.get(session.student_id) ?? [];
      current.push(session);
      byStudent.set(session.student_id, current);
    }
    for (const row of rows) row.sessions = byStudent.get(row.student_id) ?? [];
  }

  return { rows, total };
}

export async function addParticipantsToEvent(
  db: Queryable,
  eventId: number,
  studentIds: number[],
  actorUserId: number,
): Promise<number> {
  if (studentIds.length === 0) return 0;

  for (const sid of studentIds) {
    await getOrCreateEnrollment(db, sid);
  }

  const added = await registerEventStudents(db, eventId, actorUserId, studentIds);
  await syncEventSessionParticipants(db, eventId, actorUserId);
  return added;
}

export async function addSectionToEvent(
  db: Queryable,
  eventId: number,
  sectionId: number,
  actorUserId: number,
): Promise<number> {
  const added = await registerEventStudents(db, eventId, actorUserId, undefined, sectionId);
  await syncEventSessionParticipants(db, eventId, actorUserId);
  return added;
}

export async function removeEventParticipant(
  db: Queryable,
  eventId: number,
  studentId: number,
): Promise<void> {
  await db.query(
    `DELETE FROM ${q('EventParticipantQrCredentials')} c
     USING ${q('EventRegistrations')} er
     WHERE c.${q('eventRegistrationId')} = er.${q('eventRegistrationId')}
       AND er.${q('eventId')} = $1 AND er.${q('studentId')} = $2`,
    [eventId, studentId],
  );
  await ignoreMissingRelation(
    db,
    `DELETE FROM ${q('EventParticipantTokens')}
     WHERE ${q('eventId')} = $1 AND ${q('studentId')} = $2`,
    [eventId, studentId],
  );
  await db.query(
    `DELETE FROM ${q('EventParticipants')} ep
     USING ${q('EventSessions')} es
     WHERE es.${q('eventSessionId')} = ep.${q('eventSessionId')}
       AND es.${q('eventId')} = $1
       AND ep.${q('studentId')} = $2`,
    [eventId, studentId],
  );
  await db.query(
    `DELETE FROM ${q('EventRegistrations')}
     WHERE ${q('eventId')} = $1 AND ${q('studentId')} = $2`,
    [eventId, studentId],
  );
}

// ---------------------------------------------------------------------------
// Event QR credentials - one active UUID QR credential per event registration.
// ---------------------------------------------------------------------------

export type EventParticipantTokenRow = {
  token_id: number;
  event_id: number;
  student_id: number;
  token: string;
  is_revoked: boolean;
  issued_by_user_id: number;
  issued_at_utc: string;
  revoked_at_utc: string | null;
  revoked_by_user_id: number | null;
  /** joined from Students */
  student_id_code: string | null;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  course: string | null;
  year_level: number | null;
  section: string | null;
};

/**
 * Upsert QR credentials for every active registration in the event.
 * Returns the count of newly created credentials.
 */
export async function upsertEventParticipantTokens(
  db: Queryable,
  eventId: number,
  issuedByUserId: number,
): Promise<number> {
  await ignoreMissingRelation(
    db,
    `INSERT INTO ${q('EventParticipantTokens')} (${q('eventId')}, ${q('studentId')}, ${q('issuedByUserId')})
     SELECT er.${q('eventId')}, er.${q('studentId')}, $2::int
     FROM ${q('EventRegistrations')} er
     WHERE er.${q('eventId')} = $1 AND er.${q('registrationStatusCode')} = 'ACTIVE'
     ON CONFLICT (${q('eventId')}, ${q('studentId')}) DO NOTHING`,
    [eventId, issuedByUserId],
  );
  await copyLegacyTokensToQrCredentials(db, eventId);
  const res = await db.query(
    `WITH pending AS (
       SELECT er.${q('eventRegistrationId')}, gen_random_uuid() AS token
       FROM ${q('EventRegistrations')} er
       WHERE er.${q('eventId')} = $1
         AND er.${q('registrationStatusCode')} = 'ACTIVE'
         AND NOT EXISTS (
           SELECT 1 FROM ${q('EventParticipantQrCredentials')} c
           WHERE c.${q('eventRegistrationId')} = er.${q('eventRegistrationId')}
             AND c.${q('revokedAtUtc')} IS NULL
         )
     )
     INSERT INTO ${q('EventParticipantQrCredentials')} (
       ${q('eventRegistrationId')}, token, ${q('tokenHash')}, ${q('issuedByUserId')})
     SELECT ${q('eventRegistrationId')}, token, decode(md5(token::text), 'hex'), $2::int
     FROM pending
     ON CONFLICT DO NOTHING`,
    [eventId, issuedByUserId],
  );
  return res.rowCount ?? 0;
}

async function copyLegacyTokensToQrCredentials(db: Queryable, eventId: number): Promise<void> {
  await ignoreMissingRelation(
    db,
    `INSERT INTO ${q('EventParticipantQrCredentials')} (
       ${q('eventRegistrationId')}, token, ${q('tokenHash')}, ${q('issuedByUserId')}, ${q('issuedAtUtc')})
     SELECT er.${q('eventRegistrationId')}, t.token, decode(md5(t.token::text), 'hex'),
       t.${q('issuedByUserId')}, t.${q('issuedAtUtc')}
     FROM ${q('EventParticipantTokens')} t
     JOIN ${q('EventRegistrations')} er ON er.${q('eventId')} = t.${q('eventId')}
       AND er.${q('studentId')} = t.${q('studentId')}
     WHERE t.${q('eventId')} = $1
       AND t.${q('isRevoked')} = false
       AND er.${q('registrationStatusCode')} = 'ACTIVE'
       AND NOT EXISTS (
         SELECT 1 FROM ${q('EventParticipantQrCredentials')} c
         WHERE c.${q('eventRegistrationId')} = er.${q('eventRegistrationId')}
           AND c.${q('revokedAtUtc')} IS NULL
       )
     ON CONFLICT DO NOTHING`,
    [eventId],
  );
}

/**
 * Upsert a token for a single student in an event.
 * Called automatically when a participant is added.
 */
export async function upsertTokenForStudent(
  db: Queryable,
  eventId: number,
  studentId: number,
  issuedByUserId: number,
): Promise<void> {
  await ignoreMissingRelation(
    db,
    `INSERT INTO ${q('EventParticipantTokens')} (${q('eventId')}, ${q('studentId')}, ${q('issuedByUserId')})
     SELECT ${q('eventId')}, ${q('studentId')}, $3::int
     FROM ${q('EventRegistrations')}
     WHERE ${q('eventId')} = $1 AND ${q('studentId')} = $2
       AND ${q('registrationStatusCode')} = 'ACTIVE'
     ON CONFLICT (${q('eventId')}, ${q('studentId')}) DO NOTHING`,
    [eventId, studentId, issuedByUserId],
  );
  await copyLegacyTokensToQrCredentials(db, eventId);
  await db.query(
    `WITH pending AS (
       SELECT ${q('eventRegistrationId')}, gen_random_uuid() AS token
       FROM ${q('EventRegistrations')} er
       WHERE er.${q('eventId')} = $1
         AND er.${q('studentId')} = $2
         AND er.${q('registrationStatusCode')} = 'ACTIVE'
         AND NOT EXISTS (
           SELECT 1 FROM ${q('EventParticipantQrCredentials')} c
           WHERE c.${q('eventRegistrationId')} = er.${q('eventRegistrationId')}
             AND c.${q('revokedAtUtc')} IS NULL
         )
     )
     INSERT INTO ${q('EventParticipantQrCredentials')} (
       ${q('eventRegistrationId')}, token, ${q('tokenHash')}, ${q('issuedByUserId')})
     SELECT ${q('eventRegistrationId')}, token, decode(md5(token::text), 'hex'), $3::int
     FROM pending
     ON CONFLICT DO NOTHING`,
    [eventId, studentId, issuedByUserId],
  );
}

/**
 * List all tokens for an event, joined with student info.
 */
export async function listEventParticipantTokens(
  db: Queryable,
  eventId: number,
): Promise<EventParticipantTokenRow[]> {
  return many<EventParticipantTokenRow>(
    db,
    `SELECT DISTINCT ON (c.${q('eventParticipantQrCredentialId')})
       c.${q('eventParticipantQrCredentialId')} AS token_id,
       er.${q('eventId')} AS event_id,
       er.${q('studentId')} AS student_id,
       c.token::text AS token,
       (c.${q('revokedAtUtc')} IS NOT NULL) AS is_revoked,
       c.${q('issuedByUserId')} AS issued_by_user_id,
       c.${q('issuedAtUtc')} AS issued_at_utc,
       c.${q('revokedAtUtc')} AS revoked_at_utc,
       c.${q('revokedByUserId')} AS revoked_by_user_id,
       s.${q('studentNumber')} AS student_id_code,
       s.${q('firstName')} AS first_name,
       s.${q('lastName')} AS last_name,
       s.${q('middleName')} AS middle_name,
       p.${q('programCode')} AS course,
       se.${q('yearLevel')} AS year_level,
       sec.${q('sectionName')} AS section
     FROM ${q('EventParticipantQrCredentials')} c
      JOIN ${q('EventRegistrations')} er ON er.${q('eventRegistrationId')} = c.${q('eventRegistrationId')}
      JOIN ${q('Students')} s ON s.${q('studentId')} = er.${q('studentId')}
      JOIN ${q('Events')} ev ON ev.${q('eventId')} = er.${q('eventId')}
      LEFT JOIN ${q('StudentEnrollments')} se
        ON se.${q('studentId')} = er.${q('studentId')}
       AND se.${q('academicTermId')} = ev.${q('academicTermId')}
       AND se.${q('effectiveToUtc')} IS NULL
      LEFT JOIN ${q('AcademicPrograms')} p ON p.${q('academicProgramId')} = se.${q('academicProgramId')}
      LEFT JOIN ${q('Sections')} sec ON sec.${q('sectionId')} = se.${q('sectionId')}
      WHERE er.${q('eventId')} = $1 AND er.${q('registrationStatusCode')} = 'ACTIVE'
      ORDER BY c.${q('eventParticipantQrCredentialId')}, s.${q('lastName')}, s.${q('firstName')}`,
    [eventId],
  );
}

/**
 * Revoke a single token by tokenId. Returns false if not found or already revoked.
 */
export async function revokeEventParticipantToken(
  db: Queryable,
  tokenId: number,
  revokedByUserId: number,
): Promise<boolean> {
  const res = await db.query(
    `UPDATE ${q('EventParticipantQrCredentials')}
     SET ${q('revokedAtUtc')} = clock_timestamp(),
         ${q('revokedByUserId')} = $2,
         ${q('revocationReason')} = 'Revoked by administrator'
     WHERE ${q('eventParticipantQrCredentialId')} = $1
       AND ${q('revokedAtUtc')} IS NULL`,
    [tokenId, revokedByUserId],
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Re-issue a single token (set isRevoked=false, generate new UUID).
 */
export async function reissueEventParticipantToken(
  db: Queryable,
  tokenId: number,
  issuedByUserId: number,
): Promise<string | null> {
  const previous = await one<{ event_id: number }>(
    db,
    `SELECT er.${q('eventId')} AS event_id
     FROM ${q('EventParticipantQrCredentials')} c
     JOIN ${q('EventRegistrations')} er ON er.${q('eventRegistrationId')} = c.${q('eventRegistrationId')}
     WHERE c.${q('eventParticipantQrCredentialId')} = $1`,
    [tokenId],
  );
  if (!previous) return null;
  const res = await db.query(
    `WITH next_token AS (SELECT gen_random_uuid() AS token)
     UPDATE ${q('EventParticipantQrCredentials')} c
     SET token = next_token.token,
         ${q('tokenHash')} = decode(md5(next_token.token::text), 'hex'),
         ${q('issuedByUserId')} = $2,
         ${q('issuedAtUtc')} = clock_timestamp(),
         ${q('revokedAtUtc')} = NULL,
         ${q('revokedByUserId')} = NULL,
         ${q('revocationReason')} = NULL
     FROM next_token
     WHERE c.${q('eventParticipantQrCredentialId')} = $1
     RETURNING c.token::text`,
    [tokenId, issuedByUserId],
  );
  const row = res.rows[0] as { token: string } | undefined;
  if (row?.token) {
    await ignoreMissingRelation(
      db,
      `UPDATE ${q('EventParticipantTokens')} t
       SET token = $2::uuid,
           ${q('isRevoked')} = false,
           ${q('issuedByUserId')} = $3,
           ${q('issuedAtUtc')} = clock_timestamp(),
           ${q('revokedAtUtc')} = NULL,
           ${q('revokedByUserId')} = NULL
       FROM ${q('EventRegistrations')} er, ${q('EventParticipantQrCredentials')} c
       WHERE c.${q('eventParticipantQrCredentialId')} = $1
         AND er.${q('eventRegistrationId')} = c.${q('eventRegistrationId')}
         AND t.${q('eventId')} = er.${q('eventId')}
         AND t.${q('studentId')} = er.${q('studentId')}`,
      [tokenId, row.token, issuedByUserId],
    );
  }
  return row?.token ?? null;
}

/**
 * Look up a token by UUID for scan verification. Returns null if not found or revoked.
 */
export async function getEventParticipantByToken(
  db: Queryable,
  token: string,
  eventId: number,
): Promise<{ student_id: number; student_id_code: string | null; event_participant_id: number } | null> {
  return one(
    db,
    `SELECT
       er.${q('studentId')} AS student_id,
       s.${q('studentNumber')} AS student_id_code,
       ep.${q('eventParticipantId')} AS event_participant_id
      FROM ${q('EventParticipantQrCredentials')} c
      JOIN ${q('EventRegistrations')} er ON er.${q('eventRegistrationId')} = c.${q('eventRegistrationId')}
      JOIN ${q('Students')} s ON s.${q('studentId')} = er.${q('studentId')}
      JOIN ${q('EventParticipants')} ep ON ep.${q('eventRegistrationId')} = er.${q('eventRegistrationId')}
      JOIN ${q('EventSessions')} es ON es.${q('eventSessionId')} = ep.${q('eventSessionId')}
      WHERE c.token = $1::uuid
        AND er.${q('eventId')} = $2
        AND er.${q('registrationStatusCode')} = 'ACTIVE'
        AND c.${q('revokedAtUtc')} IS NULL
       AND (c.${q('expiresAtUtc')} IS NULL OR c.${q('expiresAtUtc')} > clock_timestamp())
       AND es.${q('eventId')} = $2
     LIMIT 1`,
    [token, eventId],
  );
}

export async function getRegisteredSessionParticipant(
  db: Queryable,
  eventId: number,
  studentId: number,
  sessionId: number,
): Promise<{ event_participant_id: number } | null> {
  return one(
    db,
    `SELECT ep.${q('eventParticipantId')} AS event_participant_id
     FROM ${q('EventRegistrations')} er
     JOIN ${q('EventParticipants')} ep
       ON ep.${q('eventRegistrationId')} = er.${q('eventRegistrationId')}
     JOIN ${q('EventSessions')} es ON es.${q('eventSessionId')} = ep.${q('eventSessionId')}
     WHERE er.${q('eventId')} = $1 AND er.${q('studentId')} = $2
       AND es.${q('eventSessionId')} = $3
       AND er.${q('registrationStatusCode')} = 'ACTIVE'`,
    [eventId, studentId, sessionId],
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
  await upsertEventParticipantTokens(db, eventId, actorUserId);
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
  try {
    await db.query(
      `UPDATE ${q('EventFinePolicies')}
       SET ${q('policyStatusCode')} = 'ACTIVE',
           ${q('activatedAtUtc')} = COALESCE(${q('activatedAtUtc')}, clock_timestamp())
       WHERE ${q('eventId')} = $1 AND ${q('policyStatusCode')} = 'DRAFT'`,
      [eventId],
    );
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
    if (code !== '42P01') throw err;
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

function pgErrCode(err: unknown): string {
  return err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
}

/** Ignore missing tables/columns/triggers so wipe works on both schema.ts and the SQL install. */
async function ignoreMissingRelation(db: Queryable, sql: string, values: unknown[] = []): Promise<void> {
  try {
    await db.query(sql, values);
  } catch (err) {
    const code = pgErrCode(err);
    if (code !== '42P01' && code !== '42703' && code !== '42704') throw err;
  }
}

export async function deleteEvent(db: Queryable, id: number): Promise<void> {
  const sessions = `SELECT ${q('eventSessionId')} FROM ${q('EventSessions')} WHERE ${q('eventId')} = $1`;
  const participants = `SELECT ep.${q('eventParticipantId')} FROM ${q('EventParticipants')} ep
     JOIN ${q('EventSessions')} es ON es.${q('eventSessionId')} = ep.${q('eventSessionId')}
     WHERE es.${q('eventId')} = $1`;
  const records = `SELECT ar.${q('attendanceRecordId')} FROM ${q('AttendanceRecords')} ar
     WHERE ar.${q('eventParticipantId')} IN (${participants})`;
  const assessments = `SELECT s.${q('studentFineAssessmentId')} FROM ${q('StudentFineAssessments')} s
     WHERE s.${q('eventSessionId')} IN (${sessions})`;
  const rules = `SELECT ${q('eventFineRuleId')} FROM ${q('EventFineRules')} WHERE ${q('eventId')} = $1`;
  const registrations = `SELECT ${q('eventRegistrationId')} FROM ${q('EventRegistrations')} WHERE ${q('eventId')} = $1`;

  await ignoreMissingRelation(
    db,
    `ALTER TABLE ${q('AttendanceLogs')} DISABLE TRIGGER USER`,
  );
  try {
    await ignoreMissingRelation(
      db,
      `DELETE FROM ${q('EventFineRuleOverrides')} WHERE ${q('eventFineRuleId')} IN (${rules})`,
      [id],
    );
    await ignoreMissingRelation(db, `DELETE FROM ${q('EventFineRules')} WHERE ${q('eventId')} = $1`, [id]);
    await ignoreMissingRelation(db, `DELETE FROM ${q('EventFinePolicies')} WHERE ${q('eventId')} = $1`, [id]);
    await ignoreMissingRelation(
      db,
      `DELETE FROM ${q('FinePaymentAllocations')} WHERE ${q('studentFineAssessmentId')} IN (${assessments})`,
      [id],
    );
    await ignoreMissingRelation(
      db,
      `DELETE FROM ${q('FineWaiverRequests')} WHERE ${q('studentFineAssessmentId')} IN (${assessments})`,
      [id],
    );
    await ignoreMissingRelation(
      db,
      `DELETE FROM ${q('StudentFineStatusHistory')} WHERE ${q('studentFineAssessmentId')} IN (${assessments})`,
      [id],
    );
    await ignoreMissingRelation(
      db,
      `DELETE FROM ${q('StudentFineAssessments')} WHERE ${q('eventSessionId')} IN (${sessions})`,
      [id],
    );
    await ignoreMissingRelation(
      db,
      `DELETE FROM ${q('AttendanceScanAttempts')} WHERE ${q('eventSessionId')} IN (${sessions})`,
      [id],
    );
    await ignoreMissingRelation(
      db,
      `DELETE FROM ${q('AttendanceLogs')} WHERE ${q('attendanceRecordId')} IN (${records})`,
      [id],
    );
    await ignoreMissingRelation(
      db,
      `DELETE FROM ${q('AttendanceCorrections')} WHERE ${q('attendanceRecordId')} IN (${records})`,
      [id],
    );
    await ignoreMissingRelation(
      db,
      `DELETE FROM ${q('AttendanceRecords')} WHERE ${q('eventParticipantId')} IN (${participants})`,
      [id],
    );
    await ignoreMissingRelation(
      db,
      `DELETE FROM ${q('EventParticipantQrCredentials')} WHERE ${q('eventRegistrationId')} IN (${registrations})`,
      [id],
    );
    await ignoreMissingRelation(
      db,
      `DELETE FROM ${q('EventParticipants')} WHERE ${q('eventSessionId')} IN (${sessions})`,
      [id],
    );
    await ignoreMissingRelation(db, `DELETE FROM ${q('EventRegistrations')} WHERE ${q('eventId')} = $1`, [id]);
    await ignoreMissingRelation(db, `DELETE FROM ${q('EventAudienceRules')} WHERE ${q('eventId')} = $1`, [id]);
    await ignoreMissingRelation(db, `DELETE FROM ${q('EventSessions')} WHERE ${q('eventId')} = $1`, [id]);
    await db.query(`DELETE FROM ${q('Events')} WHERE ${q('eventId')} = $1`, [id]);
  } finally {
    await ignoreMissingRelation(db, `ALTER TABLE ${q('AttendanceLogs')} ENABLE TRIGGER USER`);
  }
}

export async function deactivateEvent(db: Queryable, id: number): Promise<void> {
  await db.query(
    `UPDATE ${q('EventSessions')} SET ${q('isClosed')} = TRUE WHERE ${q('eventId')} = $1`,
    [id],
  );
  await db.query(
    `INSERT INTO ${q('AttendanceRecords')} (${q('eventParticipantId')}, ${q('lastChangedByUserId')})
     SELECT ep.${q('eventParticipantId')}, e.${q('createdByUserId')}
     FROM ${q('EventParticipants')} ep
     JOIN ${q('EventSessions')} es ON es.${q('eventSessionId')} = ep.${q('eventSessionId')}
     JOIN ${q('Events')} e ON e.${q('eventId')} = es.${q('eventId')}
     WHERE e.${q('eventId')} = $1
     ON CONFLICT (${q('eventParticipantId')}) DO NOTHING`,
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
    late_after_utc?: Date | null;
    check_in_closes_at_utc?: Date | null;
    check_out_opens_at_utc?: Date | null;
    check_out_closes_at_utc?: Date | null;
    requires_check_out?: boolean;
    is_closed?: boolean;
    sort_order: number;
  }>(
    db,
    `SELECT ${q('eventSessionId')} AS event_session_id, ${q('eventId')} AS event_id, ${q('sessionName')} AS session_name,
            ${q('startsAtUtc')} AS starts_at_utc, ${q('endsAtUtc')} AS ends_at_utc,
            ${q('lateAfterUtc')} AS late_after_utc, ${q('checkInClosesAtUtc')} AS check_in_closes_at_utc,
            ${q('checkOutOpensAtUtc')} AS check_out_opens_at_utc, ${q('checkOutClosesAtUtc')} AS check_out_closes_at_utc,
            ${q('requiresCheckOut')} AS requires_check_out, ${q('isClosed')} AS is_closed,
            ${q('sortOrder')} AS sort_order
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
    late_after_utc?: Date | null;
    check_in_closes_at_utc?: Date | null;
    check_out_opens_at_utc?: Date | null;
    check_out_closes_at_utc?: Date | null;
    requires_check_out?: boolean;
    is_closed?: boolean;
    sort_order: number;
  }>(
    db,
    `SELECT ${q('eventSessionId')} AS event_session_id, ${q('eventId')} AS event_id, ${q('sessionName')} AS session_name,
            ${q('startsAtUtc')} AS starts_at_utc, ${q('endsAtUtc')} AS ends_at_utc,
            ${q('lateAfterUtc')} AS late_after_utc, ${q('checkInClosesAtUtc')} AS check_in_closes_at_utc,
            ${q('checkOutOpensAtUtc')} AS check_out_opens_at_utc, ${q('checkOutClosesAtUtc')} AS check_out_closes_at_utc,
            ${q('requiresCheckOut')} AS requires_check_out, ${q('isClosed')} AS is_closed,
            ${q('sortOrder')} AS sort_order
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
    late_after_utc?: Date | null;
    check_in_closes_at_utc?: Date | null;
    check_out_opens_at_utc?: Date | null;
    check_out_closes_at_utc?: Date | null;
    requires_check_out?: boolean;
    is_closed?: boolean;
    sort_order: number;
  }>(
    db,
    `SELECT ${q('eventSessionId')} AS event_session_id, ${q('eventId')} AS event_id, ${q('sessionName')} AS session_name,
            ${q('startsAtUtc')} AS starts_at_utc, ${q('endsAtUtc')} AS ends_at_utc,
            ${q('lateAfterUtc')} AS late_after_utc, ${q('checkInClosesAtUtc')} AS check_in_closes_at_utc,
            ${q('checkOutOpensAtUtc')} AS check_out_opens_at_utc, ${q('checkOutClosesAtUtc')} AS check_out_closes_at_utc,
            ${q('requiresCheckOut')} AS requires_check_out, ${q('isClosed')} AS is_closed,
            ${q('sortOrder')} AS sort_order
     FROM ${q('EventSessions')} WHERE ${q('eventSessionId')} = $1`,
    [id],
  );
  return row ? toWindow(row) : null;
}

function sessionTypeFromLabel(label: string): string {
  const n = label.trim().toLowerCase();
  if (n === 'am' || /\b(am|morning)\b/.test(n)) return 'AM';
  if (n === 'pm' || /\b(pm|afternoon)\b/.test(n)) return 'PM';
  return 'GENERAL';
}

export async function insertWindow(
  db: Queryable,
  row: {
    eventId: number;
    sessionDate?: Date;
    sessionLabel: string;
    startTime: string;
    endTime: string;
    lateAfter?: string | null;
    inEnd?: string | null;
    outStart?: string | null;
    outEnd?: string | null;
    sortOrder: number;
  },
): Promise<SessionWindowRow> {
  const event = await getEventById(db, row.eventId);
  if (!event) throw new Error('Event not found');
  const termId = await eventTermId(db, row.eventId);
  const bounds = sessionBounds(
    row.sessionDate ?? event.event_date,
    row.startTime,
    row.endTime,
    row.lateAfter,
    row.inEnd,
    row.outStart,
    row.outEnd,
  );
  const baseCode = `${slugCode(row.sessionLabel, 20)}-${row.sortOrder}`.slice(0, 24);
  let code = baseCode;
  let counter = 1;
  while (true) {
    const existingCode = await one<{ event_session_id: number }>(
      db,
      `SELECT ${q('eventSessionId')} AS event_session_id FROM ${q('EventSessions')}
       WHERE ${q('eventId')} = $1 AND ${q('sessionCode')} = $2`,
      [row.eventId, code],
    );
    if (!existingCode) break;
    code = `${baseCode}-${counter++}`.slice(0, 30);
  }
  const created = await one<{ event_session_id: number }>(
    db,
    `INSERT INTO ${q('EventSessions')} (
        ${q('eventId')}, ${q('academicTermId')}, ${q('sessionCode')}, ${q('sessionName')}, ${q('sessionTypeCode')},
        ${q('startsAtUtc')}, ${q('endsAtUtc')}, ${q('checkInOpensAtUtc')}, ${q('checkInClosesAtUtc')},
        ${q('lateAfterUtc')}, ${q('checkOutOpensAtUtc')}, ${q('checkOutClosesAtUtc')},
        ${q('requiresCheckOut')}, ${q('sortOrder')}
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,$13)
     RETURNING ${q('eventSessionId')} AS event_session_id`,
    [
      row.eventId,
      termId,
      code,
      row.sessionLabel,
      sessionTypeFromLabel(row.sessionLabel),
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
    sessionDate?: Date;
    startTime: string;
    endTime: string;
    lateAfter?: string | null;
    inEnd?: string | null;
    outStart?: string | null;
    outEnd?: string | null;
    sortOrder?: number;
  },
): Promise<SessionWindowRow> {
  const existing = await getWindowById(db, id);
  if (!existing) throw new Error('Session not found');
  const event = await getEventById(db, existing.event_id);
  if (!event) throw new Error('Event not found');
  const bounds = sessionBounds(
    fields.sessionDate ?? (existing.session_date ? new Date(`${existing.session_date}T00:00:00`) : event.event_date),
    fields.startTime,
    fields.endTime,
    fields.lateAfter !== undefined ? fields.lateAfter : existing.late_after,
    fields.inEnd !== undefined ? fields.inEnd : existing.in_end,
    fields.outStart !== undefined ? fields.outStart : existing.out_start,
    fields.outEnd !== undefined ? fields.outEnd : existing.out_end,
  );
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
    sets.push(`${q('sessionTypeCode')} = $${i++}`);
    values.push(sessionTypeFromLabel(fields.sessionLabel));
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
  const sessionRules = `SELECT ${q('eventFineRuleId')} FROM ${q('EventFineRules')} WHERE ${q('eventSessionId')} = $1`;
  const participants = `SELECT ${q('eventParticipantId')} FROM ${q('EventParticipants')} WHERE ${q('eventSessionId')} = $1`;
  const records = `SELECT ${q('attendanceRecordId')} FROM ${q('AttendanceRecords')} WHERE ${q('eventParticipantId')} IN (${participants})`;
  const assessments = `SELECT ${q('studentFineAssessmentId')} FROM ${q('StudentFineAssessments')} WHERE ${q('eventSessionId')} = $1`;

  await ignoreMissingRelation(
    db,
    `DELETE FROM ${q('EventFineRuleOverrides')} WHERE ${q('eventFineRuleId')} IN (${sessionRules})`,
    [id],
  );
  await ignoreMissingRelation(db, `DELETE FROM ${q('EventFineRules')} WHERE ${q('eventSessionId')} = $1`, [id]);
  await ignoreMissingRelation(
    db,
    `DELETE FROM ${q('FinePaymentAllocations')} WHERE ${q('studentFineAssessmentId')} IN (${assessments})`,
    [id],
  );
  await ignoreMissingRelation(
    db,
    `DELETE FROM ${q('FineWaiverRequests')} WHERE ${q('studentFineAssessmentId')} IN (${assessments})`,
    [id],
  );
  await ignoreMissingRelation(
    db,
    `DELETE FROM ${q('StudentFineStatusHistory')} WHERE ${q('studentFineAssessmentId')} IN (${assessments})`,
    [id],
  );
  await ignoreMissingRelation(
    db,
    `DELETE FROM ${q('StudentFineAssessments')} WHERE ${q('eventSessionId')} = $1`,
    [id],
  );
  await ignoreMissingRelation(
    db,
    `DELETE FROM ${q('AttendanceScanAttempts')} WHERE ${q('eventSessionId')} = $1`,
    [id],
  );
  await ignoreMissingRelation(
    db,
    `DELETE FROM ${q('AttendanceLogs')} WHERE ${q('attendanceRecordId')} IN (${records})`,
    [id],
  );
  await ignoreMissingRelation(
    db,
    `DELETE FROM ${q('AttendanceCorrections')} WHERE ${q('attendanceRecordId')} IN (${records})`,
    [id],
  );
  await ignoreMissingRelation(
    db,
    `DELETE FROM ${q('AttendanceRecords')} WHERE ${q('eventParticipantId')} IN (${participants})`,
    [id],
  );
  await ignoreMissingRelation(
    db,
    `DELETE FROM ${q('EventParticipants')} WHERE ${q('eventSessionId')} = $1`,
    [id],
  );
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
  const participant = await getRegisteredSessionParticipant(
    db, args.eventId, args.studentId, args.sessionWindowId,
  );
  if (!participant) throw conflict('Student is not registered for this session');
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

export async function listFineTemplates(
  db: Queryable,
  opts: { includeInactive?: boolean; publishedOnly?: boolean } = {},
): Promise<any[]> {
  const includeInactive = opts.includeInactive === true;
  const publishedOnly = opts.publishedOnly ?? !includeInactive;
  const templates = await many<{
    template_id: number;
    template_code: string;
    template_name: string;
    description: string | null;
    is_active: boolean;
    version_id: number | null;
    version_number: number | null;
    version_status_code: string | null;
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
       v.${q('versionStatusCode')} AS version_status_code,
       v.${q('currencyCode')} AS currency_code,
       v.${q('maximumFinePerStudent')} AS max_fine_per_student
     FROM ${q('FinePolicyTemplates')} t
     LEFT JOIN LATERAL (
       SELECT * FROM ${q('FinePolicyTemplateVersions')} pv
       WHERE pv.${q('finePolicyTemplateId')} = t.${q('finePolicyTemplateId')}
         ${publishedOnly ? `AND pv.${q('versionStatusCode')} = 'PUBLISHED'` : ''}
       ORDER BY pv.${q('versionNumber')} DESC
       LIMIT 1
     ) v ON TRUE
     ${includeInactive ? '' : `WHERE t.${q('isActive')} = TRUE`}
     ORDER BY t.${q('templateName')}`,
  );

  return hydrateFineTemplates(db, templates);
}

export async function getFineTemplateById(db: Queryable, templateId: number): Promise<any | null> {
  const rows = await listFineTemplates(db, { includeInactive: true, publishedOnly: false });
  return rows.find((t) => t.template_id === templateId) ?? null;
}

export async function setFineTemplateActive(
  db: Queryable,
  templateId: number,
  isActive: boolean,
): Promise<any | null> {
  await db.query(
    `UPDATE ${q('FinePolicyTemplates')}
     SET ${q('isActive')} = $2, ${q('updatedAtUtc')} = clock_timestamp()
     WHERE ${q('finePolicyTemplateId')} = $1`,
    [templateId, isActive],
  );
  return getFineTemplateById(db, templateId);
}

async function hydrateFineTemplates(
  db: Queryable,
  templates: Array<{
    template_id: number;
    template_code: string;
    template_name: string;
    description: string | null;
    is_active: boolean;
    version_id: number | null;
    version_number: number | null;
    version_status_code?: string | null;
    currency_code: string | null;
    max_fine_per_student: number | null;
  }>,
): Promise<any[]> {
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
       ORDER BY ${q('priorityOrder')}, ${q('sessionTypeCode')}, ${q('violationCode')}`,
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
          version_status_code: t.version_status_code ?? null,
          currency_code: t.currency_code,
          max_fine_per_student: t.max_fine_per_student != null ? Number(t.max_fine_per_student) : null,
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

export async function latestPublishedTemplateVersionId(
  db: Queryable,
  templateId: number,
): Promise<number | null> {
  const row = await one<{ version_id: number }>(
    db,
    `SELECT v.${q('finePolicyTemplateVersionId')} AS version_id
     FROM ${q('FinePolicyTemplateVersions')} v
     JOIN ${q('FinePolicyTemplates')} t
       ON t.${q('finePolicyTemplateId')} = v.${q('finePolicyTemplateId')}
     WHERE t.${q('finePolicyTemplateId')} = $1
       AND t.${q('isActive')} = TRUE
       AND v.${q('versionStatusCode')} = 'PUBLISHED'
     ORDER BY v.${q('versionNumber')} DESC
     LIMIT 1`,
    [templateId],
  );
  return row?.version_id ?? null;
}

export type EventFineSummary = {
  policy_id: number;
  policy_name: string;
  template_id: number | null;
  template_name: string | null;
  version_id: number | null;
  max_fine_per_student: number | null;
};

export async function listEventFineSummaries(
  db: Queryable,
  eventIds?: number[],
): Promise<Map<number, EventFineSummary>> {
  const map = new Map<number, EventFineSummary>();
  let rows: Array<{
    event_id: number;
    policy_id: number;
    policy_name: string;
    template_id: number | null;
    template_name: string | null;
    version_id: number | null;
    max_fine: number | null;
  }>;
  try {
    rows = await many(
      db,
      `SELECT
         p.${q('eventId')} AS event_id,
         p.${q('eventFinePolicyId')} AS policy_id,
         p.${q('policyName')} AS policy_name,
         t.${q('finePolicyTemplateId')} AS template_id,
         t.${q('templateName')} AS template_name,
         v.${q('finePolicyTemplateVersionId')} AS version_id,
         p.${q('maximumFinePerStudent')} AS max_fine
       FROM ${q('EventFinePolicies')} p
       LEFT JOIN ${q('FinePolicyTemplateVersions')} v
         ON v.${q('finePolicyTemplateVersionId')} = p.${q('sourceFinePolicyTemplateVersionId')}
       LEFT JOIN ${q('FinePolicyTemplates')} t
         ON t.${q('finePolicyTemplateId')} = v.${q('finePolicyTemplateId')}
       ${eventIds && eventIds.length > 0 ? `WHERE p.${q('eventId')} = ANY($1::bigint[])` : ''}`,
      eventIds && eventIds.length > 0 ? [eventIds] : [],
    );
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
    if (code === '42P01') return map;
    throw err;
  }
  for (const row of rows) {
    map.set(row.event_id, {
      policy_id: row.policy_id,
      policy_name: row.policy_name,
      template_id: row.template_id,
      template_name: row.template_name,
      version_id: row.version_id,
      max_fine_per_student: row.max_fine != null ? Number(row.max_fine) : null,
    });
  }
  return map;
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
  const version = await one<{
    version_id: number;
    currency_code: string;
    max_fine: number | null;
  }>(
    db,
    `SELECT
       v.${q('finePolicyTemplateVersionId')} AS version_id,
       v.${q('currencyCode')} AS currency_code,
       v.${q('maximumFinePerStudent')} AS max_fine
     FROM ${q('FinePolicyTemplateVersions')} v
     WHERE v.${q('finePolicyTemplateVersionId')} = $1
       AND v.${q('versionStatusCode')} = 'PUBLISHED'`,
    [params.templateVersionId],
  );
  if (!version) throw badRequest('Published template version was not found.');

  const status = await eventStatusCode(db, params.eventId);
  const policyStatus = status === 'PUBLISHED' ? 'ACTIVE' : 'DRAFT';

  const policy = await one<{ policy_id: number }>(
    db,
    `INSERT INTO ${q('EventFinePolicies')} (
       ${q('eventId')}, ${q('sourceFinePolicyTemplateVersionId')},
       ${q('policyCode')}, ${q('policyName')}, ${q('currencyCode')},
       ${q('maximumFinePerStudent')}, ${q('policyStatusCode')}, ${q('createdByUserId')},
       ${q('activatedAtUtc')}
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (${q('eventId')}) DO UPDATE SET
       ${q('sourceFinePolicyTemplateVersionId')} = EXCLUDED.${q('sourceFinePolicyTemplateVersionId')},
       ${q('policyCode')} = EXCLUDED.${q('policyCode')},
       ${q('policyName')} = EXCLUDED.${q('policyName')},
       ${q('currencyCode')} = EXCLUDED.${q('currencyCode')},
       ${q('maximumFinePerStudent')} = EXCLUDED.${q('maximumFinePerStudent')},
       ${q('policyStatusCode')} = EXCLUDED.${q('policyStatusCode')},
       ${q('activatedAtUtc')} = CASE
         WHEN EXCLUDED.${q('policyStatusCode')} = 'ACTIVE'
         THEN COALESCE(${q('EventFinePolicies')}.${q('activatedAtUtc')}, clock_timestamp())
         ELSE ${q('EventFinePolicies')}.${q('activatedAtUtc')}
       END
     RETURNING ${q('eventFinePolicyId')} AS policy_id`,
    [
      params.eventId,
      params.templateVersionId,
      params.policyCode,
      params.policyName,
      version.currency_code,
      version.max_fine,
      policyStatus,
      params.actorUserId,
      policyStatus === 'ACTIVE' ? new Date() : null,
    ],
  );

  const policyId = policy!.policy_id;
  await db.query(
    `UPDATE ${q('EventFineRules')} SET ${q('isActive')} = FALSE WHERE ${q('eventFinePolicyId')} = $1`,
    [policyId],
  );

  await db.query(
    `WITH candidate_rules AS (
       SELECT
         s.${q('eventSessionId')} AS session_id,
         r.${q('finePolicyTemplateRuleId')} AS source_rule_id,
         r.${q('violationCode')} AS violation_code,
         r.${q('fineAmount')} AS fine_amount,
         r.${q('priorityOrder')} AS priority_order,
         ROW_NUMBER() OVER (
           PARTITION BY s.${q('eventSessionId')}, r.${q('violationCode')}
           ORDER BY CASE WHEN r.${q('sessionTypeCode')} = s.${q('sessionTypeCode')} THEN 0 ELSE 1 END,
                    r.${q('priorityOrder')}
         ) AS choice_order
       FROM ${q('EventSessions')} s
       JOIN ${q('FinePolicyTemplateRules')} r
         ON r.${q('finePolicyTemplateVersionId')} = $2
        AND r.${q('isActive')} = TRUE
        AND r.${q('sessionTypeCode')} IN ('GENERAL', s.${q('sessionTypeCode')})
       WHERE s.${q('eventId')} = $3
     )
     INSERT INTO ${q('EventFineRules')} (
       ${q('eventFinePolicyId')}, ${q('eventId')}, ${q('eventSessionId')},
       ${q('sourceFinePolicyTemplateRuleId')}, ${q('violationCode')}, ${q('fineAmount')},
       ${q('priorityOrder')}, ${q('isActive')}
     )
     SELECT $1, $3, c.session_id, c.source_rule_id, c.violation_code, c.fine_amount, c.priority_order, TRUE
     FROM candidate_rules c
     WHERE c.choice_order = 1
     ON CONFLICT (${q('eventFinePolicyId')}, ${q('eventSessionId')}, ${q('violationCode')})
     DO UPDATE SET
       ${q('fineAmount')} = EXCLUDED.${q('fineAmount')},
       ${q('priorityOrder')} = EXCLUDED.${q('priorityOrder')},
       ${q('sourceFinePolicyTemplateRuleId')} = EXCLUDED.${q('sourceFinePolicyTemplateRuleId')},
       ${q('isActive')} = TRUE`,
    [policyId, params.templateVersionId, params.eventId],
  );

  return policyId;
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
  audienceScopeCode: EventAudienceScopeCode;
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
  const publishedAt = params.publish ? new Date() : null;

  const verRow = await one<{ version_id: number }>(
    db,
    `INSERT INTO ${q('FinePolicyTemplateVersions')} (
       ${q('finePolicyTemplateId')}, ${q('versionNumber')}, ${q('versionStatusCode')},
       ${q('currencyCode')}, ${q('maximumFinePerStudent')}, ${q('createdByUserId')}, ${q('publishedAtUtc')}
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (${q('finePolicyTemplateId')}, ${q('versionNumber')}) DO UPDATE
     SET ${q('versionStatusCode')} = EXCLUDED.${q('versionStatusCode')},
         ${q('maximumFinePerStudent')} = EXCLUDED.${q('maximumFinePerStudent')},
         ${q('publishedAtUtc')} = COALESCE(EXCLUDED.${q('publishedAtUtc')}, ${q('FinePolicyTemplateVersions')}.${q('publishedAtUtc')})
     RETURNING ${q('finePolicyTemplateVersionId')} AS version_id`,
    [templateId, verNum, status, currency, params.maximumFinePerStudent ?? null, params.actorUserId, publishedAt],
  );
  const versionId = verRow!.version_id;

  await db.query(
    `UPDATE ${q('FinePolicyTemplateRules')}
     SET ${q('isActive')} = FALSE
     WHERE ${q('finePolicyTemplateVersionId')} = $1`,
    [versionId],
  );

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
  await ensureEventRoster(db, eventId, actorUserId);
  await db.query(
    `UPDATE ${q('EventParticipants')} ep
     SET ${q('eventRegistrationId')} = er.${q('eventRegistrationId')}
     FROM ${q('EventSessions')} es, ${q('EventRegistrations')} er
     WHERE es.${q('eventSessionId')} = ep.${q('eventSessionId')}
       AND er.${q('eventId')} = es.${q('eventId')}
       AND er.${q('studentId')} = ep.${q('studentId')}
       AND es.${q('eventId')} = $1
       AND ep.${q('eventRegistrationId')} IS NULL`,
    [eventId],
  );
  await upsertEventParticipantTokens(db, eventId, actorUserId);
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
    `INSERT INTO ${q('AttendanceRecords')} (${q('eventParticipantId')}, ${q('lastChangedByUserId')})
     SELECT ep.${q('eventParticipantId')}, $2
     FROM ${q('EventParticipants')} ep
     WHERE ep.${q('eventSessionId')} = $1
     ON CONFLICT (${q('eventParticipantId')}) DO NOTHING`,
    [sessionId, actorUserId],
  );
  const procedure = await one<{ available: string | null }>(
    db,
    `SELECT to_regprocedure('ssc.sp_student_fine_assess_closed_session(bigint,integer,integer,numeric)')::text AS available`,
  );
  const fineTables = await one<{ policy: string | null; assessments: string | null }>(
    db,
    `SELECT to_regclass('"EventFinePolicies"')::text AS policy,
       to_regclass('"StudentFineAssessments"')::text AS assessments`,
  );
  const finePolicy = fineTables?.policy ? await one<{ active: boolean }>(
    db,
    `SELECT EXISTS (
       SELECT 1 FROM ${q('EventFinePolicies')} p
       JOIN ${q('EventSessions')} s ON s.${q('eventId')} = p.${q('eventId')}
       WHERE s.${q('eventSessionId')} = $1 AND p.${q('policyStatusCode')} = 'ACTIVE'
     ) AS active`,
    [sessionId],
  ) : null;
  if (procedure?.available && finePolicy?.active) {
    await db.query(`CALL ssc.sp_student_fine_assess_closed_session($1, $2, 0, 0)`, [sessionId, actorUserId]);
  }
  const totals = fineTables?.assessments ? await one<{ count: number; total: number }>(
    db,
    `SELECT COUNT(*)::int AS count, COALESCE(SUM(${q('assessedAmount')}), 0.00)::numeric AS total
     FROM ${q('StudentFineAssessments')}
     WHERE ${q('eventSessionId')} = $1`,
    [sessionId],
  ) : null;
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

// --- Sections & Student Roster Breakdown ---

export async function listSections(
  db: Queryable,
  filters: { termId?: number; programId?: number; search?: string } = {},
): Promise<any[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (filters.termId != null) {
    conditions.push(`sec.${q('academicTermId')} = $${i++}`);
    values.push(filters.termId);
  }
  if (filters.programId != null) {
    conditions.push(`sec.${q('academicProgramId')} = $${i++}`);
    values.push(filters.programId);
  }
  if (filters.search) {
    conditions.push(
      `(LOWER(sec.${q('sectionCode')}) LIKE $${i} OR LOWER(sec.${q('sectionName')}) LIKE $${i} OR LOWER(p.${q('programCode')}) LIKE $${i})`,
    );
    values.push(`%${filters.search.toLowerCase()}%`);
    i++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return many<any>(
    db,
    `SELECT
       sec.${q('sectionId')} AS section_id,
       sec.${q('sectionCode')} AS section_code,
       sec.${q('sectionName')} AS section_name,
       sec.${q('yearLevel')} AS year_level,
       sec.${q('academicTermId')} AS academic_term_id,
       t.${q('termCode')} AS term_code,
       t.${q('termName')} AS term_name,
       ay.${q('academicYearId')} AS academic_year_id,
       ay.${q('yearCode')} AS year_code,
       ay.${q('yearName')} AS year_name,
       sec.${q('academicProgramId')} AS academic_program_id,
       p.${q('programCode')} AS program_code,
       p.${q('programName')} AS program_name,
       COUNT(e.${q('studentEnrollmentId')})::int AS enrolled_student_count
     FROM ${q('Sections')} sec
     JOIN ${q('AcademicPrograms')} p ON p.${q('academicProgramId')} = sec.${q('academicProgramId')}
     JOIN ${q('AcademicTerms')} t ON t.${q('academicTermId')} = sec.${q('academicTermId')}
     JOIN ${q('AcademicYears')} ay ON ay.${q('academicYearId')} = t.${q('academicYearId')}
     LEFT JOIN ${q('StudentEnrollments')} e ON e.${q('sectionId')} = sec.${q('sectionId')} AND e.${q('effectiveToUtc')} IS NULL
     ${where}
     GROUP BY sec.${q('sectionId')}, t.${q('academicTermId')}, ay.${q('academicYearId')}, p.${q('academicProgramId')}
     ORDER BY ay.${q('yearCode')} DESC, p.${q('programCode')}, sec.${q('yearLevel')}, sec.${q('sectionCode')}`,
    values,
  );
}

export async function getSectionStudentBreakdown(
  db: Queryable,
  sectionId: number,
): Promise<any | null> {
  const section = await one<any>(
    db,
    `SELECT
       sec.${q('sectionId')} AS section_id,
       sec.${q('sectionCode')} AS section_code,
       sec.${q('sectionName')} AS section_name,
       sec.${q('yearLevel')} AS year_level,
       sec.${q('academicTermId')} AS academic_term_id,
       t.${q('termCode')} AS term_code,
       t.${q('termName')} AS term_name,
       ay.${q('academicYearId')} AS academic_year_id,
       ay.${q('yearCode')} AS year_code,
       ay.${q('yearName')} AS year_name,
       sec.${q('academicProgramId')} AS academic_program_id,
       p.${q('programCode')} AS program_code,
       p.${q('programName')} AS program_name
     FROM ${q('Sections')} sec
     JOIN ${q('AcademicPrograms')} p ON p.${q('academicProgramId')} = sec.${q('academicProgramId')}
     JOIN ${q('AcademicTerms')} t ON t.${q('academicTermId')} = sec.${q('academicTermId')}
     JOIN ${q('AcademicYears')} ay ON ay.${q('academicYearId')} = t.${q('academicYearId')}
     WHERE sec.${q('sectionId')} = $1`,
    [sectionId],
  );

  if (!section) return null;

  const students = await many<any>(
    db,
    `SELECT
       s.${q('studentId')} AS student_id,
       s.${q('studentNumber')} AS student_number,
       s.${q('firstName')} AS first_name,
       s.${q('middleName')} AS middle_name,
       s.${q('lastName')} AS last_name,
       s.${q('suffix')} AS suffix,
       e.${q('studentEnrollmentId')} AS student_enrollment_id,
       e.${q('enrollmentStatusCode')} AS enrollment_status_code,
       e.${q('effectiveFromUtc')} AS effective_from_utc
     FROM ${q('StudentEnrollments')} e
     JOIN ${q('Students')} s ON s.${q('studentId')} = e.${q('studentId')}
     WHERE e.${q('sectionId')} = $1 AND e.${q('effectiveToUtc')} IS NULL
     ORDER BY s.${q('lastName')}, s.${q('firstName')}`,
    [sectionId],
  );

  return {
    ...section,
    enrolled_student_count: students.length,
    students,
  };
}
export async function getAcademicHierarchy(db: Queryable): Promise<Record<string, unknown>[]> {
  return many(
    db,
    `SELECT
       ay.${q('academicYearId')} AS academic_year_id,
       ay.${q('yearCode')} AS year_code,
       ay.${q('isActive')} AS is_active,
       COALESCE(
         jsonb_agg(
           jsonb_build_object(
             'academic_term_id', t.${q('academicTermId')},
             'term_code', t.${q('termCode')},
             'term_name', t.${q('termName')},
             'is_active', t.${q('isActive')},
             'programs', (
               SELECT COALESCE(
                 jsonb_agg(DISTINCT jsonb_build_object(
                   'academic_program_id', p.${q('academicProgramId')},
                   'program_code', p.${q('programCode')},
                   'program_name', p.${q('programName')}
                 )),
                 '[]'::jsonb
               )
               FROM ${q('Sections')} sec
               JOIN ${q('AcademicPrograms')} p ON p.${q('academicProgramId')} = sec.${q('academicProgramId')}
               WHERE sec.${q('academicTermId')} = t.${q('academicTermId')}
                 AND p.${q('isActive')} = true
             )
           ) ORDER BY t.${q('startsOn')} DESC
         ) FILTER (WHERE t.${q('academicTermId')} IS NOT NULL),
         '[]'::jsonb
       ) AS terms
     FROM ${q('AcademicYears')} ay
     LEFT JOIN ${q('AcademicTerms')} t ON t.${q('academicYearId')} = ay.${q('academicYearId')} AND t.${q('isActive')} = true
     WHERE ay.${q('isActive')} = true
     GROUP BY ay.${q('academicYearId')}
     ORDER BY ay.${q('startsOn')} DESC`,
  );
}

// --- Academic Years ---

export async function listAcademicYears(
  db: Queryable,
  filter?: { isActive?: boolean },
): Promise<any[]> {
  const conditions: string[] = [];
  const params: any[] = [];
  if (filter?.isActive !== undefined) {
    params.push(filter.isActive);
    conditions.push(`${q('isActive')} = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return many(
    db,
    `SELECT
       ${q('academicYearId')} AS academic_year_id,
       ${q('yearCode')} AS year_code,
       ${q('yearName')} AS year_name,
       ${q('startsOn')} AS starts_on,
       ${q('endsOn')} AS ends_on,
       ${q('isActive')} AS is_active,
       ${q('createdAtUtc')} AS created_at_utc
     FROM ${q('AcademicYears')}
     ${where}
     ORDER BY ${q('startsOn')} DESC`,
    params,
  );
}

export async function getAcademicYearById(db: Queryable, id: number): Promise<any | null> {
  return one(
    db,
    `SELECT
       ${q('academicYearId')} AS academic_year_id,
       ${q('yearCode')} AS year_code,
       ${q('yearName')} AS year_name,
       ${q('startsOn')} AS starts_on,
       ${q('endsOn')} AS ends_on,
       ${q('isActive')} AS is_active,
       ${q('createdAtUtc')} AS created_at_utc
     FROM ${q('AcademicYears')}
     WHERE ${q('academicYearId')} = $1`,
    [id],
  );
}

export async function getAcademicYearByCode(db: Queryable, code: string): Promise<any | null> {
  return one(
    db,
    `SELECT
       ${q('academicYearId')} AS academic_year_id,
       ${q('yearCode')} AS year_code,
       ${q('yearName')} AS year_name,
       ${q('startsOn')} AS starts_on,
       ${q('endsOn')} AS ends_on,
       ${q('isActive')} AS is_active
     FROM ${q('AcademicYears')}
     WHERE ${q('yearCode')} = $1`,
    [code],
  );
}

export async function insertAcademicYear(
  db: Queryable,
  data: {
    yearCode: string;
    yearName: string;
    startsOn: string;
    endsOn: string;
    isActive?: boolean;
  },
): Promise<any> {
  const res = await one<any>(
    db,
    `INSERT INTO ${q('AcademicYears')} (
       ${q('yearCode')}, ${q('yearName')}, ${q('startsOn')}, ${q('endsOn')}, ${q('isActive')}
     ) VALUES ($1, $2, $3::date, $4::date, $5)
     RETURNING
       ${q('academicYearId')} AS academic_year_id,
       ${q('yearCode')} AS year_code,
       ${q('yearName')} AS year_name,
       ${q('startsOn')} AS starts_on,
       ${q('endsOn')} AS ends_on,
       ${q('isActive')} AS is_active,
       ${q('createdAtUtc')} AS created_at_utc`,
    [data.yearCode, data.yearName, data.startsOn, data.endsOn, data.isActive ?? true],
  );
  return res!;
}

export async function updateAcademicYear(
  db: Queryable,
  id: number,
  data: {
    yearName?: string;
    startsOn?: string;
    endsOn?: string;
    isActive?: boolean;
  },
): Promise<any | null> {
  const sets: string[] = [];
  const params: any[] = [id];

  if (data.yearName !== undefined) {
    params.push(data.yearName);
    sets.push(`${q('yearName')} = $${params.length}`);
  }
  if (data.startsOn !== undefined) {
    params.push(data.startsOn);
    sets.push(`${q('startsOn')} = $${params.length}::date`);
  }
  if (data.endsOn !== undefined) {
    params.push(data.endsOn);
    sets.push(`${q('endsOn')} = $${params.length}::date`);
  }
  if (data.isActive !== undefined) {
    params.push(data.isActive);
    sets.push(`${q('isActive')} = $${params.length}`);
  }

  if (sets.length === 0) return getAcademicYearById(db, id);

  return one(
    db,
    `UPDATE ${q('AcademicYears')}
     SET ${sets.join(', ')}
     WHERE ${q('academicYearId')} = $1
     RETURNING
       ${q('academicYearId')} AS academic_year_id,
       ${q('yearCode')} AS year_code,
       ${q('yearName')} AS year_name,
       ${q('startsOn')} AS starts_on,
       ${q('endsOn')} AS ends_on,
       ${q('isActive')} AS is_active,
       ${q('createdAtUtc')} AS created_at_utc`,
    params,
  );
}

// --- Academic Terms ---

export async function listAcademicTerms(
  db: Queryable,
  filter?: { academicYearId?: number; isActive?: boolean },
): Promise<any[]> {
  const conditions: string[] = [];
  const params: any[] = [];
  if (filter?.academicYearId !== undefined) {
    params.push(filter.academicYearId);
    conditions.push(`t.${q('academicYearId')} = $${params.length}`);
  }
  if (filter?.isActive !== undefined) {
    params.push(filter.isActive);
    conditions.push(`t.${q('isActive')} = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return many(
    db,
    `SELECT
       t.${q('academicTermId')} AS academic_term_id,
       t.${q('academicYearId')} AS academic_year_id,
       t.${q('termCode')} AS term_code,
       t.${q('termName')} AS term_name,
       t.${q('startsOn')} AS starts_on,
       t.${q('endsOn')} AS ends_on,
       t.${q('isActive')} AS is_active,
       t.${q('createdAtUtc')} AS created_at_utc,
       ay.${q('yearCode')} AS year_code,
       ay.${q('yearName')} AS year_name
     FROM ${q('AcademicTerms')} t
     JOIN ${q('AcademicYears')} ay ON ay.${q('academicYearId')} = t.${q('academicYearId')}
     ${where}
     ORDER BY t.${q('startsOn')} DESC`,
    params,
  );
}

export async function getAcademicTermById(db: Queryable, id: number): Promise<any | null> {
  return one(
    db,
    `SELECT
       t.${q('academicTermId')} AS academic_term_id,
       t.${q('academicYearId')} AS academic_year_id,
       t.${q('termCode')} AS term_code,
       t.${q('termName')} AS term_name,
       t.${q('startsOn')} AS starts_on,
       t.${q('endsOn')} AS ends_on,
       t.${q('isActive')} AS is_active,
       t.${q('createdAtUtc')} AS created_at_utc,
       ay.${q('yearCode')} AS year_code,
       ay.${q('yearName')} AS year_name
     FROM ${q('AcademicTerms')} t
     JOIN ${q('AcademicYears')} ay ON ay.${q('academicYearId')} = t.${q('academicYearId')}
     WHERE t.${q('academicTermId')} = $1`,
    [id],
  );
}

export async function getAcademicTermByCode(
  db: Queryable,
  academicYearId: number,
  termCode: string,
): Promise<any | null> {
  return one(
    db,
    `SELECT
       ${q('academicTermId')} AS academic_term_id,
       ${q('academicYearId')} AS academic_year_id,
       ${q('termCode')} AS term_code,
       ${q('termName')} AS term_name,
       ${q('startsOn')} AS starts_on,
       ${q('endsOn')} AS ends_on,
       ${q('isActive')} AS is_active
     FROM ${q('AcademicTerms')}
     WHERE ${q('academicYearId')} = $1 AND ${q('termCode')} = $2`,
    [academicYearId, termCode],
  );
}

export async function insertAcademicTerm(
  db: Queryable,
  data: {
    academicYearId: number;
    termCode: string;
    termName: string;
    startsOn: string;
    endsOn: string;
    isActive?: boolean;
  },
): Promise<any> {
  const res = await one<any>(
    db,
    `INSERT INTO ${q('AcademicTerms')} (
       ${q('academicYearId')}, ${q('termCode')}, ${q('termName')},
       ${q('startsOn')}, ${q('endsOn')}, ${q('isActive')}
     ) VALUES ($1, $2, $3, $4::date, $5::date, $6)
     RETURNING
       ${q('academicTermId')} AS academic_term_id,
       ${q('academicYearId')} AS academic_year_id,
       ${q('termCode')} AS term_code,
       ${q('termName')} AS term_name,
       ${q('startsOn')} AS starts_on,
       ${q('endsOn')} AS ends_on,
       ${q('isActive')} AS is_active,
       ${q('createdAtUtc')} AS created_at_utc`,
    [
      data.academicYearId,
      data.termCode,
      data.termName,
      data.startsOn,
      data.endsOn,
      data.isActive ?? true,
    ],
  );
  return res!;
}

export async function updateAcademicTerm(
  db: Queryable,
  id: number,
  data: {
    termName?: string;
    startsOn?: string;
    endsOn?: string;
    isActive?: boolean;
  },
): Promise<any | null> {
  const sets: string[] = [];
  const params: any[] = [id];

  if (data.termName !== undefined) {
    params.push(data.termName);
    sets.push(`${q('termName')} = $${params.length}`);
  }
  if (data.startsOn !== undefined) {
    params.push(data.startsOn);
    sets.push(`${q('startsOn')} = $${params.length}::date`);
  }
  if (data.endsOn !== undefined) {
    params.push(data.endsOn);
    sets.push(`${q('endsOn')} = $${params.length}::date`);
  }
  if (data.isActive !== undefined) {
    params.push(data.isActive);
    sets.push(`${q('isActive')} = $${params.length}`);
  }

  if (sets.length === 0) return getAcademicTermById(db, id);

  return one(
    db,
    `UPDATE ${q('AcademicTerms')}
     SET ${sets.join(', ')}
     WHERE ${q('academicTermId')} = $1
     RETURNING
       ${q('academicTermId')} AS academic_term_id,
       ${q('academicYearId')} AS academic_year_id,
       ${q('termCode')} AS term_code,
       ${q('termName')} AS term_name,
       ${q('startsOn')} AS starts_on,
       ${q('endsOn')} AS ends_on,
       ${q('isActive')} AS is_active,
       ${q('createdAtUtc')} AS created_at_utc`,
    params,
  );
}

// --- Academic Programs ---

export async function listAcademicPrograms(
  db: Queryable,
  filter?: { isActive?: boolean },
): Promise<any[]> {
  const conditions: string[] = [];
  const params: any[] = [];
  if (filter?.isActive !== undefined) {
    params.push(filter.isActive);
    conditions.push(`${q('isActive')} = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return many(
    db,
    `SELECT
       ${q('academicProgramId')} AS academic_program_id,
       ${q('programCode')} AS program_code,
       ${q('programName')} AS program_name,
       ${q('isActive')} AS is_active,
       ${q('createdAtUtc')} AS created_at_utc
     FROM ${q('AcademicPrograms')}
     ${where}
     ORDER BY ${q('programCode')} ASC`,
    params,
  );
}

export async function getAcademicProgramById(db: Queryable, id: number): Promise<any | null> {
  return one(
    db,
    `SELECT
       ${q('academicProgramId')} AS academic_program_id,
       ${q('programCode')} AS program_code,
       ${q('programName')} AS program_name,
       ${q('isActive')} AS is_active,
       ${q('createdAtUtc')} AS created_at_utc
     FROM ${q('AcademicPrograms')}
     WHERE ${q('academicProgramId')} = $1`,
    [id],
  );
}

export async function getAcademicProgramByCode(db: Queryable, code: string): Promise<any | null> {
  return one(
    db,
    `SELECT
       ${q('academicProgramId')} AS academic_program_id,
       ${q('programCode')} AS program_code,
       ${q('programName')} AS program_name,
       ${q('isActive')} AS is_active
     FROM ${q('AcademicPrograms')}
     WHERE ${q('programCode')} = $1`,
    [code],
  );
}

export async function insertAcademicProgram(
  db: Queryable,
  data: {
    programCode: string;
    programName: string;
    isActive?: boolean;
  },
): Promise<any> {
  const res = await one<any>(
    db,
    `INSERT INTO ${q('AcademicPrograms')} (
       ${q('programCode')}, ${q('programName')}, ${q('isActive')}
     ) VALUES ($1, $2, $3)
     RETURNING
       ${q('academicProgramId')} AS academic_program_id,
       ${q('programCode')} AS program_code,
       ${q('programName')} AS program_name,
       ${q('isActive')} AS is_active,
       ${q('createdAtUtc')} AS created_at_utc`,
    [data.programCode, data.programName, data.isActive ?? true],
  );
  return res!;
}

export async function updateAcademicProgram(
  db: Queryable,
  id: number,
  data: {
    programName?: string;
    isActive?: boolean;
  },
): Promise<any | null> {
  const sets: string[] = [];
  const params: any[] = [id];

  if (data.programName !== undefined) {
    params.push(data.programName);
    sets.push(`${q('programName')} = $${params.length}`);
  }
  if (data.isActive !== undefined) {
    params.push(data.isActive);
    sets.push(`${q('isActive')} = $${params.length}`);
  }

  if (sets.length === 0) return getAcademicProgramById(db, id);

  return one(
    db,
    `UPDATE ${q('AcademicPrograms')}
     SET ${sets.join(', ')}
     WHERE ${q('academicProgramId')} = $1
     RETURNING
       ${q('academicProgramId')} AS academic_program_id,
       ${q('programCode')} AS program_code,
       ${q('programName')} AS program_name,
       ${q('isActive')} AS is_active,
       ${q('createdAtUtc')} AS created_at_utc`,
    params,
  );
}

