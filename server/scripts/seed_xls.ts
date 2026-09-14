import * as xlsx from 'xlsx';
import { getConfig } from '../src/config.ts';
import { q } from '../src/db/ident.ts';
import { createPool, withTransaction } from '../src/db/pool.ts';
import { one } from '../src/db/queries.ts';
import type { Queryable } from '../src/types.ts';

const YEAR = { code: '2026-2027', name: 'Academic Year 2026–2027', startsOn: '2026-08-01', endsOn: '2027-07-31' };
const TERM = { code: '2026-1S', name: 'First Semester', startsOn: '2026-08-03', endsOn: '2026-12-18' };

async function ensureTerm(db: Queryable): Promise<number> {
  const year = await one<{ academic_year_id: number }>(db,
    `INSERT INTO ${q('AcademicYears')} (${q('yearCode')}, ${q('yearName')}, ${q('startsOn')}, ${q('endsOn')}, ${q('isActive')}) VALUES ($1, $2, $3::date, $4::date, true) ON CONFLICT (${q('yearCode')}) DO UPDATE SET ${q('yearName')} = EXCLUDED.${q('yearName')} RETURNING ${q('academicYearId')} AS academic_year_id`,
    [YEAR.code, YEAR.name, YEAR.startsOn, YEAR.endsOn]);
  const term = await one<{ academic_term_id: number }>(db,
    `INSERT INTO ${q('AcademicTerms')} (${q('academicYearId')}, ${q('termCode')}, ${q('termName')}, ${q('startsOn')}, ${q('endsOn')}, ${q('isActive')}) VALUES ($1, $2, $3, $4::date, $5::date, true) ON CONFLICT (${q('academicYearId')}, ${q('termCode')}) DO UPDATE SET ${q('termName')} = EXCLUDED.${q('termName')}, ${q('isActive')} = true RETURNING ${q('academicTermId')} AS academic_term_id`,
    [year!.academic_year_id, TERM.code, TERM.name, TERM.startsOn, TERM.endsOn]);
  return term!.academic_term_id;
}

async function ensureProgram(db: Queryable, code: string): Promise<number> {
  const name = code === 'BSIT' ? 'Bachelor of Science in Information Technology' : code === 'BSBA' ? 'Bachelor of Science in Business Administration' : code;
  const row = await one<{ academic_program_id: number }>(db,
    `INSERT INTO ${q('AcademicPrograms')} (${q('programCode')}, ${q('programName')}) VALUES ($1, $2) ON CONFLICT (${q('programCode')}) DO UPDATE SET ${q('programName')} = EXCLUDED.${q('programName')} RETURNING ${q('academicProgramId')} AS academic_program_id`,
    [code, name]);
  return row!.academic_program_id;
}

async function ensureSection(db: Queryable, args: { termId: number; programId: number; yearLevel: number; sectionCode: string }): Promise<number> {
  let row = await one<{ section_id: number }>(db,
    `SELECT ${q('sectionId')} AS section_id FROM ${q('Sections')} WHERE ${q('academicTermId')} = $1 AND ${q('academicProgramId')} = $2 AND ${q('yearLevel')} = $3 AND ${q('sectionCode')} = $4`,
    [args.termId, args.programId, args.yearLevel, args.sectionCode]);
  if (!row) {
    row = await one<{ section_id: number }>(db,
      `INSERT INTO ${q('Sections')} (${q('academicTermId')}, ${q('academicProgramId')}, ${q('yearLevel')}, ${q('sectionCode')}, ${q('sectionName')}) VALUES ($1, $2, $3, $4, $5) RETURNING ${q('sectionId')} AS section_id`,
      [args.termId, args.programId, args.yearLevel, args.sectionCode, `${args.yearLevel}-${args.sectionCode}`]);
  }
  return row!.section_id;
}

async function main() {
  const config = getConfig();
  const pool = createPool(config.database);
  
  const workbook = xlsx.readFile('scripts/data.xls');
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json<any>(worksheet);

  try {
    await withTransaction(pool, async (client) => {
      const termId = await ensureTerm(client);

      for (const row of rows) {
        if (!row.StudentID || !row.FName || !row.LName || !row.COURSE || !row.YrLevel) continue;
        const course = row.COURSE.trim().toUpperCase();
        if (course !== 'BSBA' && course !== 'BSIT') continue;
        
        const programId = await ensureProgram(client, row.COURSE.trim());
        const yearLevel = parseInt(String(row.YrLevel).replace(/\D/g, ''), 10) || 1;
        const sectioning = (row.Sectioning || 'A').toString().trim().toUpperCase();
        
        const sectionId = await ensureSection(client, { termId, programId, yearLevel, sectionCode: sectioning });
        
        let student = await one<{ student_id: number }>(client,
          `SELECT ${q('studentId')} AS student_id FROM ${q('Students')} WHERE ${q('studentNumber')} = $1`,
          [row.StudentID.trim()]);
          
        if (!student) {
          student = await one<{ student_id: number }>(client,
            `INSERT INTO ${q('Students')} (${q('studentNumber')}, ${q('firstName')}, ${q('lastName')}, ${q('middleName')}) VALUES ($1, $2, $3, $4) RETURNING ${q('studentId')} AS student_id`,
            [row.StudentID.trim(), row.FName.trim(), row.LName.trim(), row.MName ? row.MName.trim() : null]);
        }
        
        const existingEnrollment = await one<{ student_enrollment_id: number }>(client,
          `SELECT ${q('studentEnrollmentId')} AS student_enrollment_id FROM ${q('StudentEnrollments')} WHERE ${q('studentId')} = $1 AND ${q('academicTermId')} = $2 AND ${q('effectiveToUtc')} IS NULL`,
          [student!.student_id, termId]);
          
        if (!existingEnrollment) {
          await client.query(
            `INSERT INTO ${q('StudentEnrollments')} (${q('studentId')}, ${q('academicTermId')}, ${q('academicProgramId')}, ${q('sectionId')}, ${q('yearLevel')}, ${q('enrollmentStatusCode')}, ${q('effectiveFromUtc')}) VALUES ($1, $2, $3, $4, $5, 'ENROLLED', clock_timestamp())`,
            [student!.student_id, termId, programId, sectionId, yearLevel]);
        }
      }
    });
    console.log("XLS data seeded.");
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
