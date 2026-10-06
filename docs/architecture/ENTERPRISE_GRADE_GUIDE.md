# Enterprise-grade engineering guide

## Purpose

This document defines the engineering standards for the SSC QR Attendance
platform. It is the default reference for new backend modules, API contracts,
database changes, tests, deployment, and operational readiness.

The architecture choices, alternatives, tradeoffs, and long-term adoption
stages are documented in
[`LONG_TERM_ARCHITECTURE.md`](LONG_TERM_ARCHITECTURE.md).

Detailed resilience decisions—including when, where, and why to use pooling,
timeouts, idempotency, retries, circuit breakers, caching, queues, and
multi-instance controls—are defined in
[`RESILIENCE_AND_PRODUCTION_READINESS.md`](RESILIENCE_AND_PRODUCTION_READINESS.md).

The target architecture is a **feature-based modular monolith**. NestJS provides
the application framework, dependency injection, controllers, guards, and
module boundaries. Bun remains the JavaScript runtime and package manager.
PostgreSQL remains the authoritative data store.

Do not introduce microservices merely to appear enterprise-grade. Extract a
service only when independent scaling, deployment, ownership, or failure
isolation provides measurable value.

## Core architecture decisions

| Area | Standard |
|---|---|
| Runtime | Bun |
| Backend framework | NestJS |
| Architecture | Feature-based modular monolith |
| Database | PostgreSQL |
| API style | Versioned REST with OpenAPI |
| New response contract | `/api/v2` `{ data, meta }` and structured errors |
| Authentication | Signed JWT with role-based authorization |
| Real-time communication | Existing Socket.IO and WebSocket protocols |
| Web client | React |
| Mobile client | Flutter |
| Deployment | Bun bound to localhost behind IIS |

## Repository boundaries

```text
apps/
├── api/       # NestJS host, transitional Express compatibility, PostgreSQL
├── web/       # React administration and moderator application
└── mobile/    # Flutter applications

packages/      # Generated contracts and genuinely shared tooling
docs/          # Architecture, operations, and plans
infrastructure/# Database and deployment artifacts
tooling/       # Repository-wide development automation
```

Applications must not import source code directly from another application.
Cross-application contracts should be generated from OpenAPI or placed in a
package with multiple proven consumers.

## Backend module structure

Use business capabilities rather than technical folders as the primary
boundary:

```text
apps/api/src/nest/modules/
├── auth/
├── attendance/
├── events/
├── students/
├── moderators/
├── fines/
└── reporting/
```

A substantial feature may use four internal layers:

```text
attendance/
├── api/
│   ├── dto/
│   ├── attendance.controller.ts
│   └── attendance.presenter.ts
├── application/
│   ├── commands/
│   ├── queries/
│   └── attendance.service.ts
├── domain/
│   ├── attendance-session.ts
│   ├── attendance-policy.ts
│   ├── attendance.errors.ts
│   └── attendance.repository.ts
├── infrastructure/
│   ├── postgres-attendance.repository.ts
│   └── attendance.mapper.ts
└── attendance.module.ts
```

Small features should remain shallow. Do not add empty layers or one-line files
solely to match this template.

### Dependency direction

```text
API → Application → Domain
          ↓
    Repository contract
          ↑
    Infrastructure adapter
```

The domain layer must not import NestJS, Express, PostgreSQL, HTTP DTOs, or
framework decorators.

## Object and class modeling

Do not create a class for every table. Use selective domain modeling.

Use classes when:

- NestJS must construct or inject the component;
- runtime validation or OpenAPI decorators require a DTO class;
- an object controls a state transition;
- an object enforces business invariants;
- identity and lifecycle are meaningful.

Use plain TypeScript types when:

- representing database rows;
- returning query projections or reports;
- describing serialized API responses;
- carrying events or messages without behavior;
- transporting data between pure functions.

Recommended modeling depth:

| Feature | Recommended modeling |
|---|---|
| Auth | Application service and repository; minimal domain objects |
| Students | DTOs, projections, repository, selected value objects |
| Attendance | Rich policies and state transitions |
| Events | Lifecycle model and explicit transition rules |
| Session windows | Validated value objects and policies |
| Fines | Calculation policies and immutable money values |
| Reporting | Optimized read models; no aggregate hydration |
| Health | Controller only |

