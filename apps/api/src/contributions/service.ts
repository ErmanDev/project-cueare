import type { Pool } from 'pg';

import { withTransaction } from '../db/pool.ts';
import type { Queryable } from '../types.ts';
import { badRequest, conflict, isPgUniqueViolation, notFound } from '../utils/errors.ts';
import { decimal, dueDate, moneyCents, positiveId, text } from './validation.ts';

export class ContributionService {
  constructor(private readonly pool: Pool) {}

  private async event(db: Queryable, eventId: number, write = false) {
    const result = await db.query(`SELECT "eventId", "eventName", "eventStatusCode"
      FROM "Events" WHERE "eventId" = $1${write ? ' FOR SHARE' : ''}`, [eventId]);
    const event = result.rows[0];
    if (!event) throw notFound('Event not found');
    if (write && event.eventStatusCode === 'CANCELLED') throw conflict('Cancelled events cannot collect contributions');
    return event;
  }

  async report(eventId: number) {
    const event = await this.event(this.pool, eventId);
    const types = await this.pool.query(`SELECT "contributionTypeId" AS id, name,
      "defaultAmount"::float8 AS default_amount, "dueDate"::text AS due_date, "isRequired" AS is_required
      FROM "EventContributionTypes" WHERE "eventId" = $1 ORDER BY "contributionTypeId"`, [eventId]);
    const roster = await this.pool.query(`SELECT er."eventRegistrationId" AS registration_id,
      s."studentNumber" AS student_number, s."firstName" AS first_name, s."lastName" AS last_name,
      er."registrationStatusCode" AS registration_status
      FROM "EventRegistrations" er JOIN "Students" s ON s."studentId" = er."studentId"
      WHERE er."eventId" = $1 ORDER BY s."lastName", s."firstName", s."studentId"`, [eventId]);
    const contributions = await this.pool.query(`SELECT b."studentContributionId" AS id,
      b."eventRegistrationId" AS registration_id, b."contributionTypeId" AS type_id,
      t.name, s."studentNumber" AS student_number, s."firstName" AS first_name, s."lastName" AS last_name,
      b."amountDue"::float8 AS amount_due, b."waiverAmount"::float8 AS waiver_amount,
      b."waiverReason" AS waiver_reason, b."paidAmount"::float8 AS paid_amount,
      b."outstandingAmount"::float8 AS outstanding_amount, b.status
      FROM "VwStudentContributionBalances" b
      JOIN "EventContributionTypes" t ON t."contributionTypeId" = b."contributionTypeId"
      JOIN "EventRegistrations" er ON er."eventRegistrationId" = b."eventRegistrationId"
      JOIN "Students" s ON s."studentId" = er."studentId"
      WHERE b."eventId" = $1 ORDER BY s."lastName", s."firstName", b."studentContributionId"`, [eventId]);
    const payments = await this.pool.query(`SELECT p."contributionPaymentId" AS id,
      p."studentContributionId" AS contribution_id, p.amount::float8 AS amount,
      p."paymentMethodCode" AS method, p."paymentReference" AS reference,
      p."externalPaymentReference" AS external_reference, p."paymentStatusCode" AS status,
      p."receivedAtUtc" AS received_at, u."displayName" AS received_by,
      p."voidReason" AS void_reason, p."voidedAtUtc" AS voided_at, v."displayName" AS voided_by
      FROM "ContributionPayments" p
      JOIN "StudentContributions" sc ON sc."studentContributionId" = p."studentContributionId"
      JOIN "Users" u ON u."userId" = p."receivedByUserId"
      LEFT JOIN "Users" v ON v."userId" = p."voidedByUserId"
      WHERE sc."eventId" = $1 ORDER BY p."contributionPaymentId" DESC`, [eventId]);
    return { event_id: eventId, event_name: event.eventName, event_status: event.eventStatusCode,
      types: types.rows, roster: roster.rows, contributions: contributions.rows, payments: payments.rows };
  }

