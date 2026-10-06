import { Injectable } from '@nestjs/common';
import type { Pool } from 'pg';

import { q } from '../../../../db/ident.ts';
import { getPool, withTransaction } from '../../../../db/pool.ts';
import * as queries from '../../../../db/queries.ts';
import type { Queryable } from '../../../../types.ts';
import { eventToApi } from '../../../../utils/serialize.ts';
import {
  EventRepository,
  type CreateEventRecord,
  type EventView,
  type UpdateEventRecord,
} from '../application/ports/event.repository.ts';
import {
  requireEventDateNotPast,
  requireValidEventRange,
} from '../domain/event-date.policy.ts';

async function view(db: Queryable, eventId: number): Promise<EventView | null> {
  const event = await queries.getEventById(db, eventId);
  if (!event) return null;
  // A transaction client executes one query at a time. Keep these reads
  // sequential so the same helper is safe for both Pool and PoolClient callers.
  const sessionWindows = await queries.windowsForEvent(db, eventId);
  const finePolicies = await queries.listEventFineSummaries(db, [eventId]);
  const participantCounts = await queries.listEventParticipantCounts(db, [eventId]);
  return {
    event,
    sessionWindows,
    finePolicy: finePolicies.get(eventId) ?? null,
    participantCount: participantCounts.get(eventId) ?? 0,
  };
}

async function appendAudit(
  db: Queryable,
  input: {
    requestId: string;
    actorUserId: number;
    actionCode: string;
    eventId: number;
    before: Record<string, unknown> | null;
    after: Record<string, unknown>;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO ${q('AuditEvents')} (
       ${q('requestId')}, ${q('actorUserId')}, ${q('actionCode')},
       ${q('targetType')}, ${q('targetId')}, ${q('contextPayload')},
       ${q('beforeState')}, ${q('afterState')}
     ) VALUES ($1, $2, $3, 'event', $4, $5::jsonb, $6::jsonb, $7::jsonb)`,
    [
      input.requestId,
      input.actorUserId,
      input.actionCode,
      String(input.eventId),
      JSON.stringify({ source: 'api_v2' }),
      input.before ? JSON.stringify(input.before) : null,
      JSON.stringify(input.after),
    ],
  );
}

@Injectable()
export class PostgresEventRepository extends EventRepository {
  constructor(private readonly pool: Pool = getPool()) {
    super();
  }

  async list(): Promise<EventView[]> {
    const pool = this.pool;
    const events = await queries.listEvents(pool);
    if (!events.length) return [];
    const eventIds = events.map((event) => event.id);
    const [windows, finePolicies, participantCounts] = await Promise.all([
      queries.listAllWindows(pool),
      queries.listEventFineSummaries(pool, eventIds),
      queries.listEventParticipantCounts(pool, eventIds),
    ]);
    return events.map((event) => ({
      event,
      sessionWindows: windows.filter((window) => window.event_id === event.id),
      finePolicy: finePolicies.get(event.id) ?? null,
      participantCount: participantCounts.get(event.id) ?? 0,
    }));
  }

  findById(eventId: number): Promise<EventView | null> {
    return view(this.pool, eventId);
  }

  create(input: CreateEventRecord): Promise<EventView> {
    return withTransaction(this.pool, async (transaction) => {
      let event = await queries.insertEvent(transaction, {
        name: input.name,
        eventStartDate: input.eventStartDate,
        eventEndDate: input.eventEndDate,
        isActive: input.isActive,
        createdBy: input.actorUserId,
        academicTermId: input.academicTermId,
      });
      if (input.isActive) {
        event = await queries.publishEvent(transaction, event.id, input.actorUserId);
      }
      await appendAudit(transaction, {
        requestId: input.requestId,
        actorUserId: input.actorUserId,
        actionCode: 'EVENT_CREATED',
        eventId: event.id,
        before: null,
        after: eventToApi(event),
      });
      return (await view(transaction, event.id))!;
    });
  }

  update(input: UpdateEventRecord): Promise<EventView | null> {
    return withTransaction(this.pool, async (transaction) => {
      await transaction.query(
        `SELECT ${q('eventId')} FROM ${q('Events')} WHERE ${q('eventId')} = $1 FOR UPDATE`,
        [input.eventId],
      );
      const existing = await queries.getEventById(transaction, input.eventId);
      if (!existing) return null;
      const effectiveStart = input.eventStartDate ?? existing.event_start_date;
      const effectiveEnd = input.eventEndDate ?? existing.event_end_date;
      requireValidEventRange(effectiveStart, effectiveEnd);
      if (input.eventStartDate) requireEventDateNotPast(input.eventStartDate);
      if (input.isActive === true) requireEventDateNotPast(effectiveEnd);
      const updated = await queries.updateEvent(transaction, input.eventId, {
        name: input.name,
        eventStartDate: input.eventStartDate,
        eventEndDate: input.eventEndDate,
        academicTermId: input.academicTermId,
        isActive: input.isActive,
      });
      await appendAudit(transaction, {
        requestId: input.requestId,
        actorUserId: input.actorUserId,
        actionCode: 'EVENT_UPDATED',
        eventId: input.eventId,
        before: eventToApi(existing),
        after: eventToApi(updated),
      });
      return view(transaction, input.eventId);
    });
  }
}
