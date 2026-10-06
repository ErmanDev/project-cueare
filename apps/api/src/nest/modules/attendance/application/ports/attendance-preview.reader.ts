export type AttendancePreviewScan = {
  direction: string;
  scanned_at: Date;
};

export abstract class AttendancePreviewReader {
  abstract isRegisteredForSession(args: {
    eventId: number;
    studentId: number;
    sessionWindowId: number;
  }): Promise<boolean>;

  abstract listConfirmedScans(args: {
    eventId: number;
    studentId: number;
    sessionWindowId: number;
  }): Promise<AttendancePreviewScan[]>;
}
