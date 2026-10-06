import { describe, expect, it } from 'bun:test';

import {
  ATTENDANCE_DIRECTION,
  computeDirection,
} from '../../src/nest/modules/attendance/domain/attendance-direction.policy.ts';
import {
  isEarlyCheckOut,
  isLateCheckIn,
  pickWindowForTime,
} from '../../src/nest/modules/attendance/domain/session-window.policy.ts';

describe('attendance domain policies', () => {
  const window = {
    id: 1,
    start_time: '07:00',
    end_time: '12:00',
    late_after: '07:30',
    out_start: '11:30',
  };

  it('derives the next direction from confirmed history', () => {
    expect(computeDirection([])).toBe(ATTENDANCE_DIRECTION.in);
    expect(computeDirection([{ direction: 'IN' }])).toBe(ATTENDANCE_DIRECTION.out);
    expect(computeDirection([{ direction: 'OUT' }])).toBe(
      ATTENDANCE_DIRECTION.alreadyComplete,
    );
    expect(computeDirection([{ direction: 'IN' }, { direction: 'OUT' }])).toBe(
      ATTENDANCE_DIRECTION.alreadyComplete,
    );
  });

  it('treats a session end as exclusive', () => {
    expect(pickWindowForTime([window], new Date(2026, 8, 5, 11, 59))?.id).toBe(1);
    expect(pickWindowForTime([window], new Date(2026, 8, 5, 12, 0))).toBeNull();
  });

  it('classifies late arrivals and early departures without blocking them', () => {
    expect(isLateCheckIn(window, new Date(2026, 8, 5, 7, 30))).toBe(false);
    expect(isLateCheckIn(window, new Date(2026, 8, 5, 7, 31))).toBe(true);
    expect(isEarlyCheckOut(window, new Date(2026, 8, 5, 11, 29))).toBe(true);
    expect(isEarlyCheckOut(window, new Date(2026, 8, 5, 11, 30))).toBe(false);
  });
});
