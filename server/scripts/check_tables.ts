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
  try {
    const res = await pool.query(`
      SELECT table_schema, table_name, table_type 
      FROM information_schema.tables 
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name
    `);
    
    console.log('=== LIVE TABLES & VIEWS (' + res.rows.length + ') ===');
    for (const r of res.rows) {
      console.log(`[${r.table_schema}] ${r.table_name} (${r.table_type})`);
    }

    const sqlPath = path.resolve('scripts/SSC_Attendance_Schema_PostgreSQL.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf-8');
    const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-zA-Z0-9_]+)"?/gi;
    const sqlTables: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = tableRegex.exec(sqlContent)) !== null) {
      if (!sqlTables.includes(m[1])) {
        sqlTables.push(m[1]);
      }
    }

    const viewRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+"?([a-zA-Z0-9_]+)"?/gi;
    const sqlViews: string[] = [];
    while ((m = viewRegex.exec(sqlContent)) !== null) {
      if (!sqlViews.includes(m[1])) {
        sqlViews.push(m[1]);
      }
    }

    console.log('\n=== SQL FILE DEFINED TABLES (' + sqlTables.length + ') ===');
    console.log(sqlTables.join(', '));

    console.log('\n=== SQL FILE DEFINED VIEWS (' + sqlViews.length + ') ===');
    console.log(sqlViews.join(', '));

    const liveTables = res.rows.filter(r => r.table_type === 'BASE TABLE').map(r => r.table_name);
    const liveViews = res.rows.filter(r => r.table_type === 'VIEW').map(r => r.table_name);

    const missingTables = sqlTables.filter(t => 
      !liveTables.some(lt => lt.toLowerCase() === t.toLowerCase())
    );

    const missingViews = sqlViews.filter(v => 
      !liveViews.some(lv => lv.toLowerCase() === v.toLowerCase())
    );

    console.log('\n=== MISSING TABLES IN LIVE DB (' + missingTables.length + ') ===');
    if (missingTables.length > 0) {
      missingTables.forEach(t => console.log('MISSING TABLE: ' + t));
    } else {
      console.log('None! All defined tables exist in live DB.');
    }

    console.log('\n=== MISSING VIEWS IN LIVE DB (' + missingViews.length + ') ===');
    if (missingViews.length > 0) {
      missingViews.forEach(v => console.log('MISSING VIEW: ' + v));
    } else {
      console.log('None! All defined views exist in live DB.');
    }

    // Check extra tables in live DB not in SQL
    const extraTables = liveTables.filter(lt => 
      !sqlTables.some(st => st.toLowerCase() === lt.toLowerCase())
    );
    console.log('\n=== EXTRA TABLES IN LIVE DB NOT IN SQL (' + extraTables.length + ') ===');
    if (extraTables.length > 0) {
      extraTables.forEach(t => console.log('EXTRA TABLE: ' + t));
    } else {
      console.log('None.');
    }

  } catch (err: any) {
    console.error('Database connection error:', err.message);
  } finally {
    await pool.end();
  }
}

run();