Useful value objects include `StudentCode`, `SessionWindow`, `Money`,
`AcademicTerm`, and `QrCredential`. Do not wrap ordinary strings and numbers
unless the wrapper enforces a real rule.

## Commands, queries, and repositories

Use a lightweight command/query split:

- **Queries** return purpose-built read models and may use optimized SQL
  projections directly.
- **Commands** pass through application and domain rules, execute in a defined
  transaction, and return an explicit result.

Avoid generic repositories such as `Repository<T>.findAll()`. Repository
contracts should express the needs of their feature:

```ts
export abstract class AttendanceRepository {
  abstract findSessionForUpdate(id: number): Promise<AttendanceSession | null>;
  abstract hasConfirmedCheckIn(sessionId: number, studentId: number): Promise<boolean>;
  abstract saveDecision(decision: AttendanceDecision): Promise<void>;
}
```

Infrastructure implements these contracts using PostgreSQL. Database row types
must not leak into the domain layer.

## API standards

All new endpoints belong under `/api/v2`. Follow
[`API_RESPONSE_FORMAT.md`](API_RESPONSE_FORMAT.md).

Required practices:

- Use nouns and stable resource identifiers in URLs.
- Use the HTTP status code as the authoritative status.
- Return successful data as `{ "data": ..., "meta": ... }`.
- Return errors with a stable `error.code` and human-readable `error.message`.
- Include `X-Request-Id` and `meta.requestId`.
- Put pagination in `meta.pagination`; never return `data.data`.
- Validate path, query, header, and body input at the API boundary.
- Document public endpoints and schemas in OpenAPI.
- Never expose stack traces, SQL, secrets, or database identifiers.

Do not envelope `204` responses, downloads, redirects, SSE streams, or
WebSocket messages.

Existing API aliases remain compatible until their React and Flutter consumers
have migrated. Removing them is a separate, explicitly approved contraction.

## Validation and error handling

- Use DTO classes for runtime request validation.
- Normalize validation failures through the global exception filter.
- Give business failures stable codes such as `SESSION_CLOSED` or
  `STUDENT_NOT_REGISTERED`.
- Keep error messages safe for end users; log internal diagnostics separately.
- Treat unexpected errors as `INTERNAL_ERROR` with a request ID.
- Do not make clients inspect message text to determine behavior.

## Database and transaction rules

PostgreSQL is the final authority for data integrity.

- Use foreign keys, unique constraints, check constraints, and appropriate
  indexes.
- Application validation does not replace database constraints.
- Keep transactions short and place their boundary in the application layer.
- Use row locks or advisory locks for concurrent attendance decisions.
- Make externally retried commands idempotent using a client request ID or
  unique idempotency key.
- Use parameterized SQL only.
- Select only the fields required by read endpoints.
- Avoid unbounded list queries; require pagination or a strict limit.
- Review query plans before adding caching to hide a slow query.

Schema migrations must follow expand, migrate, verify, and contract:

1. Add backward-compatible schema.
2. Deploy code capable of reading old and new shapes.
3. Backfill safely and idempotently.
4. Verify data and consumer migration.
5. Remove old fields only in a separately approved release.

Every migration requires a rollback path and preservation proof.

## Authentication and security

- Keep JWT secrets outside source control and rotate them operationally.
- Verify issuer, algorithm, expiry, and allowed role for every protected route.
- Prefer short-lived access tokens; introduce refresh-token rotation if longer
  sessions become a product requirement.
- Hash passwords with a deliberately slow password algorithm and upgrade hashes
  opportunistically when parameters change.
- Rate-limit authentication and high-volume write endpoints.
- Apply least-privilege database and deployment accounts.
- Validate uploaded file type, size, and content before processing.
- Restrict CORS in production to approved origins when deployment topology is
  finalized.
- Never log passwords, tokens, QR secrets, or sensitive student data.
- Record security-relevant administrative actions in an append-only audit log.

Use automated dependency and static security scanning in CI before production
deployment.

## Concurrency, queues, and caching

