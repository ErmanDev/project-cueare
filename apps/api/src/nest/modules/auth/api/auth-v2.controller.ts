import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';

import { clientIp } from '../../../../infra/rateLimit.ts';
import { ROLES } from '../../../../types.ts';
import { ApiResponseInterceptor } from '../../../common/http/api-response.interceptor.ts';
import { AuthService } from '../application/auth.service.ts';
import { AuthGuard, type AuthenticatedRequest, Roles } from './auth.guard.ts';
import { bodyObject, requiredString } from './auth.contract.ts';

@Controller('api/v2/auth')
@UseInterceptors(ApiResponseInterceptor)
export class AuthV2Controller {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() rawBody: unknown, @Req() request: Request): Promise<Record<string, unknown>> {
    const body = bodyObject(rawBody);
    return this.authService.login(
      requiredString(body, 'username'),
      requiredString(body, 'password'),
      { ip: clientIp(request) },
    );
  }

  @Get('me')
  @Roles(ROLES.superadmin, ROLES.moderator, ROLES.student)
  @UseGuards(AuthGuard)
  me(@Req() request: AuthenticatedRequest): Promise<Record<string, unknown>> {
    return this.authService.me(request.auth);
  }

  @Post('change-password')
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
