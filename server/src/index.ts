import { createApp } from './app.ts';
import { getConfig } from './config.ts';
import { ensureSchema, getPool, poolDisplay } from './db/pool.ts';
import { resolveWebDist } from './web.ts';

async function main(): Promise<void> {
  const config = getConfig();
  await ensureSchema(getPool());
  const app = createApp();
  const webDir = resolveWebDist();
  app.listen(config.port, config.listenHost, () => {
    console.log(`SSC QR Attendance listening on ${config.listenHost}:${config.port}`);
    if (webDir) {
      console.log(`Web app:     http://127.0.0.1:${config.port}/`);
    } else {
      console.log(`Web app:     not built yet — run bun run build:web`);
    }
    console.log(`REST API:    http://127.0.0.1:${config.port}/api`);
    console.log(`Swagger UI:  http://127.0.0.1:${config.port}/docs`);
    console.log(`Public URL:  IIS site host name (see plan/IIS_SETUP.md)`);
    console.log(`Database: ${poolDisplay()}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
