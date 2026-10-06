# NestJS migration

The migration is intentionally additive. The current Bun/Express entry point
remains available while NestJS becomes the application host and feature modules
are moved one domain at a time.

## Current stage: NestJS migration host

- `bun run start` and `bun run start:nest` start the NestJS migration host.
- The host dispatches migrated routes
  to NestJS and all remaining traffic to the existing Express application.
- Native Nest modules currently own v2 health/readiness/metrics, authentication,
  student reads, and attendance scan preview/confirmation.
- `src/legacy` contains the explicit Express compatibility boundary, including
  the rollback entry point and routes not yet migrated.
- Both hosts share the PostgreSQL infrastructure, Socket.IO server, kiosk
  WebSocket server, static web build, and compatible legacy contracts.
- `test/nest/compatibility.test.ts` verifies canonical and legacy route behavior.

Route ownership is explicit in `src/nest/compatibility/route-ownership.ts`. A
route is not migrated until it has both a Nest controller and an ownership-list
entry.

Schema evolution is independent of the HTTP migration and uses the checksummed
runner documented in `docs/operations/DATABASE_MIGRATIONS.md`.

## Forward path

1. Keep the full compatibility and contract suite passing.
2. Move one domain at a time into a Nest feature module, preserving route and
   response contracts with characterization tests.
3. Remove its fallback entries only after supported clients use the Nest route.
4. Introduce shared rate limiting, Socket.IO coordination, and durable workers
   only after the HTTP migration is stable.
5. Evaluate the Fastify adapter after no Express-owned routes remain.

## Rollback

Switch the process command to `bun run start:legacy`. Both entry points use the
same database schema and shared services, so an application rollback does not
require a data conversion when migrations followed expand-and-contract rules.

Do not delete `src/legacy` until every compatibility contract has passed and a
separately approved contraction is scheduled.
