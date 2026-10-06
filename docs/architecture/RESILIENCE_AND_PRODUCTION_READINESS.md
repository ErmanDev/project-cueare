# Resilience and production-readiness guide

## Purpose

This document defines which resilience and operational patterns the SSC QR
Attendance system should use, where they belong, why they are needed, and when
they should be introduced.

The system should not adopt infrastructure merely because it is commonly called
enterprise-grade. Every mechanism must address a concrete failure mode,
scaling limit, compliance requirement, or service objective.

## Current implementation baseline

The API currently provides the first database-resilience slice:

- A bounded PostgreSQL pool configured through `PG_POOL_MAX` (with the older
  `PG_MAX_POOL` retained as a rollout alias).
- Connection-acquisition, idle, statement, lock, and idle-transaction timeouts.
- In-process pool saturation and acquisition metrics, ready for a metrics
  exporter to consume later.
- Process-only liveness at `/api/v2/health` and database-backed readiness at
  `/api/v2/readiness`.
- Idempotent pool shutdown after the HTTP listener stops accepting requests.
- PostgreSQL-backed idempotency for v2 attendance confirmation, including
  actor-scoped keys, request-hash conflict detection, concurrent replay, and a
  30-day retention boundary.
- Bounded scheduled deletion of expired idempotency records using
  `FOR UPDATE SKIP LOCKED`, safe when several API instances run cleanup.
- Shared structured JSON request logs for Nest and legacy routes, plus bounded
  HTTP latency/error histograms and superadmin diagnostics at `/api/v2/metrics`.
- A transactionally written, database-enforced append-only `AuditEvents` ledger.
  Attendance confirmation currently records actor, request ID, action, target,
  safe context, and before/after state without duplicating idempotent replays.
- A pinned Bun 1.4.2 runtime and production startup validation for secrets,
  least-privilege database credentials, explicit proxy hops, CORS origins,
  request-size ceilings, and PostgreSQL TLS mode.
- Shared Helmet headers and CORS policy across Nest, legacy Express, and
  Socket.IO. CSP remains deployment-specific until the bundled web and Swagger
  inline assets are converted to nonce/hash-based loading.
- Ordered, checksummed database migrations with advisory-lock serialization,
  transactional application, drift detection, and production startup
  verification. Automatic application remains a development-only compatibility
  mode.

These defaults are deliberately conservative for compatibility. Tighten them
from observed p95/p99 latency and load tests rather than guessing per endpoint.

## Decision summary

| Capability | Use when | Where | Why |
|---|---|---|---|
| PostgreSQL connection pool | Always | API and database workers | Bound database concurrency and reuse connections |
| Query and lock timeouts | Always | PostgreSQL session/transaction boundary | Prevent requests from waiting indefinitely |
| Request timeout | Always | HTTP boundary | Bound request lifetime and resource consumption |
| Idempotency key | Retried command can create a duplicate effect | Attendance, payments, corrections, imports | Make network retries safe |
| Row or advisory lock | Concurrent commands can violate an invariant | PostgreSQL transaction | Serialize the smallest consistency boundary |
| Optimistic concurrency | Users may edit stale administrative data | Update commands | Detect conflicting edits without long locks |
| Retry | Failure is transient and operation is safe to repeat | Dependency adapter or whole transaction | Recover from temporary failures |
| Circuit breaker | A remote dependency repeatedly fails or times out | External HTTP/provider adapter | Stop wasting resources and allow recovery |
| Bulkhead | One workload can exhaust shared resources | Pools, queues, concurrency controls | Contain overload |
| Cache | Measurements prove repeated expensive reads | Read adapter | Reduce latency/load when staleness is acceptable |
| Distributed rate limit | More than one API instance serves traffic | Shared Redis/atomic store | Enforce one limit across instances |
| Transactional outbox | An event must survive process failure | Same PostgreSQL transaction as business write | Prevent lost events |
| Durable queue | Work must survive restart or run outside a request | Background worker | Provide retries and workload isolation |
| Read replica | Measured reads overload the primary | Query/reporting adapter | Scale reads without weakening write authority |
| Microservice | Independent scale, ownership, deployment, or isolation is proven | Extracted business boundary | Gain operational independence |

## Adoption levels

### Required for a production single instance

