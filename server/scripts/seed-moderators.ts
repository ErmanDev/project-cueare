import { hashPassword } from '../src/auth/password.ts';
import { getConfig } from '../src/config.ts';
import { createPool, ensureSchema, withTransaction } from '../src/db/pool.ts';
import * as q from '../src/db/queries.ts';
import { ROLES } from '../src/types.ts';
import { wipeAllSscTables } from './remove_data.ts';

const ADMIN = { username: 'admin', password: 'changeme123', name: 'Super Admin' };
const STAFF_PASSWORD = 'changeme123';

const STUDENTS = [
  { code: '02-26-1042', first: 'Maria', middle: null, last: 'Santos', promote: true },
  { code: '02-26-0999', first: 'Ana Isabella Marie', middle: null, last: 'Gonzales-Reyes', promote: true },
  { code: '02-26-1101', first: 'Juan', middle: null, last: 'Dela Cruz', promote: true },
  { code: '02-26-1102', first: 'Pedro', middle: null, last: 'Reyes', promote: false },
  { code: '02-26-1103', first: 'Liza', middle: null, last: 'Navarro', promote: false },
  { code: '02-26-1104', first: 'Carlo', middle: null, last: 'Mendoza', promote: false },
] as const;

const STAFF = [
  { username: 'scanner.am', name: 'AM Scanner' },
  { username: 'door.staff', name: 'Door Staff' },
] as const;

async function main(): Promise<void> {
  const config = getConfig();
  console.log(
    `Connecting to PostgreSQL: ${config.database.user}@${config.database.host}:${config.database.port}/${config.database.name}`,
  );

  const pool = createPool(config.database);
  try {
    const wiped = await wipeAllSscTables(pool);
    console.log(`Wiped ${wiped} tables.`);
    await ensureSchema(pool);

    const summary = await withTransaction(pool, async (db) => {
      const admin = await q.insertUser(db, {
        name: ADMIN.name,
        username: ADMIN.username,
        passwordHash: hashPassword(ADMIN.password),
        role: ROLES.superadmin,
      });

      let promoted = 0;
      let leftover = 0;
      for (const s of STUDENTS) {
        const student = await q.insertStudent(db, {
          studentIdCode: s.code,
          firstName: s.first,
          middleName: s.middle,
          lastName: s.last,
          section: 'A',
          photoUrl: null,
          programCode: 'BSIT',
          yearLevel: 1,
        });
        if (!s.promote) {
          leftover++;
          continue;
        }
        const user = await q.insertUser(db, {
          name: student.full_name,
          username: student.student_id_code,
          passwordHash: hashPassword(student.student_id_code),
          role: ROLES.moderator,
        });
        await q.linkStudentToUser(db, student.id, user.id);
        promoted++;
      }

      for (const m of STAFF) {
        await q.insertUser(db, {
          name: m.name,
          username: m.username,
          passwordHash: hashPassword(STAFF_PASSWORD),
          role: ROLES.moderator,
        });
      }

      return { adminId: admin.id, promoted, leftover, staff: STAFF.length };
    });

    console.log(`Superadmin: ${ADMIN.username} / ${ADMIN.password}`);
    console.log(
      `Moderators: ${summary.promoted} student accounts (password = student ID), ${summary.staff} staff (${STAFF_PASSWORD})`,
    );
    console.log(`Students left to promote: ${summary.leftover}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
