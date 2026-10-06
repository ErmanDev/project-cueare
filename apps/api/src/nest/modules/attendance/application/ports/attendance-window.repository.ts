import type { AttendanceSessionWindow } from '../../domain/session-window.policy.ts';

/** Application-facing session model; infrastructure rows must conform here. */
export type AttendanceWindow = AttendanceSessionWindow & {
  id: number;
  event_id: number;
  session_label: string;
  in_end?: string | null;
  requires_checkout?: boolean;
  sort_order: number;
};

export abstract class AttendanceWindowRepository {
  abstract findById(id: number): Promise<AttendanceWindow | null>;
  abstract listForEvent(eventId: number): Promise<AttendanceWindow[]>;
}