- Bounded PostgreSQL pool and database timeouts.
- HTTP request limits and payload limits.
- Idempotency for critical retried writes.
- Transaction and concurrency rules.
- Structured logs and request correlation.
- Liveness, readiness, and graceful shutdown.
- Metrics, service objectives, and alerts.
- Security hardening and append-only audit history.
- Backward-compatible migrations and tested restoration.
- Unit, integration, contract, concurrency, and load tests.

### Required before multiple API instances

- Stateless request handling.
- Shared rate limiting.
- Database or distributed coordination instead of process-local locks.
- Durable processing for work that must survive termination.
- Cross-instance WebSocket coordination where required.
- Pool capacity calculated across every instance and worker.
- Multi-instance concurrency and deployment tests.

### Introduce only after evidence

- Redis caching.
- External message broker.
- Read replicas.
- Table partitioning.
- Dedicated reporting database.
- Microservices.
- Multi-region active/active deployment.

## 1. PostgreSQL connection pooling

### When

Always use a bounded connection pool in API and worker processes.

### Where

The pool belongs in the PostgreSQL infrastructure adapter. Application and
domain code must not manage database connections.

### Why

Opening one connection per request is expensive and unbounded connections can
exhaust PostgreSQL. A pool also provides a measurable point for backpressure.

### Rules

- Calculate capacity across every API instance, worker, migration job, and
  administrative connection.
- Keep a safety reserve for migrations and incident response.
- Configure connection acquisition and idle timeouts.
- Expose active, idle, waiting, and acquisition-duration metrics.
- Close the pool during graceful shutdown.
- Do not configure each instance independently without checking the database
  `max_connections` total.

Capacity must satisfy:

```text
(API instances × API pool max)
+ (workers × worker pool max)
+ administration/migration reserve
< PostgreSQL max connections
```

## 2. Database and request timeouts

### When

Always. No request, query, lock wait, or remote call may wait indefinitely.

### Where

- HTTP timeout at the inbound adapter.
- Statement and lock timeouts at the PostgreSQL transaction boundary.
- Remote connection/response timeout in each external adapter.
- Job timeout in each worker handler.

### Why

Timeouts release scarce resources and turn an indefinite hang into an
observable failure.

### Starting values

| Operation | Initial limit |
|---|---:|
| Normal API request | 15–30 seconds |
| Normal database statement | 5–10 seconds |
| Attendance command | 3–5 seconds |
| Database lock wait | 1–3 seconds |
| External provider request | 3–10 seconds |

Tune these from production measurements. Large exports and imports should be
background jobs rather than long HTTP requests.

## 3. Idempotency

### When

Use an idempotency key when a command can be retried by a mobile client,
reverse proxy, worker, webhook sender, or user double-click and a duplicate
would produce a second business effect.

### Where

At the application-command boundary, backed by a PostgreSQL unique constraint.

### Why

Network failure can occur after a server commits but before the client receives
the response. The client must be able to repeat the request safely.

### Required commands

- Attendance confirmation and student self-scan.
- Manual attendance correction.
- Fine payment, void, or waiver.
- Event publication and closure.
- Bulk import submission.
- Externally received webhooks.

### Rules

- The key is scoped to actor, operation, and appropriate tenant/context.
- Store a request hash and the original result/reference.
- Same key and same request returns the original result.
- Same key with a different request returns `409 IDEMPOTENCY_CONFLICT`.
- Enforce uniqueness in PostgreSQL, not only in memory or Redis.
- Define expiration and cleanup without deleting records still needed for
  reconciliation.

## 4. Concurrency control

### When

Use concurrency control whenever simultaneous commands could violate a business
invariant.

### Where

At the smallest PostgreSQL transaction boundary that owns the invariant.

### Why

Application checks performed outside the write transaction are vulnerable to
race conditions.

### Pattern selection

| Pattern | Use when |
|---|---|
| Unique constraint | Duplicate state can be rejected declaratively |
| Row lock | An existing row represents the consistency boundary |
| Advisory lock | No suitable row exists before the first write |
| Optimistic row version | Administrative edits are infrequent and long locks are undesirable |
| Serializable transaction | A multi-row invariant cannot be protected more narrowly |

Attendance confirmation should retain the student/session lock, transaction,
and `FOR UPDATE` history read. Never rely on the process-local write queue for
correctness across multiple instances.

## 5. Retries

### When

Retry only a transient failure and only when the complete operation is safe to
repeat.

### Where

- External dependency retries in the outbound adapter.
- Serialization/deadlock retries around the complete database transaction.
- Queue retries around the idempotent job handler.

