import { Injectable } from '@nestjs/common';

import * as q from '../../../../db/queries.ts';
import { getPool, withTransaction } from '../../../../db/pool.ts';
import type { AuthUser, StudentRow, UserRow } from '../../../../types.ts';

export abstract class AuthRepository {
  abstract findUserById(id: number): Promise<UserRow | null>;
  abstract findUserByUsername(username: string): Promise<UserRow | null>;
  abstract findStudentForAuth(auth: Pick<AuthUser, 'id' | 'username'>): Promise<StudentRow | null>;
  abstract findStudentByUserId(userId: number): Promise<StudentRow | null>;
  abstract findStudentByCode(code: string): Promise<StudentRow | null>;
  abstract updatePassword(userId: number, passwordHash: string): Promise<void>;
  abstract linkStudent(studentId: number, userId: number): Promise<void>;
  abstract createStudentUser(student: StudentRow, passwordHash: string): Promise<void>;
}

@Injectable()
export class PostgresAuthRepository extends AuthRepository {
  findUserById(id: number): Promise<UserRow | null> {
    return q.getUserById(getPool(), id);
  }

  findUserByUsername(username: string): Promise<UserRow | null> {
    return q.getUserByUsername(getPool(), username);
  }

  async findStudentForAuth(
    auth: Pick<AuthUser, 'id' | 'username'>,
  ): Promise<StudentRow | null> {
    return (
      (await q.getStudentById(getPool(), auth.id)) ??
      (await q.getStudentByUserId(getPool(), auth.id)) ??
      (await q.getStudentByCode(getPool(), auth.username))
    );
  }

  findStudentByUserId(userId: number): Promise<StudentRow | null> {
    return q.getStudentByUserId(getPool(), userId);
  }

  findStudentByCode(code: string): Promise<StudentRow | null> {
    return q.getStudentByCode(getPool(), code);
  }

  async updatePassword(userId: number, passwordHash: string): Promise<void> {
    await q.updateUser(getPool(), userId, { passwordHash });
  }

  linkStudent(studentId: number, userId: number): Promise<void> {
    return q.linkStudentToUser(getPool(), studentId, userId);
  }

  async createStudentUser(student: StudentRow, passwordHash: string): Promise<void> {
    await withTransaction(getPool(), async (db) => {
      const created = await q.insertUser(db, {
        name: student.full_name,
        username: student.student_id_code,
        passwordHash,
        role: 'student',
      });
      await q.linkStudentToUser(db, student.id, created.id);
    });
  }
}
