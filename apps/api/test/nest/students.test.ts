import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Module } from '@nestjs/common';

import { issueToken } from '../../src/auth/jwt.ts';
import type { AttendanceService } from '../../src/attendance/service.ts';
import type { StudentEventSessionRow } from '../../src/db/queries.ts';
import { createMigrationHost } from '../../src/nest/compatibility/create-migration-host.ts';
import {
  StudentRepository,
} from '../../src/nest/modules/students/infrastructure/student.repository.ts';
import { StudentsModule } from '../../src/nest/modules/students/students.module.ts';
import type { AuthUser, EventRow, StudentRow } from '../../src/types.ts';
import { ROLES } from '../../src/types.ts';
import type { AttendanceDetailRow } from '../../src/utils/serialize.ts';

const now = new Date('2026-09-28T00:00:00.000Z');
const student: StudentRow = {
  id: 21,
  student_id_code: 'STU-0021',
  first_name: 'Test',
  middle_name: null,
  last_name: 'Student',
  full_name: 'Test Student',
  course: 'BSIT',
  year_level: 2,
  section: 'A',
  photo_url: null,
  user_id: null,
  created_at: now,
  updated_at: now,
};

class FakeStudentRepository extends StudentRepository {
  lastPage: { studentId: number; limit: number; offset: number } | null = null;

  findForAuth(_auth: Pick<AuthUser, 'id' | 'username'>): Promise<StudentRow | null> {
    return Promise.resolve(student);
  }

  listEvents(): Promise<EventRow[]> {
    return Promise.resolve([{
      id: 5,
      academic_term_id: 1,
      name: 'Foundation Day',
      event_status: 'PUBLISHED',
      event_start_date: new Date('2026-10-01T00:00:00.000Z'),
      event_end_date: new Date('2026-10-01T00:00:00.000Z'),
      is_active: true,
      created_by: 1,
      created_at: now,
      updated_at: now,
    }]);
  }

  listEventSessions(): Promise<StudentEventSessionRow[]> {
    return Promise.resolve([{
      event_id: 5,
      session_id: 9,
      session_name: 'Morning',
      session_date: '2026-10-01',
      status: 'PENDING',
      checked_in_at_utc: null,
      checked_out_at_utc: null,
    }]);
  }

  listFinesPage(input: { studentId: number; limit: number; offset: number }) {
    this.lastPage = input;
    return Promise.resolve({ rows: [{ id: 2 }, { id: 1 }], total: 5 });
  }

  listAttendancePage(input: { studentId: number; limit: number; offset: number }) {
    this.lastPage = input;
    return Promise.resolve({ rows: [] as AttendanceDetailRow[], total: 0 });
  }
}

const repository = new FakeStudentRepository();

@Module({ imports: [StudentsModule.register(repository)] })
class TestStudentsAppModule {}

describe('native Nest student reads', () => {
  let url = '';
  let close: () => Promise<void> = async () => {};
  const studentToken = issueToken({ id: student.id, username: student.student_id_code, role: ROLES.student });

  beforeAll(async () => {
    const { nestApp, httpServer } = await createMigrationHost(
      {} as AttendanceService,
      TestStudentsAppModule,
    );
    await new Promise<void>((resolve, reject) => {
      httpServer.once('listening', resolve);
      httpServer.once('error', reject);
      httpServer.listen(0, '127.0.0.1');
    });
    const { port } = httpServer.address() as AddressInfo;
    url = `http://127.0.0.1:${port}`;
    close = async () => {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
      await nestApp.close();
    };
  });

  afterAll(async () => close());

  it('returns the authenticated student profile and events', async () => {
    const headers = { authorization: `Bearer ${studentToken}` };
    const [profileResponse, eventsResponse] = await Promise.all([
      fetch(`${url}/api/v2/student/profile`, { headers }),
      fetch(`${url}/api/v2/student/events`, { headers }),
    ]);
    expect(profileResponse.status).toBe(200);
    expect((await profileResponse.json() as any).data.student_id_code).toBe('STU-0021');
    expect(eventsResponse.status).toBe(200);
    const events = await eventsResponse.json() as any;
    expect(events.data[0].name).toBe('Foundation Day');
    expect(events.data[0].sessions[0].session_name).toBe('Morning');
  });

  it('places list pagination in response metadata', async () => {
    const response = await fetch(`${url}/api/v2/student/fines?page=2&pageSize=2`, {
      headers: { authorization: `Bearer ${studentToken}`, 'x-request-id': 'student-page-test' },
    });
    expect(response.status).toBe(200);
    expect(repository.lastPage).toEqual({ studentId: student.id, limit: 2, offset: 2 });
    expect(await response.json()).toEqual({
      data: [{ id: 2 }, { id: 1 }],
      meta: {
        requestId: 'student-page-test',
        pagination: {
          page: 2,
          pageSize: 2,
          totalItems: 5,
          totalPages: 3,
          hasNextPage: true,
          hasPreviousPage: true,
        },
      },
    });
  });

  it('rejects invalid pagination and non-student roles', async () => {
    const invalidPage = await fetch(`${url}/api/v2/student/attendance?page=zero`, {
      headers: { authorization: `Bearer ${studentToken}` },
    });
    expect(invalidPage.status).toBe(400);
    expect((await invalidPage.json() as any).error.code).toBe('VALIDATION_FAILED');

    const staffToken = issueToken({ id: 1, username: 'admin', role: ROLES.superadmin });
    const forbidden = await fetch(`${url}/api/v2/student/profile`, {
      headers: { authorization: `Bearer ${staffToken}` },
    });
    expect(forbidden.status).toBe(403);
    expect((await forbidden.json() as any).error.code).toBe('FORBIDDEN');
  });
});
