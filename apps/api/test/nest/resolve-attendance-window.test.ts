import { describe, expect, it } from 'bun:test';

import { ResolveAttendanceWindowUseCase } from '../../src/nest/modules/attendance/application/resolve-attendance-window.use-case.ts';
import {
  AttendanceWindowRepository,
  type AttendanceWindow,
} from '../../src/nest/modules/attendance/application/ports/attendance-window.repository.ts';

class FakeAttendanceWindowRepository extends AttendanceWindowRepository {
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

describe('ResolveAttendanceWindowUseCase', () => {
  const windows: AttendanceWindow[] = [
    {
      id: 10,
      event_id: 1,
      session_label: 'Morning',
      start_time: '07:00',
      end_time: '12:00',
      sort_order: 0,
    },
    {
      id: 20,
      event_id: 2,
      session_label: 'Other event',
      start_time: '07:00',
      end_time: '12:00',
      sort_order: 0,
    },
  ];
  const useCase = new ResolveAttendanceWindowUseCase(
    new FakeAttendanceWindowRepository(windows),
  );

  it('resolves the active automatic window', async () => {
    expect(
      await useCase.execute({ eventId: 1, at: new Date(2026, 8, 5, 8, 0) }),
    ).toMatchObject({ kind: 'resolved', mode: 'auto', window: { id: 10 } });
  });

  it('returns available windows when none is active', async () => {
    expect(
      await useCase.execute({ eventId: 1, at: new Date(2026, 8, 5, 12, 0) }),
    ).toMatchObject({ kind: 'unavailable', availableWindows: [{ id: 10 }] });
  });

  it('rejects a manual override owned by another event', async () => {
    expect(
      await useCase.execute({
        eventId: 1,
        at: new Date(2026, 8, 5, 8, 0),
        overrideWindowId: 20,
      }),
    ).toEqual({ kind: 'not_found' });
  });
});
