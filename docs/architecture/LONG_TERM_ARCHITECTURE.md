# Long-term architecture recommendation

## Purpose

This document explains the architecture selected for the long-lived SSC QR
Attendance system, the alternatives considered, their tradeoffs, and when each
pattern should be introduced.

The target is not the maximum possible number of layers or services. The target
is a system that can evolve safely for years, remain understandable to new
teams, and scale without an unnecessary distributed-systems burden.

## Decision summary

Use the following combination:

| Concern | Decision |
|---|---|
| Repository | Feature-based monorepo |
| Backend deployment | Modular monolith |
| Backend framework and runtime | NestJS on Bun |
| Complex backend modules | Hexagonal Architecture with selective DDD |
| Simple backend modules | Lightweight layered architecture |
| Read/write separation | Lightweight CQRS in the same PostgreSQL database |
| Module side effects | Domain/application events; transactional outbox when durability is required |
| Web client | React with feature-based, MVVM-like hooks |
| Mobile client | Flutter with feature-based MVVM/Clean Architecture |
| Data store | PostgreSQL with explicit module ownership |
| Future distribution | Extract services only for measured scaling, ownership, security, or reliability needs |

Bun and NestJS are not alternatives. Bun is the runtime, package manager, and
test runner; NestJS is the backend application framework.

## How the pieces fit together

```text
Monorepo
├── apps/api       NestJS modular monolith running on Bun
│   ├── simple feature   API → application service → repository
│   └── core feature     adapters → application → domain ← infrastructure
├── apps/web       React feature modules with hook-based view models
├── apps/mobile    Flutter feature modules with view models/notifiers
├── packages       generated contracts and proven shared tooling
├── infrastructure deployment, database, and monitoring resources
└── docs           standards, runbooks, plans, and ADRs
```

Architecture has several independent dimensions. A monorepo answers where code
is stored. A modular monolith answers how the backend is deployed. Hexagonal
Architecture answers how dependencies flow inside a module. MVVM answers how a
client separates presentation and behavior. These choices complement rather
than replace one another.

## 1. Feature-based monorepo

Keep API, web, mobile, shared contracts, infrastructure, and documentation in
one repository, organized first by deployable application and then by business
feature.

### Advantages

- Coordinated API, web, and mobile changes can be delivered atomically.
- Engineering standards and CI controls remain consistent.
- Generated contracts and tooling can be reused safely.
- Onboarding and cross-application discovery are easier.

### Disadvantages

- CI can become slow without affected-project builds and caching.
- Shared packages can become an unowned dumping ground.
- Poor dependency rules can couple otherwise independent applications.
- Repository access is broader than in separate repositories.

### When to use it

Use it while the applications share ownership, release coordination, and
business language. Split repositories only when ownership, access control, or
release independence creates a concrete need.

### How to apply it

- Applications never import another application's source files.
- `packages` contains generated contracts or code with multiple proven users.
- Features use the same business vocabulary across API, web, and mobile.
- CI runs only relevant application pipelines while retaining full release
  gates for production.

## 2. Modular monolith

Deploy the backend as one process while separating it into explicit business
modules such as `auth`, `students`, `events`, `attendance`, `fines`, and
`reporting`.

### Advantages

- Local transactions and consistency remain straightforward.
- Debugging, testing, and deployment are simpler than with microservices.
- Operational cost remains appropriate for the current team.
- Well-defined modules can be extracted later if evidence justifies it.

### Disadvantages

- Weak boundaries can turn the application into a tightly coupled monolith.
- Modules normally deploy together.
- A process-level failure can affect every module.
- Direct cross-module table access is tempting and must be controlled.

### When to use it

Use it as the default until a module has a proven need for independent scaling,
deployment, ownership, security isolation, or failure isolation.

### How to apply it

- Every module owns its API, behavior, persistence contracts, and tables.
- A module calls another module through its published application interface.
- A module must not import another module's repository or modify its tables.
- Cross-module side effects use events where synchronous coupling is not
  required.

## 3. Lightweight layered architecture

Use a short request path for features with little business complexity:

```text
Controller → application service → repository → PostgreSQL
```

### Advantages

- Low ceremony and fast implementation.
- Easy for new developers to follow.
- Appropriate for simple CRUD and read-only projections.

### Disadvantages

- Large services can accumulate unrelated rules.
- Framework and persistence concerns can leak inward.
- Complex transitions become difficult to test and reason about.

### When to use it

Use it for health checks, reference data, basic administration, student profile
reads, and straightforward reporting queries.

