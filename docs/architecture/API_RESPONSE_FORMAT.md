# API response format

## Compatibility and versioning

The response envelope is introduced additively under `/api/v2`. Existing
unversioned, `/api`, `/api/v1`, and `/v1` endpoints keep their published response
shapes until their consumers have migrated. Do not apply the v2 interceptor to a
legacy controller.

Every v2 response includes an `X-Request-Id` header. A valid caller-provided
`X-Request-Id` is retained; otherwise the API generates one. The same identifier
appears in `meta.requestId`, structured request logs, and transactional audit
events for audited commands.

## Successful response

HTTP status codes remain authoritative. The body does not repeat `success` or
`statusCode`, and optional properties are omitted instead of returned as `null`.

```json
{
  "data": {
    "id": 123,
    "name": "Test Student"
  },
  "meta": {
    "requestId": "req_01JXYZ"
  }
}
```

Use `200` for successful reads and updates, `201` when a resource is created,
`202` when work has only been accepted, and `204` when no response body is
returned.

## Paginated response

Records remain directly in `data`; do not use `data.data`.

```json
{
  "data": [
    { "id": 1, "name": "Item 1" },
    { "id": 2, "name": "Item 2" }
  ],
  "meta": {
    "requestId": "req_01JXYZ",
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "totalItems": 50,
      "totalPages": 3,
      "hasNextPage": true,
      "hasPreviousPage": false
    }
  }
}
```

## Error response

Clients branch on `error.code`, never on human-readable message text.

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "One or more fields are invalid.",
    "details": [
      {
        "field": "email",
        "code": "REQUIRED",
        "message": "Email is required."
      }
    ]
  },
  "meta": {
    "requestId": "req_01JXYZ"
  }
}
```

Stable default codes are `VALIDATION_FAILED`, `AUTHENTICATION_FAILED`,
`FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `UNPROCESSABLE_ENTITY`, `RATE_LIMITED`,
and `INTERNAL_ERROR`. Domain-specific codes may replace these defaults when a
client needs to distinguish business cases.

Production `500` responses must not expose database errors, stack traces, SQL,
or internal exception messages.

## Responses that are not enveloped

Do not wrap:

- `204 No Content` responses;
- file and CSV downloads;
- Server-Sent Events or streaming bodies;
- WebSocket and Socket.IO messages;
- redirects.

## NestJS implementation

- `ApiResponseInterceptor` wraps successful v2 controller results.
- `ApiErrorFilter` selects the v2 error format by request path while preserving
  legacy errors.
- `paginationMeta` produces the shared pagination fields.
- Controllers return domain payloads and do not construct envelopes themselves.

### Native attendance write routes

The additive v2 attendance scan workflow is owned by NestJS:

- `POST /api/v2/attendance/scan/preview` returns `200` with the computed student,
  session, direction, and eligibility data.
- `POST /api/v2/attendance/scan/confirm` returns `201` with the created attendance
  record.

Attendance confirmation accepts the standard `Idempotency-Key` request header.
During migration the header is optional, so existing clients continue working.
New web and mobile clients should generate one unique key per confirmation and
reuse that same key only when retrying the identical request.

- Keys use 1–128 characters from letters, numbers, `.`, `_`, `:`, and `-`.
- The key is scoped to the authenticated staff account.
- The same key and payload replay the original `201` response without a second
  attendance mutation.
- Reusing the key with a different payload returns `409` with
  `IDEMPOTENCY_CONFLICT`.
- Confirmation results are retained for 30 days; clients must not intentionally
  recycle keys.

Both routes require a moderator or superadmin JWT, apply the scan-specific rate
limit, and use the standard v2 success and error envelopes. The legacy
`/moderator/scan/*` routes remain available during consumer migration.

### Event administration

The additive NestJS event-management slice exposes:

- `GET /api/v2/admin/events`
- `GET /api/v2/admin/events/:id`
- `POST /api/v2/admin/events`
- `PUT /api/v2/admin/events/:id`

These routes require a superadmin JWT and use the standard v2 envelopes. Create
and update accept only core event fields: `name`, `event_start_date`,
`event_end_date`, `academic_term_id`, and `is_active`. Unknown fields are
rejected. Event writes and their append-only audit records commit in the same
PostgreSQL transaction.

Session windows, audience/roster rules, QR tokens, fines, announcements,
closure, and deletion remain on the legacy admin routes during the compatibility
window. Clients must not send those nested operations to the core v2 endpoint.

### Operational metrics

`GET /api/v2/metrics` returns the standard success envelope containing bounded
HTTP request/error/latency counters and PostgreSQL pool saturation metrics. It
is restricted to superadmins and must not be exposed as a public monitoring
endpoint by the reverse proxy.

Rollback is application-only: run `bun run start:legacy`. The additive
idempotency ledger can remain in PostgreSQL during rollback; legacy routes do
not read or write it.
