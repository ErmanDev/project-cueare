import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Module } from '@nestjs/common';

import type { AttendanceService } from '../../src/attendance/service.ts';
import { issueToken } from '../../src/auth/jwt.ts';
import { createMigrationHost } from '../../src/nest/compatibility/create-migration-host.ts';
import { EventsModule } from '../../src/nest/modules/events/events.module.ts';
import {
  EventRepository,
  type CreateEventRecord,
  type EventView,
  type UpdateEventRecord,
} from '../../src/nest/modules/events/application/ports/event.repository.ts';
import { ROLES } from '../../src/types.ts';

const baseEvent: EventView = {
  event: {
    id: 9,
    academic_term_id: 2,
    name: 'Foundation Day',
    event_status: 'PUBLISHED',
    event_start_date: new Date(2099, 8, 12),
    event_end_date: new Date(2099, 8, 12),
    is_active: true,
    created_by: 1,
    created_at: new Date('2026-09-01T00:00:00.000Z'),
    updated_at: new Date('2026-09-01T00:00:00.000Z'),
  },
  sessionWindows: [],
  finePolicy: null,
  participantCount: 42,
};

const writes: {
  creates: CreateEventRecord[];
  updates: UpdateEventRecord[];
} = { creates: [], updates: [] };

const repository = {
  list: async () => [baseEvent],
  findById: async (id: number) => (id === baseEvent.event.id ? baseEvent : null),
  create: async (input: CreateEventRecord) => {
    writes.creates.push(input);
    return {
      ...baseEvent,
      event: {
        ...baseEvent.event,
        id: 10,
        name: input.name,
        event_start_date: input.eventStartDate,
        event_end_date: input.eventEndDate,
        is_active: input.isActive,
      },
      participantCount: 0,
    };
  },
  update: async (input: UpdateEventRecord) => {
    writes.updates.push(input);
    return {
      ...baseEvent,
      event: {
        ...baseEvent.event,
        name: input.name ?? baseEvent.event.name,
      },
    };
  },
} as EventRepository;

@Module({ imports: [EventsModule.register(repository)] })
class TestEventsAppModule {}

describe('native Nest event administration', () => {
  let url = '';
  let close: () => Promise<void> = async () => {};
  const adminToken = issueToken({ id: 1, username: 'admin', role: ROLES.superadmin });
  const moderatorToken = issueToken({ id: 2, username: 'moderator', role: ROLES.moderator });

  beforeAll(async () => {
    const { nestApp, httpServer } = await createMigrationHost(
      {} as AttendanceService,
      TestEventsAppModule,
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

  it('lists events through the v2 envelope for superadmins', async () => {
    const response = await fetch(`${url}/api/v2/admin/events`, {
      headers: { authorization: `Bearer ${adminToken}`, 'x-request-id': 'events-list' },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: [{ id: 9, name: 'Foundation Day', participant_count: 42 }],
      meta: { requestId: 'events-list' },
    });
  });

  it('creates an event and carries actor and request correlation into the command', async () => {
    const response = await fetch(`${url}/api/v2/admin/events`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${adminToken}`,
        'content-type': 'application/json',
        'x-request-id': 'event-create-request',
      },
      body: JSON.stringify({
        name: 'Recognition Day',
        event_start_date: '2099-10-10',
        event_end_date: '2099-10-11',
        academic_term_id: 2,
        is_active: false,
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      data: { id: 10, name: 'Recognition Day', participant_count: 0 },
      meta: { requestId: 'event-create-request' },
    });
    expect(writes.creates.at(-1)).toMatchObject({
      actorUserId: 1,
      requestId: 'event-create-request',
      name: 'Recognition Day',
      academicTermId: 2,
      isActive: false,
    });
  });

  it('updates core event fields without accepting nested legacy operations', async () => {
    const response = await fetch(`${url}/api/v2/admin/events/9`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${adminToken}`,
        'content-type': 'application/json',
        'x-request-id': 'event-update-request',
      },
      body: JSON.stringify({ name: 'Updated Foundation Day' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { id: 9, name: 'Updated Foundation Day' },
      meta: { requestId: 'event-update-request' },
    });
    expect(writes.updates.at(-1)).toMatchObject({
      eventId: 9,
      actorUserId: 1,
      requestId: 'event-update-request',
      name: 'Updated Foundation Day',
    });

    const nested = await fetch(`${url}/api/v2/admin/events/9`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${adminToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ session_windows: [] }),
    });
    expect(nested.status).toBe(400);
    expect(await nested.json()).toMatchObject({
      error: { code: 'UNKNOWN_FIELD' },
    });
  });

  it('rejects invalid ranges and non-superadmin access', async () => {
    const invalid = await fetch(`${url}/api/v2/admin/events`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${adminToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Invalid Event',
        event_start_date: '2099-10-12',
        event_end_date: '2099-10-11',
      }),
    });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      error: { code: 'VALIDATION_FAILED' },
    });

    const forbidden = await fetch(`${url}/api/v2/admin/events`, {
      headers: { authorization: `Bearer ${moderatorToken}` },
    });
    expect(forbidden.status).toBe(403);
  });
});
