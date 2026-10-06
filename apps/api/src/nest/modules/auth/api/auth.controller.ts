import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

import { clientIp } from '../../../../infra/rateLimit.ts';
import { ROLES } from '../../../../types.ts';
import { AuthService } from '../application/auth.service.ts';
import { AuthGuard, type AuthenticatedRequest, Roles } from './auth.guard.ts';
import { bodyObject, requiredString } from './auth.contract.ts';

const AUTH_PREFIXES = ['auth', 'api/auth', 'api/v1/auth', 'v1/auth'] as const;
const routes = (suffix: string) => AUTH_PREFIXES.map((prefix) => `${prefix}/${suffix}`);

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post(routes('login'))
  @HttpCode(200)
  login(@Body() rawBody: unknown, @Req() request: Request): Promise<Record<string, unknown>> {
    const body = bodyObject(rawBody);
    return this.authService.login(
      requiredString(body, 'username'),
      requiredString(body, 'password'),
      { ip: clientIp(request) },
    );
  }

  @Get(routes('me'))
  @Roles(ROLES.superadmin, ROLES.moderator, ROLES.student)
  @UseGuards(AuthGuard)
  me(@Req() request: AuthenticatedRequest): Promise<Record<string, unknown>> {
    return this.authService.me(request.auth);
  }

  @Post(routes('change-password'))
  @HttpCode(200)
  @Roles(ROLES.student)
  @UseGuards(AuthGuard)
  changePassword(
    @Body() rawBody: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ ok: true }> {
    const body = bodyObject(rawBody);
    return this.authService.changePassword(
      request.auth,
      requiredString(body, 'current_password'),
      requiredString(body, 'new_password'),
    );
  }
}
