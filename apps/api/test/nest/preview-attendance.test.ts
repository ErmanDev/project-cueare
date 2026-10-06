import { describe, expect, it } from 'bun:test';

import { PreviewAttendanceUseCase } from '../../src/nest/modules/attendance/application/preview-attendance.use-case.ts';
import {
  AttendancePreviewReader,
  type AttendancePreviewScan,
} from '../../src/nest/modules/attendance/application/ports/attendance-preview.reader.ts';
import {
  AttendanceWindowRepository,
  type AttendanceWindow,
} from '../../src/nest/modules/attendance/application/ports/attendance-window.repository.ts';
import { ResolveAttendanceWindowUseCase } from '../../src/nest/modules/attendance/application/resolve-attendance-window.use-case.ts';

class FakeWindowRepository extends AttendanceWindowRepository {
  constructor(private readonly windows: AttendanceWindow[]) {
    super();
  }

  async findById(id: number): Promise<AttendanceWindow | null> {
    return this.windows.find((window) => window.id === id) ?? null;
  }

  async listForEvent(eventId: number): Promise<AttendanceWindow[]> {
    return this.windows.filter((window) => window.event_id === eventId);
  }
}

class FakePreviewReader extends AttendancePreviewReader {
  constructor(
    private readonly registered: boolean,
    private readonly scans: AttendancePreviewScan[] = [],
  ) {
    super();
  }

  async isRegisteredForSession(): Promise<boolean> {
    return this.registered;
  }

  async listConfirmedScans(): Promise<AttendancePreviewScan[]> {
    return this.scans;
  }
}

const window: AttendanceWindow = {
  id: 10,
  event_id: 1,
  session_label: 'Morning',
  start_time: '07:00',
  end_time: '12:00',
  sort_order: 0,
};

function useCase(
  registered: boolean,
  scans: AttendancePreviewScan[] = [],
): PreviewAttendanceUseCase {
  return new PreviewAttendanceUseCase(
    new ResolveAttendanceWindowUseCase(new FakeWindowRepository([window])),
    new FakePreviewReader(registered, scans),
  );
}

describe('PreviewAttendanceUseCase', () => {
  it('returns an IN preview for a registered student without scans', async () => {
    expect(
      await useCase(true).execute({
        eventId: 1,
        studentId: 7,
        at: new Date(2026, 8, 5, 8, 0),
      }),
    ).toMatchObject({
      kind: 'ready',
      mode: 'auto',
      direction: { direction: 'IN', canScan: true, existing: [] },
    });
  });

  it('rejects a student outside the selected session roster', async () => {
    expect(
      await useCase(false).execute({
        eventId: 1,
        studentId: 7,
        at: new Date(2026, 8, 5, 8, 0),
      }),
    ).toEqual({ kind: 'not_registered' });
  });

  it('marks a completed attendance history as non-scannable', async () => {
    const scans = [
      { direction: 'IN', scanned_at: new Date(2026, 8, 5, 8, 0) },
      { direction: 'OUT', scanned_at: new Date(2026, 8, 5, 11, 0) },
    ];
    expect(
      await useCase(true, scans).execute({
        eventId: 1,
        studentId: 7,
        at: new Date(2026, 8, 5, 11, 30),
      }),
    ).toMatchObject({
      kind: 'ready',
      direction: { direction: 'ALREADY_COMPLETE', canScan: false },
    });
  });
});
