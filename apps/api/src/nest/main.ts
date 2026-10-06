import { getConfig } from '../config.ts';
import { prepareDatabaseForApplication } from '../db/migration-runner.ts';
import { closePool, getPool, poolDisplay } from '../db/pool.ts';
import { initKioskWebSocketServer } from '../realtime/kiosk_ws.ts';
import { initSocketServer } from '../realtime/socket_server.ts';
import { resolveWebDist } from '../web.ts';
import { createMigrationHost } from './compatibility/create-migration-host.ts';

async function main(): Promise<void> {
  const config = getConfig();
  await prepareDatabaseForApplication(getPool());

  const { nestApp, httpServer } = await createMigrationHost();

  // Keep both existing real-time protocols on the same listener during migration.
  initSocketServer(httpServer);
  initKioskWebSocketServer(httpServer);

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(config.port, config.listenHost, resolve);
  });

  let shutdownPromise: Promise<void> | undefined;
  const shutdown = (): Promise<void> => (shutdownPromise ??= (async () => {
    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => (error ? reject(error) : resolve()));
    });
    await nestApp.close();
    await closePool();
  })());
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());

  const webDir = resolveWebDist();
  console.log(`SSC QR Attendance (Nest migration) listening on ${config.listenHost}:${config.port}`);
  console.log(
    webDir
      ? `Web app:     http://127.0.0.1:${config.port}/`
      : 'Web app:     not built yet — run bun run build:web',
  );
  console.log(`REST API:    http://127.0.0.1:${config.port}/api`);
  console.log(`Socket.IO:   ws://127.0.0.1:${config.port}/socket.io`);
  console.log(`Kiosk WS:    ws://127.0.0.1:${config.port}/ws/kiosk`);
  console.log(`Swagger UI:  http://127.0.0.1:${config.port}/docs`);
  console.log(`Database:    ${poolDisplay()}`);
  console.log(
    `Release:     ${config.release.version ?? 'unversioned'} (${config.release.revision ?? 'unknown revision'})`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