### Why

Small transient failures are normal, but indiscriminate retries amplify
outages and create duplicate effects.

### Retryable examples

- Temporary network reset.
- Explicit `429` with a permitted retry delay.
- Selected `502`, `503`, and `504` responses.
- PostgreSQL serialization failure or deadlock when the full command is
  idempotent.

### Do not retry

- Validation, authentication, authorization, or ordinary not-found errors.
- Business conflicts such as duplicate attendance.
- Non-idempotent writes without an idempotency key.
- Permanent provider rejection.

Use exponential backoff with jitter, a small attempt limit, and a total
deadline. Record retry count and final outcome.

## 6. Circuit breakers

### When

Use a circuit breaker when a remote dependency can repeatedly time out or fail
and continued calls would consume resources without a reasonable chance of
success.

### Where

In outbound adapters for:

- Email, SMS, and push providers.
- Object storage.
- Payment providers.
- Remote identity providers.
- Webhook destinations.
- Independently deployed remote services.

### Why

A breaker fails quickly during a dependency outage, protects the application
from cascading resource exhaustion, and allows controlled recovery probes.

### Do not use it

- Around pure functions or in-process module calls.
- As a replacement for validation.
- Around every normal PostgreSQL query. Database resilience should start with
  pooling, deadlines, readiness, transactions, and controlled retries.
- To hide a persistent programming or configuration error.

### Required breaker behavior

```text
Closed    calls flow normally
Open      calls fail immediately
Half-open a small number of probe calls test recovery
```

Each breaker needs a failure threshold, observation window, open duration,
half-open probe count, timeout, metrics, and explicit fallback.

## 7. Bulkheads and backpressure

### When

Use bulkheads when one workload could consume all threads, event-loop capacity,
database connections, memory, or provider quotas.

### Where

Use separate bounded concurrency for:

- Attendance writes.
- File imports.
- Report generation.
- Notifications.
- External provider calls.
- WebSocket broadcasts.

### Why

An overloaded report or provider must not make attendance confirmation
unavailable.

Queues and semaphores must be bounded. When capacity is exhausted, reject with
clear backpressure or enqueue durably; never allow unlimited memory growth.

## 8. Caching

### When

Add caching only after metrics show repeated expensive reads and the business
can define acceptable staleness.

### Where

In query/read adapters, never inside domain entities or as the final authority
for a write decision.

### Why

Caching may reduce latency and database load, but introduces stale data and
invalidation risk.

### Suitable data

- Stable reference data.
- Published event metadata.
- Permission/configuration reads with explicit invalidation.
- Expensive non-critical projections.

### Unsuitable data

- Current attendance direction during confirmation.
- Payment balance during mutation.
- Authorization state when stale access would be unsafe.
- Any invariant that PostgreSQL must enforce.

For every cache document its key, owner, TTL, invalidation event, maximum size,
failure behavior, and permitted staleness.

## 9. Rate limiting

### When

Always protect authentication and high-volume write endpoints. Use a shared
limiter before running multiple API instances.

### Where

- Single instance: bounded in-process limiter is acceptable.
- Multiple instances: Redis or another shared atomic store.
- Internet edge: optionally add reverse-proxy/WAF limits as an additional
  layer, not the only application rule.

### Why

Rate limiting protects credentials, database capacity, and expensive business
operations from abuse or accidental request storms.

Use both user and IP dimensions where appropriate. Return `429`, `Retry-After`,
and a stable `RATE_LIMITED` error code.

## 10. Transactional outbox

### When

Use an outbox when a business event must be delivered after a database change
and losing it on process failure is unacceptable.

### Where

Write the business record and outbox message in the same PostgreSQL transaction.
A separate worker publishes pending records.

### Why

Directly committing the database and then publishing creates a failure gap in
which state changes but the event is lost.

Potential events include `StudentCheckedIn`, `StudentCheckedOut`,
`AttendanceCorrected`, `EventClosed`, `FineIssued`, and `PaymentConfirmed`.

Each message should include an event ID, type, aggregate ID, schema version,
occurrence time, request/correlation ID, payload, attempt count, and publication
time. Consumers must be idempotent.

## 11. Durable background queues

### When

Use a durable queue when work must survive restart, exceed an HTTP deadline, be
retried independently, or use separate concurrency.

### Where

Background worker processes for notifications, reports, imports, exports,
scheduled event closure, archival, and file processing.

