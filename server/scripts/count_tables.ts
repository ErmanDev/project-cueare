import { createPool } from '../src/db/pool.ts';
import { getConfig } from '../src/config.ts';
import { q } from '../src/db/ident.ts';

async function run() {
  const pool = createPool(getConfig().database);
  const getCount = async (name: string) => {
    const res = await pool.query(`SELECT count(*) FROM ${q(name)}`);
    return res.rows[0].count;
  };
  
  console.log('AcademicYears:', await getCount('AcademicYears'));
  console.log('AcademicTerms:', await getCount('AcademicTerms'));
  console.log('AcademicPrograms:', await getCount('AcademicPrograms'));
  console.log('Sections:', await getCount('Sections'));
  console.log('Students:', await getCount('Students'));
  console.log('StudentEnrollments:', await getCount('StudentEnrollments'));
  
  await pool.end();
}

run();
