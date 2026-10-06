export type FineStatus = {
  participantId: number;
  studentId: number;
  sessionId: number;
  sessionStartsAt: Date;
  sessionEndsAt: Date;
  isClosed: boolean;
  requiresCheckout: boolean;
  isRequired: boolean;
  isExcused: boolean;
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
  lateAfterAt: Date;
};

export type FineRule = {
  sessionId: number;
  violationCode: string;
  amount: number;
  priority: number;
};

export type FineAssessment = {
  participantId: number;
  studentId: number;
  sessionId: number;
  violationCode: string;
  amount: number;
};

export function calculateFines(args: {
  statuses: FineStatus[];
  rules: FineRule[];
  existing: FineAssessment[];
  maximumPerStudent: number | null;
}): FineAssessment[] {
  const rulesBySession = new Map<number, FineRule[]>();
  for (const rule of args.rules) {
    if (rule.amount <= 0) continue;
    const current = rulesBySession.get(rule.sessionId) ?? [];
    current.push(rule);
    rulesBySession.set(rule.sessionId, current);
  }
  const alreadyAssessed = new Set(args.existing.map((row) => `${row.participantId}:${row.violationCode}`));
  const usedCents = new Map<number, number>();
  for (const row of args.existing) {
    usedCents.set(row.studentId, (usedCents.get(row.studentId) ?? 0) + Math.round(row.amount * 100));
  }
  const candidates: Array<{ status: FineStatus; rule: FineRule }> = [];
  for (const status of args.statuses) {
    if (!status.isRequired || status.isExcused) continue;
    const violations = status.checkedInAt == null
      ? ['ABSENT']
      : [
          ...(status.checkedInAt > status.lateAfterAt ? ['LATE'] : []),
          ...(status.requiresCheckout && status.checkedOutAt == null ? ['MISSED_CHECKOUT'] : []),
        ];
    for (const rule of rulesBySession.get(status.sessionId) ?? []) {
      if (!violations.includes(rule.violationCode)) continue;
      if (alreadyAssessed.has(`${status.participantId}:${rule.violationCode}`)) continue;
      candidates.push({ status, rule });
    }
  }
  candidates.sort((a, b) =>
    a.status.sessionStartsAt.getTime() - b.status.sessionStartsAt.getTime() ||
    a.status.studentId - b.status.studentId ||
    a.rule.priority - b.rule.priority ||
    a.rule.violationCode.localeCompare(b.rule.violationCode),
  );

  const capCents = args.maximumPerStudent == null ? null : Math.round(args.maximumPerStudent * 100);
  const result: FineAssessment[] = [];
  for (const { status, rule } of candidates) {
    const amountCents = Math.round(rule.amount * 100);
    const used = usedCents.get(status.studentId) ?? 0;
    const allowed = capCents == null ? amountCents : Math.min(amountCents, Math.max(0, capCents - used));
    if (allowed <= 0) continue;
    result.push({
      participantId: status.participantId,
      studentId: status.studentId,
      sessionId: status.sessionId,
      violationCode: rule.violationCode,
      amount: allowed / 100,
    });
    usedCents.set(status.studentId, used + allowed);
  }
  return result;
}
