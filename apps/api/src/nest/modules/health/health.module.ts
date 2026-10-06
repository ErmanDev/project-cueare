import { Module } from '@nestjs/common';

import { HealthController } from './health.controller.ts';
import { HealthV2Controller } from './health-v2.controller.ts';
import { MetricsV2Controller } from './metrics-v2.controller.ts';
import { AuthGuard } from '../auth/api/auth.guard.ts';
import {
  DatabaseReadinessProbe,
  PostgresDatabaseReadinessProbe,
  ReadinessService,
} from './readiness.service.ts';

@Module({
  controllers: [HealthController, HealthV2Controller, MetricsV2Controller],
  providers: [
    AuthGuard,
    ReadinessService,
    { provide: DatabaseReadinessProbe, useClass: PostgresDatabaseReadinessProbe },
  ],
})
export class HealthModule {}
