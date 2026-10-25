import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { getPool } from '../db/pool.ts';

export interface KioskPresence {
  deviceCode: string;
  deviceName: string;
  location: string | null;
  status: 'ONLINE' | 'OFFLINE';
  lastPingAt: string;
  ipAddress: string;
}

interface ActiveKioskClient {
  deviceCode: string;
  deviceName: string;
  location: string | null;
  ws: WebSocket;
  isAlive: boolean;
  lastPingAt: Date;
  ipAddress: string;
}

const activeKiosks = new Map<string, ActiveKioskClient>();

export function initKioskWebSocketServer(httpServer: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '', `http://${request.headers.host}`);
    if (url.pathname === '/ws/kiosk') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', async (ws: WebSocket, req) => {
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    const deviceCode = url.searchParams.get('device_code') ?? 'UNKNOWN-KIOSK';
    const deviceName = url.searchParams.get('device_name') ?? deviceCode;
    const location = url.searchParams.get('location') ?? null;
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

    console.log(`[Native WS] Kiosk connected: ${deviceCode} from ${ipAddress}`);

    const client: ActiveKioskClient = {
      deviceCode,
      deviceName,
      location,
      ws,
      isAlive: true,
      lastPingAt: new Date(),
      ipAddress,
    };

    activeKiosks.set(deviceCode, client);
    await syncKioskStatusToDb(deviceCode, deviceName, location, ipAddress, new Date());

    ws.on('pong', () => {
      client.isAlive = true;
      client.lastPingAt = new Date();
      unawaited(syncKioskStatusToDb(deviceCode, deviceName, location, ipAddress, client.lastPingAt));
    });

    ws.on('message', (message: string) => {
      try {
        const payload = JSON.parse(message.toString()) as { type?: string };
        if (payload.type === 'PING' || payload.type === 'HEARTBEAT') {
          client.isAlive = true;
          client.lastPingAt = new Date();
          ws.send(JSON.stringify({ type: 'PONG', serverTime: new Date().toISOString() }));
          unawaited(syncKioskStatusToDb(deviceCode, deviceName, location, ipAddress, client.lastPingAt));
        }
      } catch {
        /* ignore non-json messages */
      }
    });

    ws.on('close', () => {
      console.log(`[Native WS] Kiosk disconnected: ${deviceCode}`);
      activeKiosks.delete(deviceCode);
    });
  });

  // 5-second Heartbeat Check Interval
  const heartbeatInterval = setInterval(() => {
    const now = new Date();
    for (const [code, client] of activeKiosks.entries()) {
      if (!client.isAlive) {
        console.warn(`[Native WS] Kiosk ${code} failed ping response. Marking OFFLINE.`);
        client.ws.terminate();
        activeKiosks.delete(code);
        continue;
      }
      client.isAlive = false;
      client.ws.ping();
    }
  }, 5000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  return wss;
}

export function getKioskPresenceList(): KioskPresence[] {
  const list: KioskPresence[] = [];
  const now = new Date().getTime();

  for (const client of activeKiosks.values()) {
    const isOnline = now - client.lastPingAt.getTime() < 12000;
    list.push({
      deviceCode: client.deviceCode,
      deviceName: client.deviceName,
      location: client.location,
      status: isOnline ? 'ONLINE' : 'OFFLINE',
      lastPingAt: client.lastPingAt.toISOString(),
      ipAddress: client.ipAddress,
    });
  }

  return list;
}

async function syncKioskStatusToDb(
  deviceCode: string,
  deviceName: string,
  location: string | null,
  ipAddress: string,
  lastPingAt: Date,
): Promise<void> {
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO "AttendanceDevices" ("deviceCode", "deviceName", "location", "lastHeartbeatAtUtc", "lastIpAddress")
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT ("deviceCode") DO UPDATE SET
         "deviceName" = EXCLUDED."deviceName",
         "location" = COALESCE(EXCLUDED."location", "AttendanceDevices"."location"),
         "lastHeartbeatAtUtc" = EXCLUDED."lastHeartbeatAtUtc",
         "lastIpAddress" = EXCLUDED."lastIpAddress"`,
      [deviceCode, deviceName, location, lastPingAt, ipAddress],
    );
  } catch (err) {
    console.error(`[Native WS] Failed to sync kiosk status for ${deviceCode}:`, err);
  }
}

function unawaited(promise: Promise<unknown>): void {
  promise.catch(() => {});
}