The current in-process cache, batching, and queues are acceptable while the API
runs as one process.

Before running multiple API instances:

- move cross-instance rate limiting to a shared store;
- replace process-local coordination with database or distributed locking;
- use a durable queue for work that must survive process termination;
- define cache invalidation and maximum staleness explicitly;
- make job handlers idempotent;
- add dead-letter handling and observable retry counts.

Do not add Redis or a message broker until multi-instance or durability
requirements justify the operational cost.

## Observability

Production services require:

- structured logs rather than free-form console output;
- request IDs propagated through HTTP and background work;
- request duration, status, route, and dependency timing;
- health, readiness, and dependency checks;
- metrics for request rate, error rate, latency, database pool saturation,
  queue depth, and rate-limit rejections;
- alerts tied to user-visible service objectives;
- redaction of tokens and personal data.

Recommended starting objectives:

- availability target defined for the deployed environment;
- p95 latency measured separately for reads and attendance writes;
- zero silent loss of confirmed attendance commands;
- database backup restoration tested on a schedule.

## Testing strategy

Each feature should contain the lowest-cost proof appropriate to its risk:

1. **Unit tests** for policies, value objects, mappers, and calculations.
2. **Application tests** for use cases with repository test doubles.
3. **Repository integration tests** against a real PostgreSQL schema.
4. **HTTP contract tests** for status codes, envelopes, aliases, and errors.
5. **End-to-end smoke tests** for authentication and the critical attendance
   workflow.

Required regression coverage includes:

- role authorization;
- duplicate and concurrent scans;
- transaction rollback;
- invalid and expired tokens;
- pagination boundaries;
- malformed JSON and validation errors;
- compatibility between legacy and `/api/v2` contracts.

Tests that require PostgreSQL must use a reproducible schema in CI. A silently
skipped database suite is not a production release gate.

## CI/CD and release controls

Every change should pass:

- formatting and linting;
- TypeScript compilation;
- unit and contract tests;
- PostgreSQL integration tests;
- dependency and security scanning;
- production build verification.

Production releases should include:

- immutable build artifacts;
- environment-specific configuration outside the artifact;
- an automated schema migration step;
- health verification after deployment;
- a documented application rollback command;
- database backup and restoration procedures;
- release notes for API or schema compatibility changes.

The current application rollback is `bun run start:legacy`. Database rollback
must never destroy production data merely to match an older binary.

## Performance and scaling order

Scale by evidence in this order:

1. Measure endpoint and query latency.
2. Add or correct indexes and query projections.
3. Remove N+1 queries and batch safe reads.
4. Apply bounded caching with explicit invalidation.
5. Move durable work to background jobs.
6. Run multiple stateless API instances.
7. Extract an independent service only for a proven boundary.

Load-test the attendance write path, login, event rosters, and report exports
using realistic concurrency before major events.

## Prohibited patterns

- A class for every database table with only getters and setters.
- Generic repositories that hide business queries.
- Controllers containing SQL or business rules.
- Domain code importing NestJS, Express, or PostgreSQL.
- Returning database rows directly from new API endpoints.
- Breaking existing clients by globally changing legacy responses.
- Unbounded queries or exports performed synchronously in request memory.
- Process-local locks assumed to work across multiple instances.
- Logging secrets or returning internal exception details.
- Microservices without a measurable ownership or scaling requirement.

## Definition of done

A backend feature is complete when:

- ownership and module boundaries are clear;
- inputs are validated;
- authorization is explicit;
- business rules live outside the controller;
- transactions and concurrency behavior are defined;
- API v2 success and error contracts are documented;
- relevant unit, integration, and contract tests pass;
- logs and metrics can identify failures by request ID;
- schema and API changes have compatibility and rollback plans;
- operational documentation is updated.

## Recommended implementation sequence

1. Finish the NestJS auth and response-contract foundation.
2. Migrate student read endpoints using query projections and pagination.
3. Migrate attendance commands with explicit transactions and locking tests.
4. Migrate events and session lifecycle rules.
5. Migrate fines and reporting.
6. Move React and Flutter consumers to `/api/v2` incrementally.
7. Verify no legacy readers remain.
8. Remove Express compatibility only as a separately approved final stage.