  async createType(eventId: number, body: Record<string, unknown>, actorId: number) {
    const name = text(body.name, 'name', 200);
    const amount = decimal(moneyCents(body.default_amount, 'default_amount'));
    const date = dueDate(body.due_date);
    if (body.is_required !== undefined && typeof body.is_required !== 'boolean') throw badRequest('is_required must be a boolean');
    try {
      return await withTransaction(this.pool, async (db) => {
        await this.event(db, eventId, true);
        const result = await db.query(`INSERT INTO "EventContributionTypes"
          ("eventId", name, "defaultAmount", "dueDate", "isRequired", "createdByUserId")
          VALUES ($1, $2, $3, $4, $5, $6) RETURNING "contributionTypeId" AS id`,
        [eventId, name, amount, date, body.is_required ?? true, actorId]);
        return result.rows[0];
      });
    } catch (error) {
      if (isPgUniqueViolation(error)) throw conflict('A contribution with this name already exists for the event');
      throw error;
    }
  }

  async assign(eventId: number, typeId: number, body: Record<string, unknown>, actorId: number) {
    const all = body.all_students === true;
    if (body.all_students !== undefined && typeof body.all_students !== 'boolean') throw badRequest('all_students must be a boolean');
    if (all && body.registration_ids !== undefined) throw badRequest('Choose either the entire roster or selected students');
    const rawIds = body.registration_ids;
    if (!all && (!Array.isArray(rawIds) || rawIds.length === 0 || rawIds.length > 5000)) {
      throw badRequest('Select at least one student (maximum 5000) or assign to the entire roster');
    }
    const ids = all ? [] : [...new Set((rawIds as unknown[]).map((id) => positiveId(id, 'registration_id')))];
    return withTransaction(this.pool, async (db) => {
      await this.event(db, eventId, true);
      const type = (await db.query(`SELECT "defaultAmount" FROM "EventContributionTypes"
        WHERE "eventId" = $1 AND "contributionTypeId" = $2`, [eventId, typeId])).rows[0];
      if (!type) throw notFound('Contribution type not found for this event');
      const registrations = await db.query(`SELECT "eventRegistrationId" FROM "EventRegistrations"
        WHERE "eventId" = $1 AND "registrationStatusCode" = 'ACTIVE'
          AND ($2::boolean OR "eventRegistrationId" = ANY($3::bigint[]))
        ORDER BY "eventRegistrationId" FOR SHARE`, [eventId, all, ids]);
      if (!all && registrations.rows.length !== ids.length) throw badRequest('Selected students must be active registrations in this event');
      if (!registrations.rows.length) throw badRequest('The event has no active registrations. Add students to its roster first');
      const amount = body.amount_due === undefined ? String(type.defaultAmount) : decimal(moneyCents(body.amount_due, 'amount_due'));
      const result = await db.query(`INSERT INTO "StudentContributions"
        ("eventId", "eventRegistrationId", "contributionTypeId", "amountDue", "assignedByUserId")
        SELECT $1, r, $2, $3, $4 FROM unnest($5::bigint[]) AS r
        ON CONFLICT ("eventRegistrationId", "contributionTypeId") DO NOTHING
        RETURNING "studentContributionId"`, [eventId, typeId, amount, actorId,
        registrations.rows.map((r) => r.eventRegistrationId)]);
      return { assigned_count: result.rows.length, already_assigned_count: registrations.rows.length - result.rows.length };
    });
  }

  private async lockedContribution(db: Queryable, eventId: number, contributionId: number) {
    const row = (await db.query(`SELECT * FROM "StudentContributions"
      WHERE "eventId" = $1 AND "studentContributionId" = $2 FOR UPDATE`, [eventId, contributionId])).rows[0];
    if (!row) throw notFound('Student contribution not found for this event');
    const paid = (await db.query(`SELECT COALESCE(SUM(amount), 0)::text AS amount
      FROM "ContributionPayments" WHERE "studentContributionId" = $1 AND "paymentStatusCode" = 'CONFIRMED'`, [contributionId])).rows[0]!;
    return { row, paid: moneyCents(paid.amount, 'paid amount', true) };
  }

