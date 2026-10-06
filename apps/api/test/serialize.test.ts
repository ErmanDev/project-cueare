import { describe, expect, it } from 'bun:test';

import { ROLES } from '../src/types.ts';
import { studentAsUser, studentToApi, userToApi } from '../src/utils/serialize.ts';

const created = new Date('2026-09-13T08:00:00.000Z');
const updated = new Date('2026-09-13T09:00:00.000Z');

describe('studentAsUser', () => {
  it('maps a student row into the staff user API shape', () => {
    const user = studentAsUser({
      id: 42,
      student_id_code: '02-26-0011',
      first_name: 'juan',
      middle_name: 'santos',
      last_name: 'dela cruz',
      full_name: 'juan santos dela cruz',
      created_at: created,
      updated_at: updated,
    });

    expect(user).toEqual({
      id: 42,
      name: 'Juan Santos Dela Cruz',
      username: '02-26-0011',
      role: ROLES.student,
      created_at: created.toISOString(),
      updated_at: updated.toISOString(),
    });
    expect(Object.keys(user)).toEqual(Object.keys(userToApi({
      id: 1,
      name: 'Staff',
      username: 'staff',
      role: ROLES.moderator,
      created_at: created,
      updated_at: updated,
    })));
    expect(studentToApi({
      id: 42,
      student_id_code: '02-26-0011',
      first_name: 'juan',
      middle_name: 'santos',
      last_name: 'dela cruz',
      full_name: 'juan santos dela cruz',
      course: 'bsit',
      year_level: 1,
      section: 'A',
      photo_url: null,
      created_at: created,
      updated_at: updated,
    }).full_name).toBe(user.name);
  });
});
