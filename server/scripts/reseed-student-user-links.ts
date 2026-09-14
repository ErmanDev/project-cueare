import { getConfig } from '../src/config.ts';
import { hashPassword } from '../src/auth/password.ts';
import { createPool, ensureSchema } from '../src/db/pool.ts';
import { q } from '../src/db/ident.ts';

export async function reseedStudentUserLinks(db: any, defaultPassword = 'us3r!@##'): Promise<number> {
  const hash = hashPassword(defaultPassword);

  const studentsRes = await db.query(`
    SELECT
      ${q('studentId')} AS student_id,
      ${q('studentNumber')} AS student_number,
      ${q('firstName')} AS first_name,
      ${q('lastName')} AS last_name,
      ${q('middleName')} AS middle_name
    FROM ${q('Students')}
  `);

  let count = 0;
  for (const st of studentsRes.rows) {
    const studentNumber = st.student_number;
    const nameParts = [st.first_name, st.middle_name, st.last_name].filter(Boolean);
    const displayName = nameParts.length > 0 ? nameParts.join(' ') : `Student ${studentNumber}`;

    // Check if user already exists by externalSubject or username
    let userRes = await db.query(`
      SELECT ${q('userId')} AS user_id FROM ${q('Users')}
      WHERE ${q('externalSubject')} = $1 OR username = $1
    `, [studentNumber]);

    let userId: number;
    if (userRes.rows.length === 0) {
      const newUser = await db.query(`
        INSERT INTO ${q('Users')} (
          ${q('externalSubject')}, username, ${q('passwordHash')}, ${q('displayName')}, role, ${q('canManageAttendance')}, ${q('isActive')}
        ) VALUES ($1, $1, $2, $3, 'student', false, true)
        RETURNING ${q('userId')} AS user_id
      `, [studentNumber, hash, displayName]);
      userId = newUser.rows[0].user_id;
    } else {
      userId = userRes.rows[0].user_id;
      await db.query(`
        UPDATE ${q('Users')}
        SET ${q('externalSubject')} = COALESCE(${q('externalSubject')}, $1),
            username = COALESCE(username, $1),
            ${q('passwordHash')} = $2,
            ${q('displayName')} = $3,
            ${q('isActive')} = true
        WHERE ${q('userId')} = $4
      `, [studentNumber, hash, displayName, userId]);
    }

    // Upsert into StudentUserLinks
    await db.query(`
      INSERT INTO ${q('StudentUserLinks')} (${q('userId')}, ${q('studentId')})
      VALUES ($1, $2)
      ON CONFLICT (${q('userId')}) DO UPDATE
      SET ${q('studentId')} = EXCLUDED.${q('studentId')}
    `, [userId, st.student_id]);

    count++;
  }

  return count;
}

async function main(): Promise<void> {
  const password = process.argv[2] ?? 'us3r!@##';
  const config = getConfig();
  console.log(`Connecting to PostgreSQL database: ${config.database.name}...`);
  const pool = createPool(config.database);

  try {
    await ensureSchema(pool);
    console.log(`Reseeding Student User Links with default password: "${password}"...`);
    const count = await reseedStudentUserLinks(pool, password);
    console.log(`Successfully linked ${count} student records to user accounts!`);
  } catch (err) {
    console.error('Reseed failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (import.meta.main || process.argv[1]?.includes('reseed-student-user-links')) {
  main();
}
