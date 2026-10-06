import type { EventRow, SessionWindowRow } from '../../../../../types.ts';

export type EventView = {
  event: EventRow;
  sessionWindows: SessionWindowRow[];
  finePolicy: unknown | null;
  participantCount: number;
};

export type EventWriteContext = {
  actorUserId: number;
  requestId: string;
};

export type CreateEventRecord = EventWriteContext & {
  name: string;
  eventStartDate: Date;
  eventEndDate: Date;
  academicTermId?: number;
  isActive: boolean;
};

export type UpdateEventRecord = EventWriteContext & {
  eventId: number;
  name?: string;
  eventStartDate?: Date;
  eventEndDate?: Date;
  academicTermId?: number;
  isActive?: boolean;
};

export abstract class EventRepository {
  abstract list(): Promise<EventView[]>;
  abstract findById(eventId: number): Promise<EventView | null>;
  abstract create(input: CreateEventRecord): Promise<EventView>;
  abstract update(input: UpdateEventRecord): Promise<EventView | null>;
}
