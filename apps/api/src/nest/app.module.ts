import { Module } from '@nestjs/common';

import { AuthModule } from './modules/auth/auth.module.ts';
import { AttendanceModule } from './modules/attendance/attendance.module.ts';
import { EventsModule } from './modules/events/events.module.ts';
import { HealthModule } from './modules/health/health.module.ts';
import { StudentsModule } from './modules/students/students.module.ts';

/**
 * Root Nest module for the incremental migration.
 *
 * Feature modules are added here as routes move out of the legacy Express app.
 * Until then, the compatibility adapter owns the existing HTTP contract.
 */
@Module({
  imports: [
    HealthModule,
    AuthModule.register(),
    StudentsModule.register(),
    AttendanceModule.register(),
    EventsModule.register(),
  ],
})
export class AppModule {}
