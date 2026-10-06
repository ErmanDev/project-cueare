import pg from 'pg';

const pool = new pg.Pool({
  host: 'localhost',
  port: 5432,
  database: 'ssc',
  user: 'postgres',
  password: '@2020',
});

async function main() {
  const client = await pool.connect();
  try {
    const event = await client.query('SELECT * FROM ssc."Events" WHERE "eventId" = 2');
    console.log('Event 2:', event.rows[0]);
    const sessions = await client.query('SELECT * FROM ssc."EventSessions" WHERE "eventId" = 2');
    console.log('Event 2 Sessions:', sessions.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
