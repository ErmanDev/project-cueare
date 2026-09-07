import type { RequestHandler } from 'express';

import { forbidden, unauthorized } from '../utils/errors.ts';
import { verifyToken } from './jwt.ts';

declare global {
  namespace Express {
    interface Request {
      auth?: { id: number; username: string; role: string };
    }
  }
}

export function requireAuth(allowedRoles: Set<string>): RequestHandler {
  return (req, _res, next) => {
    const header = req.headers.authorization ?? req.headers.Authorization;
    const value = Array.isArray(header) ? header[0] : header;
    if (!value || !value.toLowerCase().startsWith('bearer ')) {
      next(unauthorized('Missing or malformed Authorization header'));
      return;
    }
    const user = verifyToken(value.slice(7).trim());
    if (!user) {
      next(unauthorized('Invalid or expired token'));
      return;
    }
    if (!allowedRoles.has(user.role)) {
      next(forbidden(`Forbidden for role ${user.role}`));
      return;
    }
    req.auth = user;
    next();
  };
}
