import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Module } from '@nestjs/common';

import { hashPassword } from '../../src/auth/password.ts';
import type { AttendanceService } from '../../src/attendance/service.ts';
import { createMigrationHost } from '../../src/nest/compatibility/create-migration-host.ts';
import { AuthModule } from '../../src/nest/modules/auth/auth.module.ts';
import { AuthRepository } from '../../src/nest/modules/auth/infrastructure/auth.repository.ts';
import type { AuthUser, StudentRow, UserRow } from '../../src/types.ts';
import { ROLES } from '../../src/types.ts';

const now = new Date('2026-01-01T00:00:00.000Z');
const staff: UserRow = {
  id: 1,
  name: 'Admin User',
  username: 'admin',
  password_hash: hashPassword('admin-pass', 100),
  role: ROLES.superadmin,
  created_at: now,
  updated_at: now,
};
const student: StudentRow = {
  id: 7,
  student_id_code: 'STU-007',
  first_name: 'Test',
  middle_name: null,
  last_name: 'Student',
  full_name: 'Test Student',
  course: 'bsit',
  year_level: 2,
  section: 'A',
  photo_url: null,
  user_id: null,
  created_at: now,
  updated_at: now,
};

class FakeAuthRepository extends AuthRepository {
  updatedPassword: { userId: number; passwordHash: string } | null = null;

  findUserById(id: number): Promise<UserRow | null> {
    return Promise.resolve(id === staff.id ? staff : null);
  }

  findUserByUsername(username: string): Promise<UserRow | null> {
    return Promise.resolve(username.toLowerCase() === staff.username ? staff : null);
  }

  findStudentForAuth(auth: Pick<AuthUser, 'id' | 'username'>): Promise<StudentRow | null> {
    return Promise.resolve(
      auth.id === student.id || auth.username === student.student_id_code ? student : null,
    );
  }

  findStudentByUserId(): Promise<StudentRow | null> {
    return Promise.resolve(null);
  }

  findStudentByCode(code: string): Promise<StudentRow | null> {
    return Promise.resolve(code.toLowerCase() === student.student_id_code.toLowerCase() ? student : null);
  }

  updatePassword(userId: number, passwordHash: string): Promise<void> {
    this.updatedPassword = { userId, passwordHash };
    return Promise.resolve();
  }

  linkStudent(): Promise<void> {
    return Promise.resolve();
  }

  createStudentUser(): Promise<void> {
    return Promise.resolve();
  }
}

const repository = new FakeAuthRepository();

@Module({ imports: [AuthModule.register(repository)] })
class TestAuthAppModule {}

describe('native Nest auth contracts', () => {
  let url = '';
  let close: () => Promise<void> = async () => {};

  beforeAll(async () => {
    const { nestApp, httpServer } = await createMigrationHost(
      {} as AttendanceService,
      TestAuthAppModule,
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

  it('preserves all login aliases and the staff response contract', async () => {
    for (const path of ['/auth/login', '/api/auth/login', '/api/v1/auth/login', '/v1/auth/login']) {
      const response = await fetch(`${url}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin-pass' }),
      });
      expect(response.status).toBe(200);
      const body = await response.json() as Record<string, any>;
      expect(body.role).toBe(ROLES.superadmin);
      expect(body.user.username).toBe('admin');
      expect(typeof body.token).toBe('string');
    }
  });

  it('preserves student login, query tokens, and every me alias', async () => {
    const login = await fetch(`${url}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'STU-007', password: 'stu-007' }),
    });
    expect(login.status).toBe(200);
    const loginBody = await login.json() as Record<string, any>;
    expect(loginBody.student.student_id_code).toBe('STU-007');

    for (const path of ['/auth/me', '/api/auth/me', '/api/v1/auth/me', '/v1/auth/me']) {
      const response = await fetch(`${url}${path}?access_token=${loginBody.token}`);
      expect(response.status).toBe(200);
      const body = await response.json() as Record<string, any>;
      expect(body.role).toBe(ROLES.student);
      expect(body.student.id).toBe(student.id);
    }
  });

  it('preserves authentication and validation errors', async () => {
    const missing = await fetch(`${url}/api/auth/me`);
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({
      error: 'Missing or malformed Authorization header or token query param',
    });

    const invalid = await fetch(`${url}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong' }),
    });
    expect(invalid.status).toBe(401);
    expect(await invalid.json()).toEqual({ error: 'Invalid username or password' });

    const malformed = await fetch(`${url}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: 'Request body is not valid JSON' });
  });

  it('keeps student-only password changes on Nest', async () => {
    const login = await fetch(`${url}/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'STU-007', password: 'STU-007' }),
    });
    const { token } = await login.json() as { token: string };

    for (const path of [
      '/auth/change-password',
      '/api/auth/change-password',
      '/api/v1/auth/change-password',
      '/v1/auth/change-password',
    ]) {
      const response = await fetch(`${url}${path}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ current_password: 'STU-007', new_password: 'new-pass' }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
    }
  });

  it('serves the additive v2 success and error envelopes', async () => {
    const success = await fetch(`${url}/api/v2/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'auth-contract-test',
      },
      body: JSON.stringify({ username: 'admin', password: 'admin-pass' }),
    });
    expect(success.status).toBe(200);
    expect(success.headers.get('x-request-id')).toBe('auth-contract-test');
    const successBody = await success.json() as Record<string, any>;
    expect(successBody.data.role).toBe(ROLES.superadmin);
    expect(successBody.meta).toEqual({ requestId: 'auth-contract-test' });
    expect(successBody.success).toBeUndefined();
    expect(successBody.statusCode).toBeUndefined();

    const failure = await fetch(`${url}/api/v2/auth/me`, {
      headers: { 'x-request-id': 'auth-error-test' },
    });
    expect(failure.status).toBe(401);
    expect(await failure.json()).toEqual({
      error: {
        code: 'AUTHENTICATION_FAILED',
        message: 'Missing or malformed Authorization header or token query param',
      },
      meta: { requestId: 'auth-error-test' },
    });

    const malformed = await fetch(`${url}/api/v2/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'invalid-json-test',
      },
      body: '{',
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body is not valid JSON.',
      },
      meta: { requestId: 'invalid-json-test' },
    });
  });
});
