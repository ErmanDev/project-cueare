import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as XLSX from 'xlsx';

import { getConfig } from '../src/config.ts';
import { q } from '../src/db/ident.ts';
import { createPool, withTransaction } from '../src/db/pool.ts';
import { one } from '../src/db/queries.ts';
import type { Queryable } from '../src/types.ts';
import { mapImportRow, PROGRAM_NAMES } from '../src/students/roster.ts';
import { isValidStudentCode } from '../src/utils/studentCode.ts';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = path.join(scriptDir, 'sample_data.xls');

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

type SampleRow = {
  line: number;
  studentNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  programCode: string;
  yearLevel: number;
  sectionCode: string;
};

function parseRows(filePath: string): SampleRow[] {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error(`No sheets in ${filePath}`);
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  return raw.map((row, index) => {
    const mapped = mapImportRow(row);
    if (!mapped.ok) {
      return {
        line: index + 2,
        studentNumber: '',
        firstName: '',
        middleName: null,
        lastName: '',
        programCode: 'GEN',
        yearLevel: 1,
        sectionCode: '',
      };
    }
    return {
      line: index + 2,
      studentNumber: mapped.row.studentIdCode,
      firstName: mapped.row.firstName,
      middleName: mapped.row.middleName,
      lastName: mapped.row.lastName,
      programCode: mapped.row.programCode ?? 'GEN',
      yearLevel: mapped.row.yearLevel ?? 1,
      sectionCode: mapped.row.section ?? '',
    };
  });
}

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
     DO UPDATE SET ${q('termName')} = EXCLUDED.${q('termName')}
     RETURNING ${q('academicTermId')} AS academic_term_id`,
    [year!.academic_year_id, TERM.code, TERM.name, TERM.startsOn, TERM.endsOn],
  );
  return term!.academic_term_id;
}

async function ensureProgram(db: Queryable, code: string, cache: Map<string, number>): Promise<number> {
  const hit = cache.get(code);
  if (hit) return hit;
  const name = PROGRAM_NAMES[code] ?? code;
  const row = await one<{ academic_program_id: number }>(
    db,
    `INSERT INTO ${q('AcademicPrograms')} (${q('programCode')}, ${q('programName')})
     VALUES ($1, $2)
     ON CONFLICT (${q('programCode')}) DO UPDATE SET ${q('programName')} = EXCLUDED.${q('programName')}
     RETURNING ${q('academicProgramId')} AS academic_program_id`,
    [code, name],
  );
  cache.set(code, row!.academic_program_id);
  return row!.academic_program_id;
}

async function ensureSection(
  db: Queryable,
  args: { termId: number; programId: number; yearLevel: number; section: string },
  cache: Map<string, number>,
): Promise<number | null> {
  const code = args.section.trim();
  if (!code) return null;
  const key = `${args.termId}:${args.programId}:${args.yearLevel}:${code}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let row = await one<{ section_id: number }>(
    db,
    `SELECT ${q('sectionId')} AS section_id FROM ${q('Sections')}
     WHERE ${q('academicTermId')} = $1 AND ${q('academicProgramId')} = $2
       AND ${q('yearLevel')} = $3 AND ${q('sectionCode')} = $4`,
    [args.termId, args.programId, args.yearLevel, code],
  );
  if (!row) {
    row = await one<{ section_id: number }>(
      db,
      `INSERT INTO ${q('Sections')} (
          ${q('academicTermId')}, ${q('academicProgramId')}, ${q('yearLevel')},
          ${q('sectionCode')}, ${q('sectionName')}
       ) VALUES ($1, $2, $3, $4, $5)
       RETURNING ${q('sectionId')} AS section_id`,
      [args.termId, args.programId, args.yearLevel, code, code],
    );
  }
  cache.set(key, row!.section_id);
  return row!.section_id;
}

