import { Injectable } from '@nestjs/common';

import type { AuthUser } from '../../../../types.ts';
import { notFound } from '../../../../utils/errors.ts';
import { eventToApi, windowToApi } from '../../../../utils/serialize.ts';
import type { CreateEventDto, UpdateEventDto } from '../api/event.dto.ts';
import {
  EventRepository,
  type EventView,
} from './ports/event.repository.ts';
import {
  requireEventDateNotPast,
  requireValidEventRange,
} from '../domain/event-date.policy.ts';

function toApi(view: EventView): Record<string, unknown> {
  return {
    ...eventToApi(view.event),
    session_windows: view.sessionWindows.map(windowToApi),
    fine_policy: view.finePolicy,
    participant_count: view.participantCount,
  };
}

@Injectable()
export class EventService {
  constructor(private readonly repository: EventRepository) {}

  async list(): Promise<Record<string, unknown>[]> {
    return (await this.repository.list()).map(toApi);
  }

  async get(eventId: number): Promise<Record<string, unknown>> {
    const event = await this.repository.findById(eventId);
    if (!event) throw notFound('Event not found');
    return toApi(event);
  }

  async create(
    dto: CreateEventDto,
    auth: AuthUser,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    requireValidEventRange(dto.eventStartDate, dto.eventEndDate);
    requireEventDateNotPast(dto.eventStartDate);
    return toApi(await this.repository.create({
      actorUserId: auth.id,
      requestId,
      name: dto.name,
      eventStartDate: dto.eventStartDate,
      eventEndDate: dto.eventEndDate,
      academicTermId: dto.academicTermId,
      isActive: dto.isActive,
    }));
  }

  async update(
    eventId: number,
    dto: UpdateEventDto,
    auth: AuthUser,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const updated = await this.repository.update({
      eventId,
      actorUserId: auth.id,
      requestId,
      name: dto.name,
      eventStartDate: dto.eventStartDate,
      eventEndDate: dto.eventEndDate,
      academicTermId: dto.academicTermId,
      isActive: dto.isActive,
    });
    if (!updated) throw notFound('Event not found');
    return toApi(updated);
  }
}
