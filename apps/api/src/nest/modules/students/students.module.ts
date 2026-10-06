import type { DynamicModule } from '@nestjs/common';
import { Module } from '@nestjs/common';

import { AuthGuard } from '../auth/api/auth.guard.ts';
import { StudentController } from './api/student.controller.ts';
import { StudentService } from './application/student.service.ts';
import {
  PostgresStudentRepository,
  StudentRepository,
} from './infrastructure/student.repository.ts';

@Module({})
export class StudentsModule {
  static register(repository?: StudentRepository): DynamicModule {
    return {
      module: StudentsModule,
      controllers: [StudentController],
      providers: [
        StudentService,
        AuthGuard,
        repository
          ? { provide: StudentRepository, useValue: repository }
          : { provide: StudentRepository, useClass: PostgresStudentRepository },
      ],
    };
  }
}
