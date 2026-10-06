import { isSameDay, minutesOfDay, parseIsoDateTime, parseMinutes } from '../../../../utils/time.ts';
import { ATTENDANCE_DIRECTION, type AttendanceDirection } from './attendance-direction.policy.ts';
import type { AttendanceSessionWindow } from './session-window.policy.ts';

export type AttendanceEventSchedule = {
  event_start_date: Date;
};

export type ScanEligibilityWindow = AttendanceSessionWindow & {
  session_label: string;
};

export type ScanEligibilityIssue =
  | { code: 'SESSION_CLOSED' }
  | { code: 'EVENT_NOT_TODAY'; eventDate: Date }
  | { code: 'INVALID_WINDOW' }
  | { code: 'SESSION_NOT_STARTED' }
  | { code: 'SESSION_ENDED'; action: 'check_in' | 'check_out' };

function sessionDay(
  event: AttendanceEventSchedule,
  window: ScanEligibilityWindow,
): Date {
  return window.session_date
    ? parseIsoDateTime(window.session_date) ?? new Date(`${window.session_date}T00:00:00`)
    : event.event_start_date;
}

function commonEligibility(
  event: AttendanceEventSchedule,
  window: ScanEligibilityWindow,
  at: Date,
): ScanEligibilityIssue | { start: number; end: number } {
  if (window.is_closed) return { code: 'SESSION_CLOSED' };
  const eventDate = sessionDay(event, window);
  if (!isSameDay(at, eventDate)) return { code: 'EVENT_NOT_TODAY', eventDate };
  const start = parseMinutes(window.start_time);
  const end = parseMinutes(window.end_time);
  if (start == null || end == null) return { code: 'INVALID_WINDOW' };
  if (minutesOfDay(at) < start) return { code: 'SESSION_NOT_STARTED' };
  return { start, end };
}

export function evaluateAutomaticScan(args: {
  event: AttendanceEventSchedule;
  window: ScanEligibilityWindow;
  direction: AttendanceDirection;
  at: Date;
}): ScanEligibilityIssue | null {
  const common = commonEligibility(args.event, args.window, args.at);
  if ('code' in common) return common;
  const minutes = minutesOfDay(args.at);
  if (args.direction !== ATTENDANCE_DIRECTION.out) {
    return minutes >= common.end
      ? { code: 'SESSION_ENDED', action: 'check_in' }
      : null;
  }
  const closes = parseMinutes(args.window.out_end ?? args.window.end_time) ?? common.end;
  return minutes >= closes
    ? { code: 'SESSION_ENDED', action: 'check_out' }
    : null;
}

export function evaluateManualScan(args: {
  event: AttendanceEventSchedule;
  window: ScanEligibilityWindow;
  at: Date;
}): ScanEligibilityIssue | null {
  const common = commonEligibility(args.event, args.window, args.at);
  return 'code' in common ? common : null;
}
