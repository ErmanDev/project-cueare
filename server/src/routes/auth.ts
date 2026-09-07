import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { getConfig } from '../config.ts';
import { issueToken } from '../auth/jwt.ts';
import { requireAuth } from '../auth/middleware.ts';
import { verifyPassword } from '../auth/password.ts';
import * as q from '../db/queries.ts';
import { getPool } from '../db/pool.ts';
import { ROLES } from '../types.ts';
import { methodNotAllowed, unauthorized } from '../utils/errors.ts';
import { jsonObject, requireString } from '../utils/http.ts';
import { userToApi } from '../utils/serialize.ts';

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export const authRouter = {
  login: asyncHandler(async (req, res) => {
    if (req.method !== 'POST') throw methodNotAllowed();
    const body = jsonObject(req);
    const username = requireString(body, 'username');
    const password = requireString(body, 'password');
    const user = await q.getUserByUsername(getPool(), username);
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw unauthorized('Invalid username or password');
    }
    const token = issueToken({
      id: user.id,
      username: user.username,
      role: user.role,
    });
    res.json({
      token,
      role: user.role,
      user: userToApi(user),
      expires_in_hours: getConfig().jwtTtlHours,
    });
  }),

  me: [
    requireAuth(new Set([ROLES.superadmin, ROLES.moderator])),
    asyncHandler(async (req, res) => {
      if (req.method !== 'GET') throw methodNotAllowed();
      const user = await q.getUserById(getPool(), req.auth!.id);
      if (!user) throw unauthorized('User no longer exists');
      res.json({ user: userToApi(user), role: user.role });
    }),
  ],
};