  async pay(eventId: number, contributionId: number, body: Record<string, unknown>, actorId: number) {
    const cents = moneyCents(body.amount);
    const method = text(body.method, 'method', 30);
    if (!['CASH', 'GCASH', 'BANK_TRANSFER', 'OTHER'].includes(method)) throw badRequest('Unsupported payment method');
    const reference = text(body.reference, 'reference');
    const external = body.external_reference == null || body.external_reference === '' ? null : text(body.external_reference, 'external_reference');
    try {
      return await withTransaction(this.pool, async (db) => {
        await this.event(db, eventId, true);
        const { row, paid } = await this.lockedContribution(db, eventId, contributionId);
        const existing = (await db.query(`SELECT * FROM "ContributionPayments" WHERE "paymentReference" = $1`, [reference])).rows[0];
        if (existing) {
          if (existing.studentContributionId === contributionId && moneyCents(existing.amount) === cents &&
              existing.paymentMethodCode === method && existing.externalPaymentReference === external && existing.paymentStatusCode === 'CONFIRMED') {
            return { id: existing.contributionPaymentId, reference, replayed: true };
          }
          throw conflict('This receipt reference has already been used');
        }
        const outstanding = moneyCents(row.amountDue) - moneyCents(row.waiverAmount, 'waiver', true) - paid;
        if (cents > outstanding) throw conflict('Payment exceeds the remaining contribution balance');
        const result = await db.query(`INSERT INTO "ContributionPayments"
          ("studentContributionId", amount, "paymentMethodCode", "paymentReference", "externalPaymentReference", "receivedByUserId")
          VALUES ($1, $2, $3, $4, $5, $6) RETURNING "contributionPaymentId" AS id`,
        [contributionId, decimal(cents), method, reference, external, actorId]);
        return { ...result.rows[0], reference, replayed: false };
      });
    } catch (error) {
      if (isPgUniqueViolation(error)) throw conflict('Receipt or external payment reference has already been used');
      throw error;
    }
  }

  async voidPayment(eventId: number, paymentId: number, body: Record<string, unknown>, actorId: number) {
    const reason = text(body.reason, 'reason', 1000);
    return withTransaction(this.pool, async (db) => {
      await this.event(db, eventId, true);
      const payment = (await db.query(`SELECT p."studentContributionId" FROM "ContributionPayments" p
        JOIN "StudentContributions" sc ON sc."studentContributionId" = p."studentContributionId"
        WHERE sc."eventId" = $1 AND p."contributionPaymentId" = $2`, [eventId, paymentId])).rows[0];
      if (!payment) throw notFound('Payment not found for this event');
      await this.lockedContribution(db, eventId, payment.studentContributionId);
      const result = await db.query(`UPDATE "ContributionPayments" SET "paymentStatusCode" = 'VOIDED',
        "voidReason" = $3, "voidedByUserId" = $4, "voidedAtUtc" = clock_timestamp()
        WHERE "contributionPaymentId" = $1 AND "studentContributionId" = $2 AND "paymentStatusCode" = 'CONFIRMED'
        RETURNING "contributionPaymentId" AS id`, [paymentId, payment.studentContributionId, reason, actorId]);
      if (!result.rows.length) throw conflict('Payment has already been voided');
      return result.rows[0];
    });
  }

  async waive(eventId: number, contributionId: number, body: Record<string, unknown>, actorId: number) {
    const cents = moneyCents(body.amount);
    const reason = text(body.reason, 'reason', 1000);
    return withTransaction(this.pool, async (db) => {
      await this.event(db, eventId, true);
      const { row, paid } = await this.lockedContribution(db, eventId, contributionId);
      if (moneyCents(row.waiverAmount, 'waiver', true) > 0) throw conflict('This contribution already has a waiver');
      if (cents > moneyCents(row.amountDue) - paid) throw conflict('Waiver exceeds the remaining contribution balance');
      await db.query(`UPDATE "StudentContributions" SET "waiverAmount" = $2, "waiverReason" = $3,
        "waivedByUserId" = $4, "waivedAtUtc" = clock_timestamp() WHERE "studentContributionId" = $1`,
      [contributionId, decimal(cents), reason, actorId]);
      return { id: contributionId };
    });
  }
}
