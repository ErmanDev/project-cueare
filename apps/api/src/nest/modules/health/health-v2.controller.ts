import { Controller, Get, UseInterceptors } from '@nestjs/common';

import { getConfig, type ReleaseMetadata } from '../../../config.ts';
import { ApiResponseInterceptor } from '../../common/http/api-response.interceptor.ts';
import { ReadinessService, type ReadinessResult } from './readiness.service.ts';

type HealthResult = {
  status: 'ok';
  serverTime: string;
  release?: Partial<Record<keyof ReleaseMetadata, string>>;
};

@Controller('api/v2')
@UseInterceptors(ApiResponseInterceptor)
export class HealthV2Controller {
  constructor(private readonly readinessService: ReadinessService) {}

  @Get('health')
  health(): HealthResult {
    const configured = getConfig().release;
    const release = {
      ...(configured.version ? { version: configured.version } : {}),
      ...(configured.revision ? { revision: configured.revision } : {}),
    };
    return {
      status: 'ok',
      serverTime: new Date().toISOString(),
      ...(Object.keys(release).length ? { release } : {}),
    };
  }

  @Get('readiness')
  readiness(): Promise<ReadinessResult> {
    return this.readinessService.check();
  }
}
