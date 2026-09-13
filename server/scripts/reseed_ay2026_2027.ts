import { getConfig } from '../src/config.ts';
import { q } from '../src/db/ident.ts';
import { createPool, withTransaction } from '../src/db/pool.ts';
import { one } from '../src/db/queries.ts';
import type { Queryable } from '../src/types.ts';
import { PROGRAM_NAMES } from '../src/students/roster.ts';

const YEAR = {
  code: '2026-2027',
  name: 'Academic Year 2026–2027',
  startsOn: '2026-08-01',
  endsOn: '2027-07-31',
};

const TERM = {
  code: '2026-1S',
  name: 'First Semester',
  startsOn: '2026-08-03',
  endsOn: '2026-12-18',
};

const PROGRAMS = ['BSIT', 'BSBA', 'BSED', 'BSBE'];
const YEAR_LEVELS = [1, 2, 3, 4];

// Filipino sample first names and last names for seeding
const FIRST_NAMES = [
  'Juan', 'Maria', 'Jose', 'Angela', 'Gabriel', 'Mark', 'Grace', 'Christian', 'Kaye', 'Joshua',
  'Patricia', 'Daniel', 'Bea', 'Paul', 'Rhea', 'Carl', 'Samantha', 'John', 'Nicole', 'Michael',
  'Andrea', 'David', 'Christine', 'Kevin', 'Hannah', 'Alex', 'Sarah', 'Justin', 'Erica', 'Bryan'
];

const LAST_NAMES = [
  'Dela Cruz', 'Santos', 'Reyes', 'Cruz', 'Bautista', 'Ocampo', 'Garcia', 'Mendoza', 'Torres', 'Tomas',
  'Andrada', 'Flores', 'Castillo', 'Villanueva', 'Ramos', 'Castro', 'Rivera', 'Aquino', 'Navarro', 'Salazar',
  'Mercado', 'Valenzuela', 'Santiago', 'Del Rosario', 'Pineda', 'Soriano', 'Corpuz', 'Tolentino', 'Vergara', 'Gutierrez'
];

async function ensureTerm(db: Queryable): Promise<number> {
  const year = await one<{ academic_year_id: number }>(
    db,
    `INSERT INTO ${q('AcademicYears')} (
        ${q('yearCode')}, ${q('yearName')}, ${q('startsOn')}, ${q('endsOn')}, ${q('isActive')}
     ) VALUES ($1, $2, $3::date, $4::date, true)
     ON CONFLICT (${q('yearCode')}) DO UPDATE SET ${q('yearName')} = EXCLUDED.${q('yearName')}
     RETURNING ${q('academicYearId')} AS academic_year_id`,
    [YEAR.code, YEAR.name, YEAR.startsOn, YEAR.endsOn],
  );
  const term = await one<{ academic_term_id: number }>(
    db,
    `INSERT INTO ${q('AcademicTerms')} (
        ${q('academicYearId')}, ${q('termCode')}, ${q('termName')},
        ${q('startsOn')}, ${q('endsOn')}, ${q('isActive')}
     ) VALUES ($1, $2, $3, $4::date, $5::date, true)
     ON CONFLICT (${q('academicYearId')}, ${q('termCode')})
     DO UPDATE SET ${q('termName')} = EXCLUDED.${q('termName')}, ${q('isActive')} = true
     RETURNING ${q('academicTermId')} AS academic_term_id`,
    [year!.academic_year_id, TERM.code, TERM.name, TERM.startsOn, TERM.endsOn],
  );
  return term!.academic_term_id;
}

async function ensureProgram(db: Queryable, code: string): Promise<number> {
  const name = PROGRAM_NAMES[code] ?? code;
  const row = await one<{ academic_program_id: number }>(
    db,
    `INSERT INTO ${q('AcademicPrograms')} (${q('programCode')}, ${q('programName')})
     VALUES ($1, $2)
     ON CONFLICT (${q('programCode')}) DO UPDATE SET ${q('programName')} = EXCLUDED.${q('programName')}
     RETURNING ${q('academicProgramId')} AS academic_program_id`,
    [code, name],
  );
  return row!.academic_program_id;
}

