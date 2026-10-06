import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { Request } from 'express';

import { getConfig } from '../../../../config.ts';
import { createHttpGuards, enforceLimit } from '../../../../infra/httpGuards.ts';
import { clientIp } from '../../../../infra/rateLimit.ts';
import type { AuthenticatedRequest } from '../../auth/api/auth.guard.ts';

@Injectable()
export class AttendanceRateLimits {
  private readonly tuning = getConfig().rateLimit;
  private readonly guards = createHttpGuards(this.tuning);

  preview(request: Request): void {
    if (!this.tuning.enabled) return;
    const auth = (request as Partial<AuthenticatedRequest>).auth;
    enforceLimit(this.guards.scanPreview, `user:${auth?.id ?? clientIp(request)}`);
  }

  write(request: Request): void {
    if (!this.tuning.enabled) return;
    const auth = (request as Partial<AuthenticatedRequest>).auth;
    enforceLimit(this.guards.scanWrite, `user:${auth?.id ?? clientIp(request)}`);
  }
}

@Injectable()
export class AttendancePreviewRateLimitGuard implements CanActivate {
  constructor(private readonly limits: AttendanceRateLimits) {}

  canActivate(context: ExecutionContext): boolean {
    this.limits.preview(context.switchToHttp().getRequest<Request>());
    return true;
  }
}

@Injectable()
export class AttendanceWriteRateLimitGuard implements CanActivate {
  constructor(private readonly limits: AttendanceRateLimits) {}

  canActivate(context: ExecutionContext): boolean {
    this.limits.write(context.switchToHttp().getRequest<Request>());
    return true;
  }
}
