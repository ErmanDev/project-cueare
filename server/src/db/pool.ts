import pg from 'pg';

import { databaseDisplay, getConfig, type DatabaseConfig } from '../config.ts';
import { schemaStatements } from './schema.ts';

const { Pool, types } = pg;

// Drift used 64-bit identity columns; node-pg otherwise returns them as strings,
// which breaks Flutter's `json['id'] as int`.
types.setTypeParser(types.builtins.INT8, (value) => Number.parseInt(value, 10));
types.setTypeParser(types.builtins.INT4, (value) => Number.parseInt(value, 10));

function assertIdent(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return name;
}

export function createPool(config: DatabaseConfig = getConfig().database, schema = 'ssc') {
  const schemaName = assertIdent(schema);
  const pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.name,
    user: config.user,
    password: config.password,
    ssl: false,
    max: 10,
  });

  const originalConnect = pool.connect.bind(pool) as typeof pool.connect;
  pool.connect = ((cb?: Parameters<pg.Pool['connect']>[0]) => {
    if (cb) {
      return originalConnect((err, client, done) => {
        if (err || !client) {
          cb(err, client, done);
          return;
        }
        client
          .query(`SET search_path TO ${schemaName}`)
          .then(() => cb(undefined, client, done))
          .catch((e: unknown) => {
            done();
            cb(e instanceof Error ? e : new Error(String(e)), undefined, done);
          });
      });
    }
    return originalConnect().then(async (client) => {
      try {
        await client.query(`SET search_path TO ${schemaName}`);
        return client;
      } catch (e) {
        client.release();
        throw e;
      }
    });
  }) as pg.Pool['connect'];

  return pool;
}

let shared: pg.Pool | undefined;

export function getPool(): pg.Pool {
  return (shared ??= createPool());
}

export async function ensureSchema(
  pool: pg.Pool = getPool(),
  schema = 'ssc',
): Promise<void> {
  const client = await pool.connect();
  try {
    for (const sql of schemaStatements(schema)) {
      await client.query(sql);
    }
  } finally {
    client.release();
  }
}

export function poolDisplay(): string {
  return databaseDisplay(getConfig().database);
}

export async function withTransaction<T>(
  pool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    throw e;
  } finally {
    client.release();
  }
}
