import crypto from 'node:crypto';

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import { ROLES } from '../../../../types.ts';
import { badRequest } from '../../../../utils/errors.ts';
import { ApiResponseInterceptor } from '../../../common/http/api-response.interceptor.ts';
import {
  AuthGuard,
  type AuthenticatedRequest,
  Roles,
} from '../../auth/api/auth.guard.ts';
import { EventService } from '../application/event.service.ts';
import { CreateEventDto, UpdateEventDto } from './event.dto.ts';

function eventId(raw: string): number {
  if (!/^\d+$/.test(raw)) throw badRequest('Event id must be a positive integer');
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw badRequest('Event id must be a positive integer');
  }
  return value;
}

function requestId(request: AuthenticatedRequest): string {
  return request.requestId ?? crypto.randomUUID();
}

@Controller('api/v2/admin/events')
@Roles(ROLES.superadmin)
@UseGuards(AuthGuard)
@UseInterceptors(ApiResponseInterceptor)
export class EventsController {
  constructor(private readonly events: EventService) {}

  @Get()
  list() {
    return this.events.list();
  }

  @Get(':id')
  get(@Param('id') rawId: string) {
    return this.events.get(eventId(rawId));
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.events.create(CreateEventDto.parse(body), request.auth, requestId(request));
  }

  @Put(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id') rawId: string,
    @Body() body: unknown,
  ) {
    return this.events.update(
      eventId(rawId),
      UpdateEventDto.parse(body),
      request.auth,
      requestId(request),
    );
  }
}
