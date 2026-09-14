import { describe, expect, it } from 'bun:test';

import { calculateFines, type FineStatus } from '../src/fines/calculation.ts';

const morning: FineStatus = {
  participantId: 10, studentId: 1, sessionId: 100,
  sessionStartsAt: new Date('2026-09-14T00:00:00Z'),
  sessionEndsAt: new Date('2026-09-14T04:00:00Z'),
  lateAfterAt: new Date('2026-09-14T00:30:00Z'),
  isClosed: true, requiresCheckout: true, isRequired: true, isExcused: false,
  checkedInAt: null, checkedOutAt: null,
};
const rules = [
  { sessionId: 100, violationCode: 'ABSENT', amount: 80, priority: 1 },
  { sessionId: 100, violationCode: 'LATE', amount: 30, priority: 2 },
  { sessionId: 100, violationCode: 'MISSED_CHECKOUT', amount: 40, priority: 3 },
];

describe('event fine calculation', () => {
  it('assesses absence exclusively and ignores excused or optional participants', () => {
    expect(calculateFines({ statuses: [morning, { ...morning, participantId: 11, isExcused: true },
      { ...morning, participantId: 12, isRequired: false }], rules, existing: [], maximumPerStudent: null }))
      .toEqual([{ participantId: 10, studentId: 1, sessionId: 100, violationCode: 'ABSENT', amount: 80 }]);
  });

  it('stacks late and missed checkout, then caps the cumulative student amount', () => {
    const late = { ...morning, checkedInAt: new Date('2026-09-14T00:45:00Z') };
    expect(calculateFines({ statuses: [late], rules, existing: [], maximumPerStudent: 50 }))
      .toEqual([
        { participantId: 10, studentId: 1, sessionId: 100, violationCode: 'LATE', amount: 30 },
        { participantId: 10, studentId: 1, sessionId: 100, violationCode: 'MISSED_CHECKOUT', amount: 20 },
      ]);
  });

  it('does not reassess an existing violation and counts it toward the event cap', () => {
    const late = { ...morning, checkedInAt: new Date('2026-09-14T00:45:00Z') };
    const existing = [{ participantId: 10, studentId: 1, sessionId: 100, violationCode: 'LATE', amount: 30 }];
    expect(calculateFines({ statuses: [late], rules, existing, maximumPerStudent: 50 }))
      .toEqual([{ participantId: 10, studentId: 1, sessionId: 100, violationCode: 'MISSED_CHECKOUT', amount: 20 }]);
  });
});