async function upsertStudent(
  db: Queryable,
  row: SampleRow,
  ids: { termId: number; programId: number; sectionId: number | null },
): Promise<'created' | 'updated'> {
  const existing = await one<{ student_id: number }>(
    db,
    `SELECT ${q('studentId')} AS student_id FROM ${q('Students')} WHERE ${q('studentNumber')} = $1`,
    [row.studentNumber],
  );

  let studentId: number;
  let status: 'created' | 'updated';
  if (!existing) {
    const created = await one<{ student_id: number }>(
      db,
      `INSERT INTO ${q('Students')} (
          ${q('studentNumber')}, ${q('firstName')}, ${q('middleName')}, ${q('lastName')}
       ) VALUES ($1, $2, $3, $4)
       RETURNING ${q('studentId')} AS student_id`,
      [row.studentNumber, row.firstName, row.middleName, row.lastName],
    );
    studentId = created!.student_id;
    status = 'created';
  } else {
    studentId = existing.student_id;
    await db.query(
      `UPDATE ${q('Students')} SET
          ${q('firstName')} = $1,
          ${q('middleName')} = $2,
          ${q('lastName')} = $3
       WHERE ${q('studentId')} = $4`,
      [row.firstName, row.middleName, row.lastName, studentId],
    );
    status = 'updated';
  }

  const current = await one<{ student_enrollment_id: number }>(
    db,
    `SELECT ${q('studentEnrollmentId')} AS student_enrollment_id FROM ${q('StudentEnrollments')}
     WHERE ${q('studentId')} = $1 AND ${q('academicTermId')} = $2
       AND ${q('effectiveToUtc')} IS NULL
     ORDER BY ${q('studentEnrollmentId')} DESC
     LIMIT 1`,
    [studentId, ids.termId],
  );
  if (!current) {
    await db.query(
      `INSERT INTO ${q('StudentEnrollments')} (
          ${q('studentId')}, ${q('academicTermId')}, ${q('academicProgramId')}, ${q('sectionId')},
          ${q('yearLevel')}, ${q('enrollmentStatusCode')}, ${q('effectiveFromUtc')}
       ) VALUES ($1, $2, $3, $4, $5, 'ENROLLED', clock_timestamp())`,
      [studentId, ids.termId, ids.programId, ids.sectionId, row.yearLevel],
    );
  } else {
    await db.query(
      `UPDATE ${q('StudentEnrollments')} SET
          ${q('academicProgramId')} = $1,
          ${q('sectionId')} = $2,
          ${q('yearLevel')} = $3
       WHERE ${q('studentEnrollmentId')} = $4`,
      [ids.programId, ids.sectionId, row.yearLevel, current.student_enrollment_id],
    );
  }
  return status;
}

async function main(): Promise<void> {
  const filePath = path.resolve(process.argv[2] ?? DEFAULT_FILE);
  const rows = parseRows(filePath);
  const config = getConfig();
  console.log(`File: ${filePath} (${rows.length} rows)`);
  console.log(
    `Connecting to PostgreSQL: ${config.database.user}@${config.database.host}:${config.database.port}/${config.database.name}`,
  );

  const pool = createPool(config.database);
  try {
    const summary = await withTransaction(pool, async (client) => {
      const academicTermId = await ensureTerm(client);
      const programs = new Map<string, number>();
      const sections = new Map<string, number>();
      let created = 0;
      let updated = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const row of rows) {
        if (!row.studentNumber || !row.firstName || !row.lastName) {
          skipped++;
          errors.push(`line ${row.line}: missing StudentID, FName, or LName`);
          continue;
        }
        if (!isValidStudentCode(row.studentNumber)) {
          skipped++;
          errors.push(`line ${row.line} ${row.studentNumber}: invalid student number`);
          continue;
        }
        const academicProgramId = await ensureProgram(client, row.programCode, programs);
        const sid = await ensureSection(
          client,
          {
            termId: academicTermId,
            programId: academicProgramId,
            yearLevel: row.yearLevel,
            section: row.sectionCode,
          },
          sections,
        );
        const status = await upsertStudent(client, row, {
          termId: academicTermId,
          programId: academicProgramId,
          sectionId: sid,
        });
        if (status === 'created') created++;
        else updated++;
      }

      return { created, updated, skipped, errors, sections: sections.size, programs: programs.size };
    });

    console.log(
      `Seeded students: created=${summary.created} updated=${summary.updated} skipped=${summary.skipped}`,
    );
    console.log(`Programs used: ${summary.programs}; sections created/reused: ${summary.sections}`);
    for (const err of summary.errors) console.error(`  ${err}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
