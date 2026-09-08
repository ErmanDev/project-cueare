import { createApp } from './app.ts';
import { getConfig } from './config.ts';
import { ensureSchema, getPool, poolDisplay } from './db/pool.ts';
import { resolveWebDist } from './web.ts';

async function main(): Promise<void> {
  const config = getConfig();
  await ensureSchema(getPool());
  const app = createApp();
  const webDir = resolveWebDist();
  app.listen(config.port, '0.0.0.0', () => {
    console.log(`SSC QR Attendance listening on 0.0.0.0:${config.port}`);
    if (webDir) {
      console.log(`Web app:     http://localhost:${config.port}/`);
    } else {
      console.log(`Web app:     not built yet — run npm run build:web`);
    }
    console.log(`REST API:    http://localhost:${config.port}/api`);
    console.log(`Swagger UI:  http://localhost:${config.port}/docs`);
    console.log(`Database: ${poolDisplay()}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
