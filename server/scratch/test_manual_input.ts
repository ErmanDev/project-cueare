import { getPool } from '../src/db/pool.ts';
import * as q from '../src/db/queries.ts';

async function testManualInputs() {
  const pool = getPool();
  try {
    const inputs = [
      '02-26-0195',
      '02260195',
      '02 26 0195',
      '02/26/0195',
      '02.26.0195',
      'Aaron James Saagundo',
      'Aaron James Raut Saagundo',
    ];

    for (const input of inputs) {
      const student = await q.getStudentByCode(pool, input);
      console.log(`Input "${input}" -> ${student ? `FOUND (ID: ${student.id}, Code: ${student.student_id_code})` : 'NOT FOUND'}`);
    }
  } catch (err: any) {
    console.error('Error testing manual input:', err);
  } finally {
    await pool.end();
  }
}

testManualInputs();