### How to apply it

Keep controllers transport-only, use bounded and parameterized repository
queries, and introduce deeper domain layers only when real invariants appear.
Do not create empty folders merely to match a template.

## 4. Hexagonal Architecture

Use ports and adapters to isolate important business behavior from NestJS,
PostgreSQL, queues, and external providers.

```text
Inbound adapters                    Outbound adapters
HTTP, jobs, message consumers       PostgreSQL, email, storage, queues
             \                       /
              application use cases
                       ↓
                 domain model
```

The dependency direction is:

```text
API → Application → Domain
          ↓
       Port contract
          ↑
Infrastructure adapter
```

### Advantages

- Core behavior can be tested without frameworks or databases.
- Technology choices can change without rewriting business rules.
- Important boundaries and dependencies are explicit.
- Modules are better prepared for long-term evolution or extraction.

### Disadvantages

- Introduces ports, adapters, mappers, and additional concepts.
- Creates needless ceremony when applied to basic CRUD.
- Poorly designed ports can merely duplicate database methods.

### When to use it

Use it for attendance decisions, event/session lifecycles, QR credential rules,
fine calculation and settlement, approvals, corrections, and integrations with
multiple providers.

### How to apply it

```text
feature/
├── api/              controllers, request DTOs, presenters
├── application/      commands, queries, use cases, ports
├── domain/           entities, value objects, policies, events
├── infrastructure/   PostgreSQL and external-system adapters
└── feature.module.ts composition root
```

Domain code must not import NestJS, Express, PostgreSQL clients, HTTP DTOs, or
provider SDKs.

## 5. Selective Domain-Driven Design

Model only business concepts that own meaningful rules or state transitions.
Do not create a class for every database table.

### Advantages

- Business terminology and invariants become visible in code.
- Rules are centralized rather than duplicated across controllers and jobs.
- Complex workflows become easier to test and discuss.

### Disadvantages

- Requires sustained domain knowledge and design discipline.
- Rich models require mapping to database and API representations.
- Overuse produces abstractions without useful behavior.

### When to use it

Use entities, value objects, policies, and domain events for complex rules. Use
plain TypeScript types for database rows, query projections, serialized API
responses, and behavior-free messages.

Examples of useful domain concepts include `AttendanceRecord`,
`AttendanceWindow`, `StudentCode`, `QrCredential`, `Money`, and event lifecycle
policies.

## 6. Lightweight CQRS

Separate business-changing commands from optimized read queries while using the
same application and PostgreSQL database.

### Advantages

- Commands clearly express intent and enforce domain rules.
- Queries can return efficient projections without hydrating domain objects.
- Read and write paths can evolve independently.

### Disadvantages

- Adds concepts and handler structure.
- Full CQRS with separate stores introduces eventual consistency and operational
  complexity.
- Applying handlers to trivial reads can create boilerplate.

### When to use it

Use commands for `CheckStudentIn`, `CorrectAttendance`, `CancelEvent`,
`IssueFine`, and similar state changes. Use direct query services for lists,
profiles, histories, dashboards, and reports.

### How to apply it

Keep one database initially. Introduce separate read storage only after measured
read load or reporting isolation requires it.

## 7. Event-driven integration

Publish events after meaningful state changes so audit, notifications, and
reporting do not become hard-coded into the originating module.

### Advantages

- Reduces direct coupling between modules.
- Supports background work and later independent scaling.
- Provides a controlled path toward distributed services.

### Disadvantages

- Eventual consistency and retry behavior must be understood.
- Debugging requires correlation and traceability.
- Consumers must be idempotent and events must be versioned.

### When to use it

Start with in-process events for non-critical side effects. Use a transactional
outbox and durable broker when work must survive process failure, consumers are
deployed independently, or throughput requires independent scaling.

### How to apply it

- Name events in past tense, such as `StudentCheckedIn`.
- Store durable outbound events in the same transaction as the state change.
- Include event ID, occurrence time, schema version, and correlation ID.
- Make every external consumer idempotent and observable.

## 8. MVVM-like architecture for React

Use components as views and feature hooks as view models. API adapters own HTTP
communication and response normalization.

### Advantages

- Components remain focused on rendering and user interaction.
- Loading, error, form, and mutation behavior can be tested and reused.
- Feature organization aligns with the backend and Flutter applications.

### Disadvantages

- Hooks can become oversized application services.
- Wrapper hooks add little value for very simple screens.
- Traditional MVVM terminology does not map perfectly to React.

### When and how to use it

