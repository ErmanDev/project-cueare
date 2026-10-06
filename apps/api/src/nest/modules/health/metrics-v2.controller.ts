import { Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common';

import { getPoolMetrics } from '../../../db/pool.ts';
import { httpMetrics } from '../../../infra/http-observability.ts';
import { ROLES } from '../../../types.ts';
import { ApiResponseInterceptor } from '../../common/http/api-response.interceptor.ts';
import { AuthGuard, Roles } from '../auth/api/auth.guard.ts';

@Controller('api/v2')
@UseInterceptors(ApiResponseInterceptor)
export class MetricsV2Controller {
  @Get('metrics')
  @Roles(ROLES.superadmin)
  @UseGuards(AuthGuard)
  metrics() {
    return {
      http: httpMetrics.snapshot(),
      database: getPoolMetrics(),
    };
  }
}
