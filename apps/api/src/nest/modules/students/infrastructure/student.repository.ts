import { Injectable } from '@nestjs/common';

import * as q from '../../../../db/queries.ts';
import { getPool } from '../../../../db/pool.ts';
import type { AuthUser, EventRow, StudentRow } from '../../../../types.ts';
import type { AttendanceDetailRow } from '../../../../utils/serialize.ts';

export abstract class StudentRepository {
  abstract findForAuth(auth: Pick<AuthUser, 'id' | 'username'>): Promise<StudentRow | null>;
  abstract listEvents(studentId: number): Promise<EventRow[]>;
  abstract listEventSessions(studentId: number): Promise<q.StudentEventSessionRow[]>;
  abstract listFinesPage(input: {
    studentId: number;
    limit: number;
    offset: number;
  }): Promise<{ rows: Record<string, unknown>[]; total: number }>;
  abstract listAttendancePage(input: {
    studentId: number;
    limit: number;
    offset: number;
  }): Promise<{ rows: AttendanceDetailRow[]; total: number }>;
}

@Injectable()
export class PostgresStudentRepository extends StudentRepository {
  async findForAuth(auth: Pick<AuthUser, 'id' | 'username'>): Promise<StudentRow | null> {
    return (
      (await q.getStudentById(getPool(), auth.id)) ??
      (await q.getStudentByUserId(getPool(), auth.id)) ??
      (await q.getStudentByCode(getPool(), auth.username))
    );
  }

  listEvents(studentId: number): Promise<EventRow[]> {
    return q.listRegisteredEventsForStudent(getPool(), studentId);
  }

  listEventSessions(studentId: number): Promise<q.StudentEventSessionRow[]> {
    return q.listStudentEventSessions(getPool(), studentId);
  }

  listFinesPage(input: { studentId: number; limit: number; offset: number }) {
    return q.listStudentFinesPage(getPool(), input);
  }

  listAttendancePage(input: { studentId: number; limit: number; offset: number }) {
    return q.listStudentAttendancePage(getPool(), input);
  }
}
