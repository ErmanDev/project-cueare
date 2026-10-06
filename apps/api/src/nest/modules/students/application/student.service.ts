import { Injectable } from '@nestjs/common';

import type { PageResult } from '../../../common/http/api-response.ts';
import { pageResult } from '../../../common/http/api-response.ts';
import type { AuthUser } from '../../../../types.ts';
import { unauthorized } from '../../../../utils/errors.ts';
import {
  attendanceDetailToApi,
  eventToApi,
  studentToApi,
  toIso,
} from '../../../../utils/serialize.ts';
import { StudentRepository } from '../infrastructure/student.repository.ts';

@Injectable()
export class StudentService {
  constructor(private readonly repository: StudentRepository) {}

  async profile(auth: AuthUser): Promise<Record<string, unknown>> {
    return studentToApi(await this.student(auth));
  }

  async events(auth: AuthUser): Promise<Record<string, unknown>[]> {
    const student = await this.student(auth);
    const [events, sessions] = await Promise.all([
      this.repository.listEvents(student.id),
      this.repository.listEventSessions(student.id),
    ]);
    const sessionsByEvent = new Map<number, typeof sessions>();
    for (const session of sessions) {
      const grouped = sessionsByEvent.get(session.event_id) ?? [];
      grouped.push(session);
      sessionsByEvent.set(session.event_id, grouped);
    }
    return events.map((event) => ({
      ...eventToApi(event),
      sessions: (sessionsByEvent.get(event.id) ?? []).map((session) => ({
        session_id: session.session_id,
        session_name: session.session_name,
        session_date: session.session_date,
        status: session.status,
        checked_in_at_utc: toIso(session.checked_in_at_utc),
        checked_out_at_utc: toIso(session.checked_out_at_utc),
      })),
    }));
  }

  async fines(auth: AuthUser, page: number, pageSize: number): Promise<PageResult<Record<string, unknown>>> {
    const student = await this.student(auth);
    const result = await this.repository.listFinesPage({
      studentId: student.id,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    return pageResult({ items: result.rows, page, pageSize, totalItems: result.total });
  }

  async attendance(
    auth: AuthUser,
    page: number,
    pageSize: number,
  ): Promise<PageResult<Record<string, unknown>>> {
    const student = await this.student(auth);
    const result = await this.repository.listAttendancePage({
      studentId: student.id,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    return pageResult({
      items: result.rows.map(attendanceDetailToApi),
      page,
      pageSize,
      totalItems: result.total,
    });
  }

  private async student(auth: AuthUser) {
    const student = await this.repository.findForAuth(auth);
    if (!student) throw unauthorized('User no longer exists');
    return student;
  }
}
