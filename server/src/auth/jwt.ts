import jwt from 'jsonwebtoken';

import { getConfig } from '../config.ts';
import { ROLES, type AuthUser } from '../types.ts';

const ISSUER = 'ssc-qr-attendance';

export function isValidRole(role: string | null | undefined): boolean {
  return role === ROLES.superadmin || role === ROLES.moderator || role === ROLES.student;
}

export function issueToken(user: { id: number; username: string; role: string }): string {
  const config = getConfig();
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role,
    },
    config.jwtSecret,
    {
      algorithm: 'HS256',
      issuer: ISSUER,
      expiresIn: `${config.jwtTtlHours}h`,
    },
  );
}

export function verifyToken(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, getConfig().jwtSecret, {
      algorithms: ['HS256'],
      issuer: ISSUER,
    });
    if (typeof payload !== 'object' || payload == null) return null;
    const sub = (payload as jwt.JwtPayload).sub;
    const id = typeof sub === 'number' ? sub : Number.parseInt(String(sub ?? ''), 10);
    const role = (payload as jwt.JwtPayload).role as string | undefined;
    if (!Number.isFinite(id) || !isValidRole(role)) return null;
    return {
      id,
      username: String((payload as jwt.JwtPayload).username ?? ''),
      role: role!,
    };
  } catch {
    return null;
  }
}
