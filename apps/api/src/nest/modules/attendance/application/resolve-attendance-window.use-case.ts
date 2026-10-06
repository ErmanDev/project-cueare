import { pickWindowForTime } from '../domain/session-window.policy.ts';
import type {
  AttendanceWindow,
  AttendanceWindowRepository,
} from './ports/attendance-window.repository.ts';

export type AttendanceWindowMode = 'auto' | 'manual';

export type ResolveAttendanceWindowResult =
  | { kind: 'resolved'; window: AttendanceWindow; mode: AttendanceWindowMode }
  | { kind: 'not_found' }
  | { kind: 'unavailable'; availableWindows: AttendanceWindow[] };

export class ResolveAttendanceWindowUseCase {
  constructor(private readonly windows: AttendanceWindowRepository) {}

  async execute(args: {
    eventId: number;
    at: Date;
    overrideWindowId?: number | null;
  }): Promise<ResolveAttendanceWindowResult> {
    if (args.overrideWindowId != null) {
      const window = await this.windows.findById(args.overrideWindowId);
      if (!window || window.event_id !== args.eventId) return { kind: 'not_found' };
      return { kind: 'resolved', window, mode: 'manual' };
    }

    const availableWindows = await this.windows.listForEvent(args.eventId);
    const window = pickWindowForTime(availableWindows, args.at);
    if (!window) return { kind: 'unavailable', availableWindows };
    return { kind: 'resolved', window, mode: 'auto' };
  }
}
