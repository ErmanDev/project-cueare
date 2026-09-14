import { getConfig } from '../src/config.ts';
import { q } from '../src/db/ident.ts';
import { createPool } from '../src/db/pool.ts';

async function main() {
  const config = getConfig();
  const pool = createPool(config.database);
  try {
    console.log("Removing all students, sections, and related data...");
    await pool.query(`TRUNCATE TABLE ${q('AcademicYears')}, ${q('AcademicPrograms')}, ${q('Students')}, ${q('Sections')} RESTART IDENTITY CASCADE;`);
    console.log("SUCCESS: Data removed.");
  } catch (err) {
    console.error("Error removing data:", err);
  } finally {
    await pool.end();
  }
}

main();
