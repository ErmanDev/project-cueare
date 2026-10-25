import http from 'node:http';
import { createApp } from './app.ts';
import { getConfig } from './config.ts';
import { ensureSchema, getPool, poolDisplay } from './db/pool.ts';
import { resolveWebDist } from './web.ts';
import { initSocketServer } from './realtime/socket_server.ts';
import { initKioskWebSocketServer } from './realtime/kiosk_ws.ts';

async function main(): Promise<void> {
  const config = getConfig();
  await ensureSchema(getPool());
  const app = createApp();
  const httpServer = http.createServer(app);

  // Initialize Socket.IO & Native WebSockets
  initSocketServer(httpServer);
  initKioskWebSocketServer(httpServer);

  const webDir = resolveWebDist();
  httpServer.listen(config.port, config.listenHost, () => {
    console.log(`SSC QR Attendance listening on ${config.listenHost}:${config.port}`);
    if (webDir) {
      console.log(`Web app:     http://127.0.0.1:${config.port}/`);
    } else {
      console.log(`Web app:     not built yet — run bun run build:web`);
    }
    console.log(`REST API:    http://127.0.0.1:${config.port}/api`);
    console.log(`Socket.IO:   ws://127.0.0.1:${config.port}/socket.io`);
    console.log(`Kiosk WS:    ws://127.0.0.1:${config.port}/ws/kiosk`);
    console.log(`Swagger UI:  http://127.0.0.1:${config.port}/docs`);
    console.log(`Database:    ${poolDisplay()}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
