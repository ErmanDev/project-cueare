import type { DynamicModule, Provider } from '@nestjs/common';
import { Module } from '@nestjs/common';

import { AttendanceCatalog } from '../../../attendance/catalog.ts';
import { AttendanceService } from '../../../attendance/service.ts';
import { getConfig } from '../../../config.ts';
import { getPool } from '../../../db/pool.ts';
import { ScanWriteQueue } from '../../../infra/queue.ts';
import { AuthGuard } from '../auth/api/auth.guard.ts';
import {
  AttendancePreviewRateLimitGuard,
  AttendanceRateLimits,
  AttendanceWriteRateLimitGuard,
} from './api/attendance-rate-limit.guard.ts';
import { AttendanceController } from './api/attendance.controller.ts';
import { ConfirmAttendanceUseCase } from './application/confirm-attendance.use-case.ts';
import { AttendanceConfirmationUnitOfWork } from './application/ports/attendance-confirmation.uow.ts';
import { AttendancePreviewReader } from './application/ports/attendance-preview.reader.ts';
import { AttendanceWindowRepository } from './application/ports/attendance-window.repository.ts';
import { PreviewAttendanceUseCase } from './application/preview-attendance.use-case.ts';
import { ResolveAttendanceWindowUseCase } from './application/resolve-attendance-window.use-case.ts';
import { PostgresAttendanceConfirmationUnitOfWork } from './infrastructure/postgres-attendance-confirmation.uow.ts';
import { IdempotencyMaintenanceService } from './infrastructure/idempotency-maintenance.service.ts';
import { PostgresAttendancePreviewReader } from './infrastructure/postgres-attendance-preview.reader.ts';
import { PostgresAttendanceWindowRepository } from './infrastructure/postgres-attendance-window.repository.ts';

function productionProviders(): Provider[] {
  return [
    {
      provide: AttendanceCatalog,
      useFactory: () => new AttendanceCatalog(getPool(), getConfig().runtime),
    },
    {
      provide: AttendanceWindowRepository,
      inject: [AttendanceCatalog],
      useFactory: (catalog: AttendanceCatalog) =>
        new PostgresAttendanceWindowRepository(getPool(), catalog),
    },
    {
      provide: AttendancePreviewReader,
      useFactory: () => new PostgresAttendancePreviewReader(getPool()),
    },
    {
      provide: AttendanceConfirmationUnitOfWork,
      useFactory: () => new PostgresAttendanceConfirmationUnitOfWork(getPool()),
    },
    {
      provide: ResolveAttendanceWindowUseCase,
      inject: [AttendanceWindowRepository],
      useFactory: (windows: AttendanceWindowRepository) =>
        new ResolveAttendanceWindowUseCase(windows),
    },
    {
      provide: PreviewAttendanceUseCase,
      inject: [ResolveAttendanceWindowUseCase, AttendancePreviewReader],
      useFactory: (
        resolveWindow: ResolveAttendanceWindowUseCase,
        reader: AttendancePreviewReader,
      ) => new PreviewAttendanceUseCase(resolveWindow, reader),
    },
    {
      provide: ConfirmAttendanceUseCase,
      inject: [AttendanceConfirmationUnitOfWork],
      useFactory: (unitOfWork: AttendanceConfirmationUnitOfWork) =>
        new ConfirmAttendanceUseCase(unitOfWork),
    },
    {
      provide: IdempotencyMaintenanceService,
      useFactory: () => {
        const config = getConfig();
        return new IdempotencyMaintenanceService(
          getPool(),
          config.maintenance.idempotencyCleanupIntervalMs,
          config.maintenance.idempotencyCleanupBatchSize,
        );
      },
    },
    {
      provide: AttendanceService,
      inject: [AttendanceCatalog, PreviewAttendanceUseCase, ConfirmAttendanceUseCase],
      useFactory: (
        catalog: AttendanceCatalog,
        previewUseCase: PreviewAttendanceUseCase,
        confirmUseCase: ConfirmAttendanceUseCase,
      ) => {
        const config = getConfig();
        return new AttendanceService(getPool(), {
          catalog,
          previewUseCase,
          confirmUseCase,
          qrHmacSecret: config.qrHmacSecret,
          runtime: config.runtime,
          writeQueue: new ScanWriteQueue({ concurrency: config.runtime.scanConcurrency }),
        });
      },
    },
  ];
}

@Module({})
export class AttendanceModule {
  static register(attendanceService?: AttendanceService): DynamicModule {
    return {
      module: AttendanceModule,
      controllers: [AttendanceController],
      providers: [
        AuthGuard,
        AttendanceRateLimits,
        AttendancePreviewRateLimitGuard,
        AttendanceWriteRateLimitGuard,
        ...(attendanceService
          ? [{ provide: AttendanceService, useValue: attendanceService }]
          : productionProviders()),
      ],
    };
  }
}