async function ensureSection(
  db: Queryable,
  args: { termId: number; programId: number; yearLevel: number; sectionCode: string },
): Promise<number> {
  let row = await one<{ section_id: number }>(
    db,
    `SELECT ${q('sectionId')} AS section_id FROM ${q('Sections')}
     WHERE ${q('academicTermId')} = $1 AND ${q('academicProgramId')} = $2
       AND ${q('yearLevel')} = $3 AND ${q('sectionCode')} = $4`,
    [args.termId, args.programId, args.yearLevel, args.sectionCode],
  );
  if (!row) {
    row = await one<{ section_id: number }>(
      db,
      `INSERT INTO ${q('Sections')} (
          ${q('academicTermId')}, ${q('academicProgramId')}, ${q('yearLevel')},
          ${q('sectionCode')}, ${q('sectionName')}
       ) VALUES ($1, $2, $3, $4, $5)
       RETURNING ${q('sectionId')} AS section_id`,
      [args.termId, args.programId, args.yearLevel, args.sectionCode, `${args.yearLevel}-${args.sectionCode}`],
    );
  }
  return row!.section_id;
}

async function main(): Promise<void> {
  const config = getConfig();
  console.log(`Reseeding for Academic Year 2026–2027 (First Semester)...`);
  console.log(
    `Connecting to PostgreSQL: ${config.database.user}@${config.database.host}:${config.database.port}/${config.database.name}`,
  );

  const pool = createPool(config.database);
  try {
    const stats = await withTransaction(pool, async (client) => {
      const termId = await ensureTerm(client);

      let studentCounter = 1;
      let totalStudentsCreated = 0;
      let totalSectionsCreated = 0;

      for (const progCode of PROGRAMS) {
        const programId = await ensureProgram(client, progCode);

        for (const yearLvl of YEAR_LEVELS) {
          // Create 2 sections per year level (e.g. 1-WA, 1-WB)
          const sectionCodes = [`${yearLvl}-WA`, `${yearLvl}-WB`];

          for (const sCode of sectionCodes) {
            const sectionId = await ensureSection(client, {
              termId,
              programId,
              yearLevel: yearLvl,
              sectionCode: sCode,
            });
            totalSectionsCreated++;

            // Create 5 to 7 students per section
            const studentCount = 5 + (studentCounter % 3);
            for (let i = 0; i < studentCount; i++) {
              const numStr = String(studentCounter).padStart(4, '0');
              const studentNumber = `02-26-${numStr}`;
              const firstName = FIRST_NAMES[studentCounter % FIRST_NAMES.length];
              const lastName = LAST_NAMES[(studentCounter * 3) % LAST_NAMES.length];
              studentCounter++;

              let student = await one<{ student_id: number }>(
                client,
                `SELECT ${q('studentId')} AS student_id FROM ${q('Students')} WHERE ${q('studentNumber')} = $1`,
                [studentNumber],
              );

              if (!student) {
                student = await one<{ student_id: number }>(
                  client,
                  `INSERT INTO ${q('Students')} (
                      ${q('studentNumber')}, ${q('firstName')}, ${q('lastName')}
                   ) VALUES ($1, $2, $3)
                   RETURNING ${q('studentId')} AS student_id`,
                  [studentNumber, firstName, lastName],
                );
              }

              // Upsert enrollment
              const existingEnrollment = await one<{ student_enrollment_id: number }>(
                client,
                `SELECT ${q('studentEnrollmentId')} AS student_enrollment_id FROM ${q('StudentEnrollments')}
                 WHERE ${q('studentId')} = $1 AND ${q('academicTermId')} = $2
                   AND ${q('effectiveToUtc')} IS NULL`,
                [student!.student_id, termId],
              );

              if (!existingEnrollment) {
                await client.query(
                  `INSERT INTO ${q('StudentEnrollments')} (
                      ${q('studentId')}, ${q('academicTermId')}, ${q('academicProgramId')}, ${q('sectionId')},
                      ${q('yearLevel')}, ${q('enrollmentStatusCode')}, ${q('effectiveFromUtc')}
                   ) VALUES ($1, $2, $3, $4, $5, 'ENROLLED', clock_timestamp())`,
                  [student!.student_id, termId, programId, sectionId, yearLvl],
                );
              } else {
                await client.query(
                  `UPDATE ${q('StudentEnrollments')} SET
                      ${q('academicProgramId')} = $1,
                      ${q('sectionId')} = $2,
                      ${q('yearLevel')} = $3
                   WHERE ${q('studentEnrollmentId')} = $4`,
                  [programId, sectionId, yearLvl, existingEnrollment.student_enrollment_id],
                );
              }
              totalStudentsCreated++;
            }
          }
        }
      }

      return { totalSectionsCreated, totalStudentsCreated };
    });

    console.log(`\nSUCCESS: Reseed completed!`);
    console.log(`Term: ${YEAR.name} - ${TERM.name} (${TERM.code})`);
    console.log(`Sections created/ensured: ${stats.totalSectionsCreated}`);
    console.log(`Students enrolled (1st - 4th Year): ${stats.totalStudentsCreated}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
