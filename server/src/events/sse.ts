import type { Request, Response } from 'express';

interface Client {
  id: string;
  sessionWindowId: number;
  res: Response;
}

const clients = new Set<Client>();

export function subscribeQrScanStream(req: Request, res: Response, sessionWindowId: number): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const clientId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const client: Client = { id: clientId, sessionWindowId, res };

  clients.add(client);

  // Initial heartbeat
  res.write(`event: connected\ndata: ${JSON.stringify({ clientId, sessionWindowId })}\n\n`);

  // Heartbeat every 25 seconds to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(client);
  });
}

export function broadcastQrScanEvent(sessionWindowId: number, payload: Record<string, unknown>): void {
  for (const client of clients) {
    if (client.sessionWindowId === sessionWindowId) {
      try {
        client.res.write(`event: qr_scanned\ndata: ${JSON.stringify(payload)}\n\n`);
      } catch {
        clients.delete(client);
      }
    }
  }
}
