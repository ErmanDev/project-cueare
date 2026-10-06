import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import { AttendanceService, previewToApi } from '../../../../attendance/service.ts';
import { ROLES } from '../../../../types.ts';
import { badRequest } from '../../../../utils/errors.ts';
import { optionalInt, optionalString, requireInt } from '../../../../utils/http.ts';
import { attendanceToApi } from '../../../../utils/serialize.ts';
import { ApiResponseInterceptor } from '../../../common/http/api-response.interceptor.ts';
import {
  AuthGuard,
  type AuthenticatedRequest,
  Roles,
} from '../../auth/api/auth.guard.ts';
import {
  AttendancePreviewRateLimitGuard,
  AttendanceWriteRateLimitGuard,
} from './attendance-rate-limit.guard.ts';

function objectBody(body: unknown): Record<string, unknown> {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  throw badRequest('Request body must be a JSON object');
}

function optionalIdempotencyKey(raw: string | undefined): string | undefined {
  if (raw == null) return undefined;
  const key = raw.trim();
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(key)) {
    throw badRequest(
      'Idempotency-Key must be 1-128 characters using letters, numbers, dot, underscore, colon, or hyphen.',
      { code: 'INVALID_IDEMPOTENCY_KEY' },
    );
  }
  return key;
}

@Controller('api/v2/attendance/scan')
@Roles(ROLES.superadmin, ROLES.moderator)
@UseInterceptors(ApiResponseInterceptor)
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post('preview')
  @HttpCode(200)
  @UseGuards(AuthGuard, AttendancePreviewRateLimitGuard)
  async preview(@Body() rawBody: unknown) {
    const body = objectBody(rawBody);
    const payload =
      optionalString(body, 'student_id_code') ?? optionalString(body, 'qr_payload');
    if (!payload) throw badRequest('student_id_code is required');
    const preview = await this.attendance.preview({
      eventId: requireInt(body, 'event_id'),
      qrPayload: payload,
      sessionWindowId: optionalInt(body, 'session_window_id'),
    });
    return previewToApi(preview);
  }

  @Post('confirm')
  @HttpCode(201)
  @UseGuards(AuthGuard, AttendanceWriteRateLimitGuard)
  async confirm(
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') rawIdempotencyKey: string | undefined,
    @Body() rawBody: unknown,
  ) {
    const body = objectBody(rawBody);
    const record = await this.attendance.confirm({
      eventId: requireInt(body, 'event_id'),
      studentId: requireInt(body, 'student_id'),
      sessionWindowId: requireInt(body, 'session_window_id'),
      scannedBy: request.auth.id,
      expectedDirection: optionalString(body, 'direction'),
      deviceNote: optionalString(body, 'device_note'),
      idempotencyKey: optionalIdempotencyKey(rawIdempotencyKey),
      requestId: request.requestId,
    });
    return attendanceToApi(record);
  }
}