Use a view-model hook for screens coordinating several requests, mutations,
forms, permissions, or derived state. A simple read-only component may use a
query hook directly.

```text
features/attendance/
├── api/
├── model/
├── hooks/          view-model behavior
├── components/     views
└── pages/
```

## 9. MVVM/Clean Architecture for Flutter

Use widgets as views, notifiers/view models for presentation state, use cases
for meaningful workflows, and repository interfaces for external access.

### Advantages

- Clear state ownership and testable UI behavior.
- Works well for offline synchronization and multi-step mobile workflows.
- Maintains symmetry with the feature-based web application.

### Disadvantages

- DTO, domain, and view-state mapping can become repetitive.
- Full layering is excessive for simple read-only screens.
- State can be duplicated between caches and view models.

### When and how to use it

Use full layers for authentication, attendance scanning, offline synchronization,
and multi-step workflows. Use a shallower presentation/repository path for
simple lookups and lists.

## 10. Microservices

Microservices are a future deployment option, not the initial architecture.

### Advantages

- Independent deployment and scaling.
- Stronger runtime and ownership isolation.
- Different reliability or technology profiles can be used where justified.

### Disadvantages

- Network failures, retries, versioned contracts, and eventual consistency
  become normal concerns.
- Distributed tracing, service security, and automated operations become
  mandatory.
- Cross-service transactions and integration testing become significantly more
  difficult.

### When to extract a service

Require at least one measurable driver:

- sustained independent scaling needs;
- an independent team and release cycle;
- a security or regulatory boundary;
- required fault isolation;
- a substantially different workload or runtime;
- repeated evidence that the monolith cannot meet a service objective.

Likely future candidates are notifications, large report generation,
imports/exports, and archival processing. Do not extract core attendance
transactions until their consistency boundary is stable.

## Long-term operational requirements

Architecture alone does not make a system enterprise-grade. The following are
part of the architecture contract:

- versioned OpenAPI contracts and compatibility tests;
- expand/migrate/verify/contract database migrations;
- idempotency for retried commands;
- explicit transaction and concurrency rules;
- structured logs, request IDs, metrics, traces, and actionable alerts;
- append-only audit history for sensitive administrative actions;
- automated unit, contract, PostgreSQL integration, and smoke tests;
- vulnerability and dependency scanning;
- rehearsed backup restoration and application rollback;
- architecture decision records for cross-cutting changes;
- defined retention, privacy, and data-export policies.

## Evolution path

### Stage 1: establish boundaries

- Complete the NestJS modular-monolith migration.
- Keep legacy aliases compatible during consumer migration.
- Enforce module ownership and inward dependency direction.
- Establish API, database, testing, and observability standards.

### Stage 2: harden core workflows

- Model attendance, event sessions, QR credentials, and fines explicitly.
- Add command idempotency, transactions, locking, and audit trails.
- Add in-process events for non-critical side effects.

### Stage 3: scale measured bottlenecks

- Optimize SQL and indexes before adding caches.
- Move durable background work behind a transactional outbox and queue.
- Run multiple stateless API instances after process-local coordination has
  been removed.
- Add read replicas or dedicated projections only when measurements justify
  them.

### Stage 4: extract proven boundaries

- Extract only modules with independent operational requirements.
- Preserve versioned contracts, event compatibility, observability, and
  rollback paths.
- Keep strongly consistent core transactions together unless there is a
  compelling reason to distribute them.

## Decision rules for new work

Before adding architecture, ask:

1. Does this feature contain important invariants or state transitions?
2. Does it integrate with replaceable external technology?
3. Does it need a transaction, idempotency, concurrency control, or audit?
4. Will several delivery mechanisms call the same operation?
5. Is independent scaling or ownership proven rather than hypothetical?

If the first four answers are mostly no, use the lightweight feature structure.
If they are mostly yes, use Hexagonal Architecture and selective DDD. If only
the fifth answer is yes and supported by evidence, evaluate service extraction
through an ADR.

## Final standard

The long-term standard is a **feature-based modular monolith with graduated
architecture**: strict ownership and dependency rules everywhere, rich domain
modeling only in complex business modules, optimized projections for reads, and
distributed infrastructure introduced only for proven operational needs.

Implementation-level requirements are defined in
[`ENTERPRISE_GRADE_GUIDE.md`](ENTERPRISE_GRADE_GUIDE.md). API contracts are
defined in [`API_RESPONSE_FORMAT.md`](API_RESPONSE_FORMAT.md), and significant
future decisions belong in [`adr/`](adr/README.md).
