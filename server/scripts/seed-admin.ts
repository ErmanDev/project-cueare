import { getConfig } from '../src/config.ts';
import { hashPassword } from '../src/auth/password.ts';
import { createPool, ensureSchema } from '../src/db/pool.ts';
import * as q from '../src/db/queries.ts';
import { ROLES } from '../src/types.ts';

async function main(): Promise<void> {
  const username = process.argv[2] ?? 'admin';
  const password = process.argv[3] ?? 'changeme123';
  const config = getConfig();
  console.log(`Connecting to PostgreSQL: ${config.database.user}@${config.database.host}:${config.database.port}/${config.database.name}`);

  const pool = createPool(config.database);
  try {
    await ensureSchema(pool);
    const existing = await q.getUserByUsernameExact(pool, username);
    if (!existing) {
      await q.insertUser(pool, {
        name: 'Super Admin',
        username,
        passwordHash: hashPassword(password),
        role: ROLES.superadmin,
      });
      console.log(`Superadmin created: username=${username} password=${password}`);
    } else {
      await q.updateUser(pool, existing.id, {
        passwordHash: hashPassword(password),
        role: ROLES.superadmin,
      });
      console.log(`Superadmin "${username}" already existed — password reset to: ${password}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