### Why

In-memory tasks disappear when a process stops and compete with interactive
requests.

Every handler requires an idempotency strategy, timeout, concurrency limit,
retry policy, dead-letter destination, observable queue depth/age, and manual
replay procedure.

## 12. Health, readiness, and shutdown

### When

Always in production.

### Where

- Liveness checks process responsiveness.
- Readiness checks whether traffic can be handled safely.
- Startup checks initialization and required schema readiness.
- Shutdown handling belongs in the application host.

### Why

Orchestrators must distinguish a dead process from one temporarily unable to
serve traffic.

Readiness should verify PostgreSQL connectivity and required schema/config.
Do not make liveness depend on every optional external provider.

Graceful shutdown order:

1. Mark the instance unready.
2. Stop accepting new requests and jobs.
3. Finish active work within a deadline.
4. Close WebSocket connections.
5. Close queues and the PostgreSQL pool.
6. Exit.

## 13. Observability

### When

Always before production. Add distributed tracing before or alongside remote
services and durable queues.

### Where

At inbound adapters, application commands, database/external adapters, and
background handlers.

### Why

Operators must determine which user operation failed, where time was spent,
and whether the failure is isolated or systemic.

Required telemetry:

- Structured JSON logs with request ID, actor, route, status, duration, and
  safe domain identifiers.
- HTTP rate, error, and latency metrics.
- Pool active/idle/waiting and query duration metrics.
- Attendance successes and rejection reasons.
- Queue depth, oldest-job age, retry, and dead-letter metrics.
- Trace/correlation propagation through jobs and remote calls.

Never log passwords, JWTs, QR secrets, database credentials, or unnecessary
personal data. Apply automatic redaction.

The current HTTP logger records only correlation ID, method, normalized route,
status, duration, response size, and authenticated actor identity/role. It does
not record request bodies, authorization headers, query values, QR payloads, or
user-agent strings. `/api/v2/metrics` exposes bounded HTTP and PostgreSQL pool
snapshots to superadmins; production monitoring should scrape this through a
protected management network or replace it with the selected metrics exporter.

## 14. Security and audit

### When

Always. Stronger controls apply to administrative and financial operations.

### Where

- Authentication and authorization at inbound adapters.
- Business authorization inside the relevant command where context matters.
- Secrets in a production secret manager.
- Append-only audit records in durable storage.

### Why

Route-level roles alone cannot prove who changed sensitive state or why.

Audit manual attendance changes, event lifecycle changes, fine/payment actions,
role changes, configuration changes, and data exports. Record actor, action,
target, before/after values, reason, timestamp, request ID, and source IP.

### Audit implementation rules

- Write the audit event in the same transaction as the business mutation. An
  audit failure must roll back the command rather than silently lose evidence.
- Store durable actor identifiers without a foreign key that could rewrite or
  remove history when an account is deleted.
- PostgreSQL rejects `UPDATE` and `DELETE` against `AuditEvents`; corrections
  are represented by a new compensating audit event.
- Store only identifiers and fields needed for investigation. Never store
  passwords, JWTs, raw QR values, secrets, or unrestricted request bodies.
- Idempotent replays return the original result and do not append a second event.
- Index request ID, actor/time, and target/time for incident investigation.

Current application coverage is attendance confirmation. Event lifecycle,
manual corrections, role changes, fine/payment actions, exports, and a
superadmin audit-query endpoint remain separate incremental slices.

Production must also define CORS allowlists, security headers, request/file
limits, least-privilege accounts, dependency scanning, secret rotation, and
personal-data retention.

## 15. Backups and disaster recovery

### When

Before production data becomes authoritative.

### Where

PostgreSQL backups, encrypted off-machine storage, operational runbooks, and
scheduled restoration environments.

### Why

A backup is not proven until restoration succeeds.

Define recovery point objective (RPO), recovery time objective (RTO), retention,
point-in-time recovery requirements, ownership, and a restoration drill
schedule.

## 16. API contracts

### When

For every public `/api/v2` endpoint before clients depend on it.

### Where

OpenAPI, contract tests, generated clients, and the stable error-code catalog.

### Why

Web and mobile clients deploy independently and require predictable evolution.

Document authentication, inputs, outputs, status codes, error codes,
idempotency, pagination, limits, and deprecation. Do not remove a legacy route
until telemetry proves no supported client uses it.

## 17. Scaling mechanisms

### Read replicas

