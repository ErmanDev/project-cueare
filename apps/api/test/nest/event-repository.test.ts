import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import type { Pool } from 'pg';

import { hashPassword } from '../../src/auth/password.ts';
import * as queries from '../../src/db/queries.ts';
import { PostgresEventRepository } from '../../src/nest/modules/events/infrastructure/postgres-event.repository.ts';
import { closeTestDatabase, openTestDatabase } from '../support/database.ts';

const SCHEMA = 'ssc_nest_events_test';

describe('PostgreSQL event repository', () => {
  let pool: Pool;
  let repository: PostgresEventRepository;
  let adminId = 0;

  beforeAll(async () => {
    const opened = await openTestDatabase(SCHEMA);
    if (opened) {
      pool = opened;
      repository = new PostgresEventRepository(pool);
    }
  });

  afterAll(async () => closeTestDatabase(pool, SCHEMA));

  beforeEach(async () => {
    if (!pool) return;
    await pool.query(
      `TRUNCATE "AuditEvents", "Events", "Users" RESTART IDENTITY CASCADE`,
    );
    const admin = await queries.insertUser(pool, {
      name: 'Admin',
      username: 'event-admin',
      passwordHash: hashPassword('test-password', 1_000),
      role: 'superadmin',
    });
    adminId = admin.id;
  });

  it('writes create and update audit records in the event transaction', async () => {
    if (!pool) return;
    const created = await repository.create({
      actorUserId: adminId,
      requestId: 'create-event-audit',
      name: 'Foundation Day',
      eventStartDate: new Date(2099, 8, 12),
      eventEndDate: new Date(2099, 8, 12),
      isActive: false,
    });

    const updated = await repository.update({
      eventId: created.event.id,
      actorUserId: adminId,
      requestId: 'update-event-audit',
      name: 'Updated Foundation Day',
    });
    expect(updated?.event.name).toBe('Updated Foundation Day');

    const audit = await pool.query<{
      action_code: string;
      request_id: string;
      target_id: string;
      before_name: string | null;
      after_name: string;
    }>(
      `SELECT "actionCode" AS action_code,
              "requestId" AS request_id,
              "targetId" AS target_id,
              "beforeState"->>'name' AS before_name,
              "afterState"->>'name' AS after_name
         FROM "AuditEvents"
        ORDER BY "auditEventId"`,
    );
    expect(audit.rows).toEqual([
      {
        action_code: 'EVENT_CREATED',
        request_id: 'create-event-audit',
        target_id: String(created.event.id),
        before_name: null,
        after_name: 'Foundation Day',
      },
      {
        action_code: 'EVENT_UPDATED',
        request_id: 'update-event-audit',
        target_id: String(created.event.id),
        before_name: 'Foundation Day',
        after_name: 'Updated Foundation Day',
      },
    ]);
  });

  it('rolls back the event when its audit record cannot be stored', async () => {
    if (!pool) return;
    await expect(repository.create({
      actorUserId: adminId,
      requestId: 'x'.repeat(129),
      name: 'Must Roll Back',
      eventStartDate: new Date(2099, 8, 13),
      eventEndDate: new Date(2099, 8, 13),
      isActive: false,
    })).rejects.toThrow();

    const events = await queries.listEvents(pool);
    expect(events).toEqual([]);
  });

  it('validates an update against the row locked inside its transaction', async () => {
    if (!pool) return;
    const created = await repository.create({
      actorUserId: adminId,
      requestId: 'create-for-range-check',
      name: 'Range Check',
      eventStartDate: new Date(2099, 8, 12),
      eventEndDate: new Date(2099, 8, 13),
      isActive: false,
    });

    await expect(repository.update({
      eventId: created.event.id,
      actorUserId: adminId,
      requestId: 'invalid-range-update',
      eventStartDate: new Date(2099, 8, 14),
    })).rejects.toThrow('event_end_date must be on or after event_start_date');

    const unchanged = await queries.getEventById(pool, created.event.id);
    expect(unchanged?.event_start_date).toEqual(new Date(2099, 8, 12));
    const audit = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM "AuditEvents" WHERE "actionCode" = 'EVENT_UPDATED'`,
    );
    expect(audit.rows[0]?.count).toBe(0);
  });
});
