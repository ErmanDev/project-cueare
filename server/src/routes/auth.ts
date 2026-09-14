import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { getConfig } from '../config.ts';
import { issueToken } from '../auth/jwt.ts';
import { requireAuth } from '../auth/middleware.ts';
import { hashPassword, verifyPassword, verifyStudentLoginPassword } from '../auth/password.ts';
import * as q from '../db/queries.ts';
import { getPool, withTransaction } from '../db/pool.ts';
import { enforceLimit, loginLimitKeys, type ServerRuntime } from '../infra/httpGuards.ts';
import { ROLES } from '../types.ts';
import { badRequest, methodNotAllowed, unauthorized } from '../utils/errors.ts';
import { jsonObject, requireString } from '../utils/http.ts';
import { studentAsUser, studentToApi, userToApi } from '../utils/serialize.ts';

export async function studentFromAuth(auth: { id: number; username: string }) {
  return (
    (await q.getStudentById(getPool(), auth.id)) ??
    (await q.getStudentByUserId(getPool(), auth.id)) ??
    (await q.getStudentByCode(getPool(), auth.username))
  );
}

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
    const runtime = req.app.locals.runtime as ServerRuntime | undefined;
    if (runtime?.rateLimitEnabled) {
      const keys = loginLimitKeys(req, username);
      enforceLimit(runtime.guards.loginIp, keys.ip);
      enforceLimit(runtime.guards.loginUser, keys.user);
    }
    const user = await q.getUserByUsername(getPool(), username);
    if (user) {
      if (!verifyPassword(password, user.password_hash)) {
        throw unauthorized('Invalid username or password');
      }
      const token = issueToken({
        id: user.id,
        username: user.username,
        role: user.role,
      });
      if (user.role === ROLES.student) {
        const student =
          (await q.getStudentByUserId(getPool(), user.id)) ??
          (await q.getStudentByCode(getPool(), user.username));
        res.json({
          token,
          role: ROLES.student,
          user: student ? studentAsUser(student) : userToApi(user),
          student: student ? studentToApi(student) : undefined,
          expires_in_hours: getConfig().jwtTtlHours,
        });
        return;
      }
      res.json({
        token,
        role: user.role,
        user: userToApi(user),
        expires_in_hours: getConfig().jwtTtlHours,
      });
      return;
    }

    const student = await q.getStudentByCode(getPool(), username.trim());
    if (!student || !verifyStudentLoginPassword(password, student.student_id_code)) {
      throw unauthorized('Invalid username or password');
    }
    const token = issueToken({
      id: student.id,
      username: student.student_id_code,
      role: ROLES.student,
    });
    res.json({
      token,
      role: ROLES.student,
      user: studentAsUser(student),
      student: studentToApi(student),
      expires_in_hours: getConfig().jwtTtlHours,
    });
  }),

  me: [
    requireAuth(new Set([ROLES.superadmin, ROLES.moderator, ROLES.student])),
    asyncHandler(async (req, res) => {
      if (req.method !== 'GET') throw methodNotAllowed();
      if (req.auth!.role === ROLES.student) {
        const student = await studentFromAuth(req.auth!);
        if (!student) throw unauthorized('User no longer exists');
        res.json({
          user: studentAsUser(student),
          role: ROLES.student,
          student: studentToApi(student),
        });
        return;
      }
      const user = await q.getUserById(getPool(), req.auth!.id);
      if (!user) throw unauthorized('User no longer exists');
      res.json({ user: userToApi(user), role: user.role });
    }),
  ],

  changePassword: [
    requireAuth(new Set([ROLES.student])),
    asyncHandler(async (req, res) => {
      if (req.method !== 'POST') throw methodNotAllowed();
      const body = jsonObject(req);
      const currentPassword = requireString(body, 'current_password');
      const newPassword = requireString(body, 'new_password');
      if (newPassword.length < 4) throw badRequest('Password must be at least 4 characters');
      const student = await studentFromAuth(req.auth!);
      if (!student) throw unauthorized('User no longer exists');
      const linked =
        (student.user_id ? await q.getUserById(getPool(), student.user_id) : null) ??
        (await q.getUserByUsername(getPool(), student.student_id_code));
      if (linked) {
        if (!verifyPassword(currentPassword, linked.password_hash)) {
          throw badRequest('Current password is incorrect');
        }
        await q.updateUser(getPool(), linked.id, { passwordHash: hashPassword(newPassword) });
        if (!student.user_id) await q.linkStudentToUser(getPool(), student.id, linked.id);
        res.json({ ok: true });
        return;
      }
      if (!verifyStudentLoginPassword(currentPassword, student.student_id_code)) {
        throw badRequest('Current password is incorrect');
      }
      await withTransaction(getPool(), async (db) => {
        const created = await q.insertUser(db, {
          name: student.full_name,
          username: student.student_id_code,
          passwordHash: hashPassword(newPassword),
          role: ROLES.student,
        });
        await q.linkStudentToUser(db, student.id, created.id);
      });
      res.json({ ok: true });
    }),
  ],
};
