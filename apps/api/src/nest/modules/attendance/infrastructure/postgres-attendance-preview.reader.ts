import * as queries from '../../../../db/queries.ts';
import type { Queryable } from '../../../../types.ts';
import {
  AttendancePreviewReader,
  type AttendancePreviewScan,
} from '../application/ports/attendance-preview.reader.ts';

export class PostgresAttendancePreviewReader extends AttendancePreviewReader {
  constructor(private readonly db: Queryable) {
    super();
  }

  async isRegisteredForSession(args: {
    eventId: number;
    studentId: number;
    sessionWindowId: number;
  }): Promise<boolean> {
    return Boolean(
      await queries.getRegisteredSessionParticipant(
        this.db,
        args.eventId,
        args.studentId,
        args.sessionWindowId,
      ),
    );
  }

  async listConfirmedScans(args: {
    eventId: number;
    studentId: number;
    sessionWindowId: number;
  }): Promise<AttendancePreviewScan[]> {
    return queries.confirmedLogs(this.db, args);
  }
}
