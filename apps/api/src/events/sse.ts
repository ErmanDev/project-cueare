import type { Request, Response } from 'express';

interface Client {
  id: string;
  sessionWindowId: number;
  res: Response;
}

const clients = new Set<Client>();

export function subscribeQrScanStream(req: Request, res: Response, sessionWindowId: number): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const clientId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const client: Client = { id: clientId, sessionWindowId, res };

  clients.add(client);

  // Initial heartbeat
  try {
    res.write(`event: connected\ndata: ${JSON.stringify({ clientId, sessionWindowId })}\n\n`);
    (res as unknown as { flush?: () => void }).flush?.();
  } catch {
    clients.delete(client);
    return;
  }

  // Heartbeat every 20 seconds to keep connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
      (res as unknown as { flush?: () => void }).flush?.();
    } catch {
      clearInterval(heartbeat);
      clients.delete(client);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(client);
  });
}

export function broadcastQrScanEvent(sessionWindowId: number | string, payload: Record<string, unknown>): void {
  const targetId = String(sessionWindowId);
  for (const client of clients) {
    if (String(client.sessionWindowId) === targetId) {
      try {
        client.res.write(`event: qr_scanned\ndata: ${JSON.stringify(payload)}\n\n`);
        (client.res as unknown as { flush?: () => void }).flush?.();
      } catch {
        clients.delete(client);
      }
    }
  }
}
