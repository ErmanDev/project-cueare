# Event contributions

The staff web console supports monetary event contributions in PHP. Open **Events → Event contributions** (the contribution action beside each event).

1. Add a contribution name, default amount, optional due date, and required/optional designation.
2. Assign it to the active roster or selected students. The amount is copied to each assignment. Reassigning skips existing assignments and preserves their original amounts. Students added to the roster later must be assigned explicitly. Optional contributions should be assigned to students who opt in.
3. Record received funds against a student assignment. Multiple installments are supported. Each confirmed payment retains its receipt reference, optional external transaction reference, method, collector, and timestamp.
4. Review balances and payment history. Void an incorrect payment with a reason to restore the balance while retaining its history. A contribution can receive one partial or full waiver, with an amount, reason, actor, and timestamp.

## Data model

- `EventContributionTypes`: event-owned contribution definition, default amount, due date, required flag, creator.
- `StudentContributions`: event registration + contribution type, copied amount due, waiver details, assigner. The pair is unique. Composite foreign keys enforce that the registration and type belong to the same event.
- `ContributionPayments`: individual confirmed or voided payment, receipt, collection and void details.
- `VwStudentContributionBalances`: amount due minus waiver minus confirmed payments; derives unpaid, partially paid, paid, or fully waived status.

Currency is stored as PostgreSQL `numeric(12,2)` and compared as integer cents in the API. Payment, void, and waiver operations serialize on the assignment row so concurrent requests cannot overpay. Retrying an identical confirmed receipt returns the original payment; reusing it for different details is rejected. External references are unique per payment method, including voided payments.

Cancelled events are read-only for contributions. Closed events can still collect outstanding contributions. Events with contribution definitions cannot be deleted, preserving collection history. Attendance and fine calculation do not depend on contribution balances.

## Migration and rollout

Migration **0002: event_contributions** adds the tables and view without modifying the frozen baseline migration or existing attendance/fine rows. Apply through the normal deployment workflow from `apps/api`:

```powershell
bun run migrate:status
bun run migrate:up
bun run migrate:verify
```

Restart the API and deploy the web build after migration. This feature's implementation and verification do not apply the migration to the application's `ssc` schema. Tests use isolated schemas.

To roll back application code, deploy the previous build and retain migration 0002 and its data. Do not drop contribution tables after collections have been recorded.

## Admin API

All routes require the existing superadmin authentication. Base: `/api/admin/events/:eventId/contributions`.

| Method | Path | Body |
|---|---|---|
| GET | `/` | Report: types, roster, student balances, payment history |
| POST | `/types` | `name`, `default_amount`, optional `due_date`, `is_required` |
| POST | `/types/:typeId/assign` | `all_students: true` or `registration_ids: [...]`; optional `amount_due` |
| POST | `/:contributionId/payments` | `amount`, `method`, `reference`, optional `external_reference` |
| POST | `/payments/:paymentId/void` | `reason` |
| POST | `/:contributionId/waive` | `amount`, `reason` |

Methods: `CASH`, `GCASH`, `BANK_TRANSFER`, `OTHER`. Amounts accept decimal strings or numbers with at most two decimal places; send decimal strings for exact input. Contributions are separate from attendance fines. The Flutter student UI has not been extended in this change.
