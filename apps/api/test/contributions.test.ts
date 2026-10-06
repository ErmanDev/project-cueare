import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import type { Pool } from 'pg';
import { ContributionService } from '../src/contributions/service.ts';
import * as q from '../src/db/queries.ts';
import { closeTestDatabase, openTestDatabase } from './support/database.ts';

const schema = 'contributions_test';
describe('event contribution accounting', () => {
  let pool: Pool | null = null;
  let service: ContributionService;
  let actor: number;
  let event: number;
  let otherEvent: number;
  let registration: number;
  let otherRegistration: number;
  let typeId: number;
  let contribution: number;

  beforeAll(async () => { pool = await openTestDatabase(schema); });
  afterAll(async () => { await closeTestDatabase(pool ?? undefined, schema); });
  beforeEach(async () => {
    if (!pool) return;
    service = new ContributionService(pool);
    await pool.query('TRUNCATE "Users", "Students", "Events" RESTART IDENTITY CASCADE');
    actor = (await q.insertUser(pool, { name: 'Collector', username: 'collector', passwordHash: 'unused', role: 'superadmin' })).id;
    const student = await q.insertStudent(pool, { studentIdCode: 'STU-2026-0001', fullName: 'Ana Santos', section: 'BSIT-3A', photoUrl: null });
    const input = { eventStartDate: new Date(2099, 8, 5), eventEndDate: new Date(2099, 8, 5), isActive: false, createdBy: actor };
    event = (await q.insertEvent(pool, { ...input, name: 'Foundation Day' })).id;
    otherEvent = (await q.insertEvent(pool, { ...input, name: 'Other Event' })).id;
    const enrollment = (await pool.query('SELECT "studentEnrollmentId" FROM "StudentEnrollments" WHERE "studentId" = $1', [student.id])).rows[0]!;
    for (const id of [event, otherEvent]) {
      const row = (await pool.query(`INSERT INTO "EventRegistrations" ("eventId", "studentId", "studentEnrollmentId", "registeredByUserId")
        VALUES ($1, $2, $3, $4) RETURNING "eventRegistrationId"`, [id, student.id, enrollment.studentEnrollmentId, actor])).rows[0]!;
      if (id === event) registration = row.eventRegistrationId; else otherRegistration = row.eventRegistrationId;
    }
    typeId = (await service.createType(event, { name: 'Event food', default_amount: '200.00', is_required: true }, actor))!.id;
    await service.assign(event, typeId, { registration_ids: [registration] }, actor);
    contribution = (await service.report(event)).contributions[0]!.id;
  });

  it('supports installments, receipt retries, paid status, and audited voids', async () => {
    if (!pool) return;
    const first = await service.pay(event, contribution, { amount: '100.01', method: 'CASH', reference: 'R1' }, actor);
    expect(await service.pay(event, contribution, { amount: '100.01', method: 'CASH', reference: 'R1' }, actor)).toMatchObject({ id: first.id, replayed: true });
    expect((await service.report(event)).contributions[0]).toMatchObject({ paid_amount: 100.01, outstanding_amount: 99.99, status: 'PARTIALLY_PAID' });
    await expect(service.pay(event, contribution, { amount: '100', method: 'CASH', reference: 'R2' }, actor)).rejects.toThrow('exceeds');
    await service.pay(event, contribution, { amount: '99.99', method: 'GCASH', reference: 'R2', external_reference: 'GC1' }, actor);
    expect((await service.report(event)).contributions[0]).toMatchObject({ paid_amount: 200, outstanding_amount: 0, status: 'PAID' });
    await service.voidPayment(event, first.id, { reason: 'Incorrect receipt' }, actor);
    const report = await service.report(event);
    expect(report.contributions[0]).toMatchObject({ paid_amount: 99.99, outstanding_amount: 100.01 });
    expect(report.payments.find((p) => p.id === first.id)).toMatchObject({ status: 'VOIDED', void_reason: 'Incorrect receipt', voided_by: 'Collector' });
    await expect(service.voidPayment(event, first.id, { reason: 'Again' }, actor)).rejects.toThrow('already been voided');
    await expect(service.pay(event, contribution, { amount: '100.01', method: 'CASH', reference: 'R1' }, actor)).rejects.toThrow('already been used');
  });

  it('assigns the roster idempotently without overwriting original amounts', async () => {
    if (!pool) return;
    expect(await service.assign(event, typeId, { all_students: true, amount_due: '99' }, actor)).toEqual({ assigned_count: 0, already_assigned_count: 1 });
    expect((await service.report(event)).contributions[0]!.amount_due).toBe(200);
    await expect(service.assign(event, typeId, { all_students: true, registration_ids: [registration] }, actor)).rejects.toThrow('either');
    await expect(service.createType(event, { name: 'Event food', default_amount: '50' }, actor)).rejects.toThrow('already exists');
  });

  it('rejects cross-event assignments, payments, and voids and enforces ownership in SQL', async () => {
    if (!pool) return;
    await expect(service.assign(event, typeId, { registration_ids: [otherRegistration] }, actor)).rejects.toThrow('active registrations');
    await expect(service.assign(otherEvent, typeId, { all_students: true }, actor)).rejects.toThrow('not found');
    await expect(service.pay(otherEvent, contribution, { amount: '10', method: 'CASH', reference: 'WRONG' }, actor)).rejects.toThrow('not found');
    const payment = await service.pay(event, contribution, { amount: '10', method: 'CASH', reference: 'OWNED' }, actor);
    await expect(service.voidPayment(otherEvent, payment.id, { reason: 'Wrong event' }, actor)).rejects.toThrow('not found');
    await expect(pool.query(`INSERT INTO "StudentContributions" ("eventId", "eventRegistrationId", "contributionTypeId", "amountDue", "assignedByUserId")
      VALUES ($1, $2, $3, 200, $4)`, [event, otherRegistration, typeId, actor])).rejects.toMatchObject({ code: '23503' });
  });

  it('serializes simultaneous payments so they cannot overpay', async () => {
    if (!pool) return;
    const results = await Promise.allSettled([
      service.pay(event, contribution, { amount: '150', method: 'CASH', reference: 'A' }, actor),
      service.pay(event, contribution, { amount: '150', method: 'CASH', reference: 'B' }, actor),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect((await service.report(event)).contributions[0]).toMatchObject({ paid_amount: 150, outstanding_amount: 50 });
  });

  it('rejects reused external references and preserves balances', async () => {
    if (!pool) return;
    await service.pay(event, contribution, { amount: '50', method: 'GCASH', reference: 'A', external_reference: 'TX1' }, actor);
    await expect(service.pay(event, contribution, { amount: '50', method: 'GCASH', reference: 'B', external_reference: 'TX1' }, actor)).rejects.toThrow('already been used');
    expect((await service.report(event)).contributions[0]!.paid_amount).toBe(50);
  });

  it('waives only the remaining balance, requires a reason, and retains the waiver', async () => {
    if (!pool) return;
    await service.pay(event, contribution, { amount: '100', method: 'CASH', reference: 'P' }, actor);
    await expect(service.waive(event, contribution, { amount: '101', reason: 'Approved exemption' }, actor)).rejects.toThrow('exceeds');
    await expect(service.waive(event, contribution, { amount: '100', reason: '' }, actor)).rejects.toThrow('reason');
    await service.waive(event, contribution, { amount: '100', reason: 'Approved exemption' }, actor);
    expect((await service.report(event)).contributions[0]).toMatchObject({ outstanding_amount: 0, waiver_amount: 100, waiver_reason: 'Approved exemption', status: 'PAID' });
    await expect(service.waive(event, contribution, { amount: '1', reason: 'Again' }, actor)).rejects.toThrow('already has');
  });

  it('shows fully waived status and blocks collecting on cancelled events', async () => {
    if (!pool) return;
    await service.waive(event, contribution, { amount: '200', reason: 'Exempt student' }, actor);
    expect((await service.report(event)).contributions[0]).toMatchObject({ status: 'WAIVED', outstanding_amount: 0 });
    await pool.query(`UPDATE "Events" SET "eventStatusCode" = 'CANCELLED' WHERE "eventId" = $1`, [event]);
    await expect(service.createType(event, { name: 'Materials', default_amount: '10' }, actor)).rejects.toThrow('Cancelled');
    await expect(service.pay(event, contribution, { amount: '10', method: 'CASH', reference: 'C' }, actor)).rejects.toThrow('Cancelled');
  });

  it('preserves contribution history when deleting an event', async () => {
    if (!pool) return;
    await expect(q.deleteEvent(pool, event)).rejects.toThrow('collection history');
    expect((await service.report(event)).contributions).toHaveLength(1);
  });
});
