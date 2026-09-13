# server

Express + TypeScript REST API for SSC QR Attendance. PostgreSQL schema `ssc`. Runs on **Bun**.

```powershell
bun install
bun run ensure-db
bun run seed-admin
bun run dev
```

API listens on `127.0.0.1:8080`. REST JSON is at `/api`. Publish that process
through IIS — see [`../plan/IIS_SETUP.md`](../plan/IIS_SETUP.md).

Scan-day load is handled in-process (no Redis):

- **Cache** — students, events, and session windows (TTL, invalidated on admin writes)
- **Batching** — QR student lookups in the same few milliseconds share one `WHERE code = ANY(...)` query
- **Queue** — confirm/cancel for the same student+session run one at a time; other students proceed in parallel
- **Rate limits** — login and scan endpoints return `429` + `Retry-After` when a device floods
- **DB locks** — `pg_advisory_xact_lock(student, session)` plus row locks so two gates cannot both write IN

Override with `SCAN_CACHE_TTL_MS`, `SCAN_BATCH_WINDOW_MS`, `SCAN_WRITE_CONCURRENCY`, `RATE_LIMIT_ENABLED`, `RATE_LIMIT_LOGIN_MAX`, `RATE_LIMIT_SCAN_PREVIEW_MAX`, `RATE_LIMIT_SCAN_WRITE_MAX`.

```powershell
bun run build:web        # React UI → ../web/dist (uses pnpm in /web)
bun start                # serves the web app at /  and REST at /api
```

On this machine: [http://127.0.0.1:8080/](http://127.0.0.1:8080/) (superadmin / moderator).
After IIS is bound, use the site host name from other devices.
Swagger: [http://127.0.0.1:8080/docs](http://127.0.0.1:8080/docs)
OpenAPI JSON: [http://127.0.0.1:8080/openapi.json](http://127.0.0.1:8080/openapi.json)

Use **Authorize** in Swagger after `POST /api/auth/login` and paste the JWT.

## Event roster migration

Server startup adds `EventRegistrations` and `EventParticipantQrCredentials`, then links existing session participants and QR passes to their registration. The backfill is safe to retry. Existing attendance records and printed UUID passes stay in place. New registrations create one participant per event session; closing a session creates an empty attendance record for each unscanned participant, reported as `ABSENT`.

For an application rollback, deploy the previous server and web build while leaving the added tables and nullable `EventParticipants.eventRegistrationId` column in place. Remove those schema additions only after a separate data review and migration.
