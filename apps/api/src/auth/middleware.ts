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
    const headerVal = Array.isArray(header) ? header[0] : header;
    let tokenStr: string | undefined;

    if (headerVal && headerVal.toLowerCase().startsWith('bearer ')) {
      tokenStr = headerVal.slice(7).trim();
    } else if (typeof req.query.token === 'string' && req.query.token) {
      tokenStr = req.query.token.trim();
    } else if (typeof req.query.access_token === 'string' && req.query.access_token) {
      tokenStr = req.query.access_token.trim();
    }

    if (!tokenStr) {
      next(unauthorized('Missing or malformed Authorization header or token query param'));
      return;
    }
    const user = verifyToken(tokenStr);
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