Use when measured read load or reporting harms the transactional primary. Route
only staleness-tolerant queries to replicas. Never make an immediate write
decision from a lagging replica.

### Partitioning

Use when table size, maintenance, retention, or query plans demonstrate a need.
Partitioning is not an initial substitute for indexes and bounded queries.

### Microservices

Extract only for proven independent scaling, ownership, deployment, security,
or failure isolation. A modular monolith with ports and events is the default.

## 18. Testing rules

### Required continuously

- Domain unit tests.
- Application use-case tests.
- PostgreSQL integration tests.
- HTTP contract and authorization tests.
- Concurrency and idempotency tests.
- Migration compatibility tests.

### Required before scale or major events

- Realistic load and soak tests.
- Multi-instance concurrency tests.
- Dependency timeout/circuit-breaker tests.
- Queue retry and dead-letter tests.
- Database failover and restoration drills.

Measure p50, p95, and p99 latency, throughput, errors, pool saturation, lock
waits, event-loop delay, CPU, memory, and queue depth.

## Implementation order

### Phase 1: production-safe single instance

1. Configure database statement, lock, and acquisition timeouts.
2. Calculate pool capacity and expose pool metrics.
3. Add attendance command idempotency.
4. Add structured logging and sensitive-data redaction.
5. Add readiness, liveness, and graceful shutdown.
6. Add service objectives, metrics, dashboards, and alerts.
7. Add append-only audit history.
8. Complete OpenAPI and the stable error catalog.
9. Run attendance load/concurrency tests.
10. Perform a backup restoration drill.

### Phase 2: multi-instance readiness

1. Move rate limits to a shared atomic store.
2. Remove correctness dependencies on process-local state.
3. Add durable jobs and transactional outbox where delivery matters.
4. Validate pool capacity across the target instance count.
5. Test rolling deployment, shutdown, and cross-instance concurrency.

### Phase 3: external integrations

For each provider add a timeout, retry classification, circuit breaker,
bulkhead, truthful fallback, metrics, and operational runbook.

### Phase 4: measured optimization

Add caches, replicas, partitioning, specialized workers, or service extraction
only after metrics identify the bottleneck and acceptance criteria define the
expected improvement.

## Prohibited patterns

- Unlimited database pools, queues, retries, or in-memory caches.
- Retrying every error or retrying unsafe writes without idempotency.
- A circuit breaker around every method or ordinary local database query.
- Redis used as the final authority for attendance or payment correctness.
- In-memory jobs for work that must survive restart.
- Cache-based authorization without a safe staleness policy.
- Reporting queries allowed to exhaust the transactional pool.
- Pretending a write succeeded when PostgreSQL did not commit.
- Adding microservices or brokers without a measurable requirement.

## Final release checklist

- [ ] Pool capacity is calculated across all instances and workers.
- [ ] Database queries, locks, requests, jobs, and remote calls have deadlines.
- [ ] Critical commands use durable idempotency keys.
- [ ] Concurrency and duplicate-command tests pass.
- [ ] Structured logs contain request IDs and redact sensitive data.
- [ ] Pool, HTTP, attendance, and job metrics are available.
- [ ] Service objectives and actionable alerts are defined.
- [ ] Liveness, readiness, and graceful shutdown are verified.
- [ ] Authentication, authorization, CORS, secrets, and audit are production-safe.
- [ ] OpenAPI and stable error codes are complete.
- [ ] Migrations remain backward compatible through rolling deployment.
- [ ] Backup restoration meets defined RPO and RTO.
- [ ] Load tests meet the release objectives.
- [ ] CI/CD blocks unverified builds and supports application rollback.
- [ ] Multi-instance state is shared or database-coordinated before scaling out.
- [ ] Durable jobs have idempotency, retries, timeouts, and dead-letter handling.
- [ ] Each required external dependency has an explicit breaker/fallback policy.
- [ ] Operational runbooks identify owners and recovery procedures.

Related standards:

- [`LONG_TERM_ARCHITECTURE.md`](LONG_TERM_ARCHITECTURE.md)
- [`ENTERPRISE_GRADE_GUIDE.md`](ENTERPRISE_GRADE_GUIDE.md)
- [`API_RESPONSE_FORMAT.md`](API_RESPONSE_FORMAT.md)
- [`../operations/POSTGRES_BACKUP_GUIDE.md`](../operations/POSTGRES_BACKUP_GUIDE.md)
