export const ATTENDANCE_DIRECTION = {
  in: 'IN',
  out: 'OUT',
  alreadyComplete: 'ALREADY_COMPLETE',
} as const;

export type AttendanceDirection =
  (typeof ATTENDANCE_DIRECTION)[keyof typeof ATTENDANCE_DIRECTION];

export type ConfirmedAttendanceScan = {
  direction: string;
};

/** Determine the next legal scan direction from confirmed attendance history. */
export function computeDirection(
  confirmedExisting: readonly ConfirmedAttendanceScan[],
): AttendanceDirection {
  if (confirmedExisting.length === 0) return ATTENDANCE_DIRECTION.in;
  if (
    confirmedExisting.length === 1 &&
    confirmedExisting[0]?.direction === ATTENDANCE_DIRECTION.in
  ) {
    return ATTENDANCE_DIRECTION.out;
  }
  return ATTENDANCE_DIRECTION.alreadyComplete;
}
