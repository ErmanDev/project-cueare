import type { AttendanceCatalog } from '../../../../attendance/catalog.ts';
import * as queries from '../../../../db/queries.ts';
import type { Queryable } from '../../../../types.ts';
import {
  AttendanceWindowRepository,
  type AttendanceWindow,
} from '../application/ports/attendance-window.repository.ts';

export class PostgresAttendanceWindowRepository extends AttendanceWindowRepository {
  constructor(
    private readonly db: Queryable,
    private readonly catalog?: AttendanceCatalog,
  ) {
    super();
  }

  async findById(id: number): Promise<AttendanceWindow | null> {
    return this.catalog
      ? this.catalog.getWindowById(id)
      : queries.getWindowById(this.db, id);
  }

  async listForEvent(eventId: number): Promise<AttendanceWindow[]> {
    return this.catalog
      ? this.catalog.windowsForEvent(eventId)
      : queries.windowsForEvent(this.db, eventId);
  }
}
