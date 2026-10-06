# Documentation

- [`architecture/LONG_TERM_ARCHITECTURE.md`](architecture/LONG_TERM_ARCHITECTURE.md)
  explains the selected architecture, alternatives, tradeoffs, and adoption
  stages for the long-lived system.
- [`architecture/ENTERPRISE_GRADE_GUIDE.md`](architecture/ENTERPRISE_GRADE_GUIDE.md)
  defines the implementation and operational standards.
- [`architecture/RESILIENCE_AND_PRODUCTION_READINESS.md`](architecture/RESILIENCE_AND_PRODUCTION_READINESS.md)
  defines when, where, and why to use pooling, timeouts, idempotency, retries,
  circuit breakers, queues, caching, and scaling controls.
- `operations` contains current setup, database, backup, IIS, container, and
  release runbooks.
- `plans` contains implementation plans and historical design records.

Architecture decisions that affect more than one application should be added as
an ADR under `architecture/adr`.
