import type { DynamicModule } from '@nestjs/common';
import { Module } from '@nestjs/common';

import { AuthGuard } from '../auth/api/auth.guard.ts';
import { EventsController } from './api/events.controller.ts';
import { EventService } from './application/event.service.ts';
import { EventRepository } from './application/ports/event.repository.ts';
import { PostgresEventRepository } from './infrastructure/postgres-event.repository.ts';

@Module({})
export class EventsModule {
  static register(repository?: EventRepository): DynamicModule {
    return {
      module: EventsModule,
      controllers: [EventsController],
      providers: [
        AuthGuard,
        EventService,
        repository
          ? { provide: EventRepository, useValue: repository }
          : {
              provide: EventRepository,
              useFactory: () => new PostgresEventRepository(),
            },
      ],
    };
  }
}
