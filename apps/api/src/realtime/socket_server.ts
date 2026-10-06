import type { Server as HttpServer } from 'node:http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { getConfig } from '../config.ts';
import { CORS_METHODS, corsOriginSetting } from '../infra/http-security.ts';

export interface AuthenticatedSocket extends Socket {
  user?: {
    id: number;
    username: string;
    role: string;
  };
}

export interface AnnouncementPayload {
  announcementId: number;
  eventId: number;
  title: string;
  message: string;
  level: 'INFO' | 'WARNING' | 'URGENT';
  postedByName?: string;
  createdAtUtc: string;
}

let ioInstance: Server | null = null;

export function initSocketServer(httpServer: HttpServer): Server {
  const config = getConfig();
  const io = new Server(httpServer, {
    cors: {
      origin: corsOriginSetting(config.cors),
      methods: CORS_METHODS,
    },
    path: '/socket.io',
  });

  // JWT Authentication middleware
  io.use((socket: AuthenticatedSocket, next) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ||
      (socket.handshake.query?.token as string | undefined);

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    try {
      const decoded = jwt.verify(token, config.jwtSecret) as {
        id: number;
        sub?: number;
        username?: string;
        role?: string;
      };
      socket.user = {
        id: decoded.id ?? decoded.sub ?? 0,
        username: decoded.username ?? '',
        role: decoded.role ?? 'STUDENT',
      };
      next();
    } catch {
      next(new Error('Invalid or expired authentication token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id} (User ID: ${socket.user?.id})`);

    // Join room for specific event (e.g., room:event_15)
    socket.on('join_event_room', (eventId: number | string) => {
      const roomName = `room:event_${eventId}`;
      socket.join(roomName);
      console.log(`[Socket.IO] ${socket.id} joined ${roomName}`);
    });

    socket.on('leave_event_room', (eventId: number | string) => {
      const roomName = `room:event_${eventId}`;
      socket.leave(roomName);
      console.log(`[Socket.IO] ${socket.id} left ${roomName}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });

  ioInstance = io;
  return io;
}

export function getSocketServer(): Server | null {
  return ioInstance;
}

export function broadcastEventAnnouncement(eventId: number, payload: AnnouncementPayload): void {
  if (!ioInstance) return;
  const roomName = `room:event_${eventId}`;
  ioInstance.to(roomName).emit('event_announcement', payload);
  console.log(`[Socket.IO] Broadcasted announcement to ${roomName}:`, payload.title);
}
