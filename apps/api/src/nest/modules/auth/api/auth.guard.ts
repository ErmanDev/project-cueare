import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { verifyToken } from '../../../../auth/jwt.ts';
import type { AuthUser, Role } from '../../../../types.ts';
import { forbidden, unauthorized } from '../../../../utils/errors.ts';

const AUTH_ROLES = 'auth.roles';

export const Roles = (...roles: Role[]) => SetMetadata(AUTH_ROLES, roles);

export type AuthenticatedRequest = Request & { auth: AuthUser; requestId?: string };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.tokenFrom(request);
    if (!token) {
      throw unauthorized('Missing or malformed Authorization header or token query param');
    }
    const user = verifyToken(token);
    if (!user) throw unauthorized('Invalid or expired token');

    const allowed = this.reflector.getAllAndOverride<Role[]>(AUTH_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowed && !allowed.includes(user.role as Role)) {
      throw forbidden(`Forbidden for role ${user.role}`);
    }
    request.auth = user;
    return true;
  }

  private tokenFrom(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (header?.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
    if (typeof request.query.token === 'string' && request.query.token) {
      return request.query.token.trim();
    }
    if (typeof request.query.access_token === 'string' && request.query.access_token) {
      return request.query.access_token.trim();
    }
    return undefined;
  }
}
