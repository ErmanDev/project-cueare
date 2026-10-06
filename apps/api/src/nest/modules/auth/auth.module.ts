import type { DynamicModule } from '@nestjs/common';
import { Module } from '@nestjs/common';

import { AuthController } from './api/auth.controller.ts';
import { AuthV2Controller } from './api/auth-v2.controller.ts';
import { AuthGuard } from './api/auth.guard.ts';
import { AuthService } from './application/auth.service.ts';
import {
  AuthRepository,
  PostgresAuthRepository,
} from './infrastructure/auth.repository.ts';

@Module({})
export class AuthModule {
  static register(repository?: AuthRepository): DynamicModule {
    return {
      module: AuthModule,
      controllers: [AuthController, AuthV2Controller],
      providers: [
        AuthService,
        AuthGuard,
        repository
          ? { provide: AuthRepository, useValue: repository }
          : { provide: AuthRepository, useClass: PostgresAuthRepository },
      ],
    };
  }
}
