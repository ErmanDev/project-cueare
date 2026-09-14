import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import type { Pool } from 'pg';

import { hashPassword, verifyPassword } from '../src/auth/password.ts';
import { getConfig } from '../src/config.ts';
import { createPool, ensureSchema } from '../src/db/pool.ts';
import * as q from '../src/db/queries.ts';

const SCHEMA = 'ssc_moderator_test';

describe('Promote student to moderator', () => {
  let pool: Pool;
  let dbReady = false;

  beforeAll(async () => {
    try {
      pool = createPool(getConfig().database, SCHEMA);
      await pool.query('SELECT 1');
      await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
      await ensureSchema(pool, SCHEMA);
      dbReady = true;
    } catch (e) {
      console.warn('Skipping Postgres moderator tests:', e);
    }
  });

  afterAll(async () => {
    if (!pool) return;
    try {
      await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    } catch {
      // ignore
    }
    await pool.end();
  });

  beforeEach(async () => {
    if (!dbReady) return;
    await pool.query(
      `TRUNCATE "AttendanceLogs", "AttendanceCorrections", "AttendanceRecords",
               "EventParticipants", "EventSessions", "Events",
               "StudentEnrollments", "Students", "Sections", "Users"
       RESTART IDENTITY CASCADE`,
    );
  });

  it('skips when Postgres is unavailable', () => {
    if (!dbReady) {
      console.warn('Postgres not available — moderator tests skipped');
    }
    expect(true).toBe(true);
  });

  it('links a student so their ID and default password are a moderator login', async () => {
    if (!dbReady) return;
    const student = await q.insertStudent(pool, {
      studentIdCode: '02-26-0011',
      fullName: 'Juan Dela Cruz',
      section: null,
      photoUrl: null,
    });
    expect(student.user_id).toBeNull();

    const user = await q.insertUser(pool, {
      name: student.full_name,
      username: student.student_id_code,
      passwordHash: hashPassword(student.student_id_code),
      role: 'moderator',
    });
    await q.linkStudentToUser(pool, student.id, user.id);

    const linked = await q.getStudentById(pool, student.id);
    expect(linked?.user_id).toBe(user.id);

    const staff = await q.getUserByUsername(pool, '02-26-0011');
    expect(staff?.role).toBe('moderator');
    expect(staff ? verifyPassword('02-26-0011', staff.password_hash) : false).toBe(true);
    expect(staff ? verifyPassword('changed-pass', staff.password_hash) : true).toBe(false);
  });

  it('unlinks the student when the moderator account is removed', async () => {
    if (!dbReady) return;
    const student = await q.insertStudent(pool, {
      studentIdCode: '02-26-0099',
      fullName: 'Maria Santos',
      section: null,
      photoUrl: null,
    });
    const user = await q.insertUser(pool, {
      name: student.full_name,
      username: student.student_id_code,
      passwordHash: hashPassword(student.student_id_code),
      role: 'moderator',
    });
    await q.linkStudentToUser(pool, student.id, user.id);
    await q.unlinkStudentsFromUser(pool, user.id);
    await q.deleteUser(pool, user.id);

    const after = await q.getStudentById(pool, student.id);
    expect(after?.user_id).toBeNull();
    expect(await q.getUserByUsername(pool, student.student_id_code)).toBeNull();
  });

  it('demotes a promoted student so the student ID is a student login again', async () => {
    if (!dbReady) return;
    const student = await q.insertStudent(pool, {
      studentIdCode: '02-26-0044',
      fullName: 'Ana Reyes',
      section: null,
      photoUrl: null,
    });
    const user = await q.insertUser(pool, {
      name: student.full_name,
      username: student.student_id_code,
      passwordHash: hashPassword(student.student_id_code),
      role: 'moderator',
    });
    await q.linkStudentToUser(pool, student.id, user.id);
    expect((await q.getStudentByUserId(pool, user.id))?.id).toBe(student.id);
    expect((await q.listLinkedStudentIdsByUser(pool)).get(user.id)).toBe(student.id);

    await q.unlinkStudentsFromUser(pool, user.id);
    expect(await q.countScansByModerator(pool, user.id)).toBe(0);
    await q.deleteUser(pool, user.id);

    const after = await q.getStudentById(pool, student.id);
    expect(after?.user_id).toBeNull();
    expect(await q.getUserByUsername(pool, '02-26-0044')).toBeNull();
    expect(await q.getStudentByCode(pool, '02-26-0044')).not.toBeNull();
  });

  it('keeps a student-changed password after promote and demote', async () => {
    if (!dbReady) return;
    const student = await q.insertStudent(pool, {
      studentIdCode: '02-26-0077',
      fullName: 'Liza Cruz',
      section: null,
      photoUrl: null,
    });
    const account = await q.insertUser(pool, {
      name: student.full_name,
      username: student.student_id_code,
      passwordHash: hashPassword('newpass1'),
      role: 'student',
    });
    await q.linkStudentToUser(pool, student.id, account.id);

    const asStudent = await q.getUserByUsername(pool, '02-26-0077');
    expect(asStudent?.role).toBe('student');
    expect(asStudent ? verifyPassword('newpass1', asStudent.password_hash) : false).toBe(true);
    expect(asStudent ? verifyPassword('02-26-0077', asStudent.password_hash) : true).toBe(false);

    const promoted = await q.updateUser(pool, account.id, { role: 'moderator' });
    expect(promoted.role).toBe('moderator');
    expect(verifyPassword('newpass1', promoted.password_hash)).toBe(true);

    const demoted = await q.updateUser(pool, account.id, { role: 'student' });
    expect(demoted.role).toBe('student');
    expect(verifyPassword('newpass1', demoted.password_hash)).toBe(true);
    expect((await q.getStudentById(pool, student.id))?.user_id).toBe(account.id);
  });

  it('allows a special ID that is not a user or student login', async () => {
    if (!dbReady) return;
    expect(await q.existingLoginKind(pool, 'ssc-mod-01')).toBeNull();
    const created = await q.insertUser(pool, {
      name: 'Officer Cruz',
      username: 'ssc-mod-01',
      passwordHash: hashPassword('secret1'),
      role: 'moderator',
    });
    expect(created.username).toBe('ssc-mod-01');
    expect(created.role).toBe('moderator');
    expect(verifyPassword('secret1', created.password_hash)).toBe(true);
    expect(await q.existingLoginKind(pool, 'ssc-mod-01')).toBe('user');
  });

  it('treats an existing student ID as taken unless promoting that student', async () => {
    if (!dbReady) return;
    const student = await q.insertStudent(pool, {
      studentIdCode: '02-26-0088',
      fullName: 'Pedro Gomez',
      section: null,
      photoUrl: null,
    });
    expect(await q.existingLoginKind(pool, '02-26-0088')).toBe('student');
    expect(await q.existingLoginKind(pool, '02-26-0088'.toUpperCase())).toBe('student');

    const promoted = await q.insertUser(pool, {
      name: student.full_name,
      username: student.student_id_code,
      passwordHash: hashPassword(student.student_id_code),
      role: 'moderator',
    });
    await q.linkStudentToUser(pool, student.id, promoted.id);
    expect(await q.existingLoginKind(pool, '02-26-0088')).toBe('user');
    expect(await q.existingLoginKind(pool, '02-26-0088', promoted.id)).toBe('student');
  });

  it('rejects a special ID that matches another moderator login', async () => {
    if (!dbReady) return;
    await q.insertUser(pool, {
      name: 'First',
      username: 'mod-alpha',
      passwordHash: hashPassword('pass1'),
      role: 'moderator',
    });
    expect(await q.existingLoginKind(pool, 'MOD-ALPHA')).toBe('user');
    expect(await q.existingLoginKind(pool, 'mod-beta')).toBeNull();
  });
});
