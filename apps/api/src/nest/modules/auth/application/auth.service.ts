import { Injectable } from '@nestjs/common';

import { issueToken } from '../../../../auth/jwt.ts';
import {
  hashPassword,
  verifyPassword,
  verifyStudentLoginPassword,
} from '../../../../auth/password.ts';
import { getConfig } from '../../../../config.ts';
import { createHttpGuards, enforceLimit } from '../../../../infra/httpGuards.ts';
import type { AuthUser, StudentRow, UserRow } from '../../../../types.ts';
import { ROLES } from '../../../../types.ts';
import { badRequest, unauthorized } from '../../../../utils/errors.ts';
import { studentAsUser, studentToApi, userToApi } from '../../../../utils/serialize.ts';
import { AuthRepository } from '../infrastructure/auth.repository.ts';

export type LoginContext = { ip: string };

@Injectable()
export class AuthService {
  private readonly config = getConfig();
  private readonly guards = createHttpGuards(this.config.rateLimit);

  constructor(private readonly repository: AuthRepository) {}

  async login(username: string, password: string, context: LoginContext): Promise<Record<string, unknown>> {
    this.enforceLoginLimit(context.ip, username);
    const user = await this.repository.findUserByUsername(username);
    if (user) return this.loginUser(user, password);

    const student = await this.repository.findStudentByCode(username.trim());
    if (!student || !verifyStudentLoginPassword(password, student.student_id_code)) {
      throw unauthorized('Invalid username or password');
    }
    return this.studentLoginResponse(student);
  }

  async me(auth: AuthUser): Promise<Record<string, unknown>> {
    if (auth.role === ROLES.student) {
      const student = await this.repository.findStudentForAuth(auth);
      if (!student) throw unauthorized('User no longer exists');
      return {
        user: studentAsUser(student),
        role: ROLES.student,
        student: studentToApi(student),
      };
    }
    const user = await this.repository.findUserById(auth.id);
    if (!user) throw unauthorized('User no longer exists');
    return { user: userToApi(user), role: user.role };
  }

  async changePassword(
    auth: AuthUser,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ ok: true }> {
    if (newPassword.length < 4) {
      throw badRequest('Password must be at least 4 characters');
    }
    const student = await this.repository.findStudentForAuth(auth);
    if (!student) throw unauthorized('User no longer exists');
    const linked =
      (student.user_id ? await this.repository.findUserById(student.user_id) : null) ??
      (await this.repository.findUserByUsername(student.student_id_code));

    if (linked) {
      if (!verifyPassword(currentPassword, linked.password_hash)) {
        throw badRequest('Current password is incorrect');
      }
      await this.repository.updatePassword(linked.id, hashPassword(newPassword));
      if (!student.user_id) await this.repository.linkStudent(student.id, linked.id);
      return { ok: true };
    }
    if (!verifyStudentLoginPassword(currentPassword, student.student_id_code)) {
      throw badRequest('Current password is incorrect');
    }
    await this.repository.createStudentUser(student, hashPassword(newPassword));
    return { ok: true };
  }

  private async loginUser(user: UserRow, password: string): Promise<Record<string, unknown>> {
    if (!verifyPassword(password, user.password_hash)) {
      throw unauthorized('Invalid username or password');
    }
    if (user.role !== ROLES.student) {
      return {
        token: issueToken(user),
        role: user.role,
        user: userToApi(user),
        expires_in_hours: this.config.jwtTtlHours,
      };
    }
    return this.linkedStudentLoginResponse(user);
  }

  private async linkedStudentLoginResponse(user: UserRow): Promise<Record<string, unknown>> {
    const student =
      (await this.repository.findStudentByUserId(user.id)) ??
      (await this.repository.findStudentByCode(user.username));
    return {
      token: issueToken(user),
      role: ROLES.student,
      user: student ? studentAsUser(student) : userToApi(user),
      student: student ? studentToApi(student) : undefined,
      expires_in_hours: this.config.jwtTtlHours,
    };
  }

  private studentLoginResponse(student: StudentRow): Record<string, unknown> {
    return {
      token: issueToken({
        id: student.id,
        username: student.student_id_code,
        role: ROLES.student,
      }),
      role: ROLES.student,
      user: studentAsUser(student),
      student: studentToApi(student),
      expires_in_hours: this.config.jwtTtlHours,
    };
  }

  private enforceLoginLimit(ip: string, username: string): void {
    if (!this.config.rateLimit.enabled) return;
    enforceLimit(this.guards.loginIp, `ip:${ip}`);
    enforceLimit(this.guards.loginUser, `user:${username.trim().toLowerCase()}`);
  }
}
