import {
  Controller,
  Get,
  Query,
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
import { StudentService } from '../application/student.service.ts';

function positiveInt(raw: string | undefined, fallback: number, maximum: number): number {
  if (raw == null || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) throw badRequest('Pagination values must be positive integers');
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw badRequest(`Pagination value must be between 1 and ${maximum}`);
  }
  return value;
}

@Controller('api/v2/student')
@Roles(ROLES.student)
@UseGuards(AuthGuard)
@UseInterceptors(ApiResponseInterceptor)
export class StudentController {
  constructor(private readonly students: StudentService) {}

  @Get('profile')
  profile(@Req() request: AuthenticatedRequest) {
    return this.students.profile(request.auth);
  }

  @Get('events')
  events(@Req() request: AuthenticatedRequest) {
    return this.students.events(request.auth);
  }

  @Get('fines')
  fines(
    @Req() request: AuthenticatedRequest,
    @Query('page') rawPage?: string,
    @Query('pageSize') rawPageSize?: string,
  ) {
    return this.students.fines(
      request.auth,
      positiveInt(rawPage, 1, 1_000_000),
      positiveInt(rawPageSize, 20, 100),
    );
  }

  @Get('attendance')
  attendance(
    @Req() request: AuthenticatedRequest,
    @Query('page') rawPage?: string,
    @Query('pageSize') rawPageSize?: string,
  ) {
    return this.students.attendance(
      request.auth,
      positiveInt(rawPage, 1, 1_000_000),
      positiveInt(rawPageSize, 20, 100),
    );
  }
}
