import { createApp } from './app.ts';
import { getConfig } from './config.ts';
import { ensureSchema, getPool, poolDisplay } from './db/pool.ts';

async function main(): Promise<void> {
  const config = getConfig();
  await ensureSchema(getPool());
  const app = createApp();
  app.listen(config.port, '0.0.0.0', () => {
    console.log(`SSC QR Attendance API listening on 0.0.0.0:${config.port}`);
    console.log(`Swagger UI: http://localhost:${config.port}/docs`);
    console.log(`Database: ${poolDisplay()}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
