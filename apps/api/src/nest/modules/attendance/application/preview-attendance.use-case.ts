import {
  ATTENDANCE_DIRECTION,
  computeDirection,
  type AttendanceDirection,
} from '../domain/attendance-direction.policy.ts';
import type { AttendanceWindow } from './ports/attendance-window.repository.ts';
import {
  type AttendancePreviewReader,
  type AttendancePreviewScan,
} from './ports/attendance-preview.reader.ts';
import {
  ResolveAttendanceWindowUseCase,
  type AttendanceWindowMode,
} from './resolve-attendance-window.use-case.ts';

export type AttendancePreviewDirection = {
  direction: AttendanceDirection;
  existing: AttendancePreviewScan[];
  canScan: boolean;
};

export type PreviewAttendanceResult =
  | {
      kind: 'ready';
      window: AttendanceWindow;
      mode: AttendanceWindowMode;
      direction: AttendancePreviewDirection;
    }
  | { kind: 'window_not_found' }
  | { kind: 'window_unavailable'; availableWindows: AttendanceWindow[] }
  | { kind: 'not_registered' };

export class PreviewAttendanceUseCase {
  constructor(
    private readonly resolveWindow: ResolveAttendanceWindowUseCase,
    private readonly reader: AttendancePreviewReader,
  ) {}

  async execute(args: {
    eventId: number;
    studentId: number;
    at: Date;
    overrideWindowId?: number | null;
  }): Promise<PreviewAttendanceResult> {
    const resolution = await this.resolveWindow.execute({
      eventId: args.eventId,
      overrideWindowId: args.overrideWindowId,
      at: args.at,
    });
    if (resolution.kind === 'not_found') return { kind: 'window_not_found' };
    if (resolution.kind === 'unavailable') {
      return {
        kind: 'window_unavailable',
        availableWindows: resolution.availableWindows,
      };
    }

    const registered = await this.reader.isRegisteredForSession({
      eventId: args.eventId,
      studentId: args.studentId,
      sessionWindowId: resolution.window.id,
    });
    if (!registered) return { kind: 'not_registered' };

    const existing = await this.reader.listConfirmedScans({
      eventId: args.eventId,
      studentId: args.studentId,
      sessionWindowId: resolution.window.id,
    });
    const direction = computeDirection(existing);
    return {
      kind: 'ready',
      window: resolution.window,
      mode: resolution.mode,
      direction: {
        direction,
        existing,
        canScan: direction !== ATTENDANCE_DIRECTION.alreadyComplete,
      },
    };
  }
}
