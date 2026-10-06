import { isSameDay, minutesOfDay, parseMinutes } from '../../../../utils/time.ts';

export type AttendanceSessionWindow = {
  session_date?: string;
  start_time: string;
  end_time: string;
  late_after?: string | null;
  out_start?: string | null;
  out_end?: string | null;
  is_closed?: boolean;
};

/** Check-in after `late_after` (or session start if unset) is late, not blocked. */
export function isLateCheckIn(window: AttendanceSessionWindow, at: Date): boolean {
  const lateAfter = parseMinutes(window.late_after ?? window.start_time);
  if (lateAfter == null) return false;
  return minutesOfDay(at) > lateAfter;
}

/** Check-out before `out_start` (or session end if unset) is early. */
export function isEarlyCheckOut(window: AttendanceSessionWindow, at: Date): boolean {
  const outStart = parseMinutes(window.out_start ?? window.end_time);
  if (outStart == null) return false;
  return minutesOfDay(at) < outStart;
}

/**
 * Select the open window containing `at`. The end is exclusive so adjacent
 * windows cannot both own the same instant.
 */
export function pickWindowForTime<T extends AttendanceSessionWindow>(
  windows: readonly T[],
  at: Date,
): T | null {
  const minutes = minutesOfDay(at);
  for (const window of windows) {
    if (window.is_closed) continue;
    if (
      window.session_date &&
      !isSameDay(at, new Date(`${window.session_date}T00:00:00`))
    ) {
      continue;
    }
    const start = parseMinutes(window.start_time);
    const end = parseMinutes(window.out_end ?? window.end_time);
    if (start == null || end == null) continue;
    if (minutes >= start && minutes < end) return window;
  }
  return null;
}
