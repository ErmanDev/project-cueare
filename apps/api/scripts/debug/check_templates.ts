import pg from 'pg';

const pool = new pg.Pool({
  host: process.env.DATABASE_HOST || 'localhost',
  port: Number(process.env.DATABASE_PORT || 5432),
  database: process.env.DATABASE_NAME || 'ssc',
  user: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || '@2020',
});

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT "finePolicyTemplateId", "templateCode", "templateName", "isActive"
      FROM ssc."FinePolicyTemplates"
      ORDER BY "finePolicyTemplateId" ASC
    `);
    console.log('Live Database Templates:');
    console.table(res.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
