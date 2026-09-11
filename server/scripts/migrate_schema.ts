import pg from 'pg';
import fs from 'fs';
import path from 'path';

const pool = new pg.Pool({
  host: process.env.DATABASE_HOST || 'localhost',
  port: Number(process.env.DATABASE_PORT || 5432),
  database: process.env.DATABASE_NAME || 'ssc',
  user: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || '@2020'
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('--- Step 1: Aligning existing table columns ---');
    
    // Check EventSessions columns
    const sessColsRes = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'ssc' AND table_name = 'EventSessions'
    `);
    const sessCols = new Set(sessColsRes.rows.map(r => r.column_name));
    if (!sessCols.has('sessionTypeCode')) {
      console.log('Adding sessionTypeCode to EventSessions...');
      await client.query(`ALTER TABLE ssc."EventSessions" ADD COLUMN IF NOT EXISTS "sessionTypeCode" VARCHAR(20) NOT NULL DEFAULT 'GENERAL'`);
    }

    // Check Users columns
    const userColsRes = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'ssc' AND table_name = 'Users'
    `);
    const userCols = new Set(userColsRes.rows.map(r => r.column_name));
    if (!userCols.has('externalSubject')) {
      console.log('Adding externalSubject to Users...');
      await client.query(`ALTER TABLE ssc."Users" ADD COLUMN IF NOT EXISTS "externalSubject" VARCHAR(200) NULL`);
      await client.query(`UPDATE ssc."Users" SET "externalSubject" = 'usr_' || "userId" WHERE "externalSubject" IS NULL`);
      await client.query(`ALTER TABLE ssc."Users" ALTER COLUMN "externalSubject" SET NOT NULL`);
      await client.query(`ALTER TABLE ssc."Users" ADD CONSTRAINT uq_users_external_subject UNIQUE ("externalSubject")`);
    }
    if (!userCols.has('displayName')) {
      console.log('Adding displayName to Users...');
      await client.query(`ALTER TABLE ssc."Users" ADD COLUMN IF NOT EXISTS "displayName" VARCHAR(200) NULL`);
      await client.query(`UPDATE ssc."Users" SET "displayName" = COALESCE("username", 'User ' || "userId") WHERE "displayName" IS NULL`);
      await client.query(`ALTER TABLE ssc."Users" ALTER COLUMN "displayName" SET NOT NULL`);
    }
    if (!userCols.has('canManageAttendance')) {
      console.log('Adding canManageAttendance to Users...');
      await client.query(`ALTER TABLE ssc."Users" ADD COLUMN IF NOT EXISTS "canManageAttendance" BOOLEAN NOT NULL DEFAULT TRUE`);
    }

    // Check StudentEnrollments constraints
    const conRes = await client.query(`
      SELECT conname, pg_get_constraintdef(c.oid) as def
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON t.relnamespace = n.oid
      WHERE n.nspname = 'ssc' AND t.relname = 'StudentEnrollments'
    `);
    if (!conRes.rows.some(r => r.conname === 'uq_student_enrollments_student_term')) {
      console.log('Adding uq_student_enrollments_student_term...');
      await client.query(`ALTER TABLE ssc."StudentEnrollments" ADD CONSTRAINT uq_student_enrollments_student_term UNIQUE ("studentEnrollmentId", "studentId")`);
    }

    // Check Events constraints
    const eventConRes = await client.query(`
      SELECT conname FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON t.relnamespace = n.oid
      WHERE n.nspname = 'ssc' AND t.relname = 'Events'
    `);
    if (!eventConRes.rows.some(r => r.conname === 'uq_events_context')) {
      console.log('Adding uq_events_context...');
      await client.query(`ALTER TABLE ssc."Events" ADD CONSTRAINT uq_events_context UNIQUE ("eventId", "academicTermId")`);
    }

    // Check EventSessions constraints
    const sessConRes = await client.query(`
      SELECT conname FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON t.relnamespace = n.oid
      WHERE n.nspname = 'ssc' AND t.relname = 'EventSessions'
    `);
    if (!sessConRes.rows.some(r => r.conname === 'uq_event_sessions_event_context')) {
      console.log('Adding uq_event_sessions_event_context...');
      await client.query(`ALTER TABLE ssc."EventSessions" ADD CONSTRAINT uq_event_sessions_event_context UNIQUE ("eventSessionId", "eventId")`);
    }
    if (!sessConRes.rows.some(r => r.conname === 'uq_event_sessions_type_context')) {
      console.log('Adding uq_event_sessions_type_context...');
      await client.query(`ALTER TABLE ssc."EventSessions" ADD CONSTRAINT uq_event_sessions_type_context UNIQUE ("eventSessionId", "eventId", "sessionTypeCode")`);
    }

    // Check EventParticipants constraints
    const partConRes = await client.query(`
      SELECT conname FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON t.relnamespace = n.oid
      WHERE n.nspname = 'ssc' AND t.relname = 'EventParticipants'
    `);
    if (!partConRes.rows.some(r => r.conname === 'uq_event_participants_session_context')) {
      console.log('Adding uq_event_participants_session_context...');
      await client.query(`ALTER TABLE ssc."EventParticipants" ADD CONSTRAINT uq_event_participants_session_context UNIQUE ("eventParticipantId", "eventSessionId")`);
    }

    console.log('\n--- Step 2: Executing complete schema script ---');
    const sqlPath = path.resolve('scripts/SSC_Attendance_Schema_PostgreSQL.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    await client.query(sql);
    console.log('\n>>> SUCCESS! All 29 tables, views, triggers, and stored procedures are live! <<<');
  } catch (err: any) {
    console.error('\nError applying schema:', err.message);
    if (err.detail) console.error('Detail:', err.detail);
    if (err.hint) console.error('Hint:', err.hint);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
