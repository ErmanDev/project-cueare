# Backend Setup Guide — Express + TypeScript + PostgreSQL behind IIS

> **Status:** `/server` is an Express REST API wired to **PostgreSQL** (schema `ssc`).
> The Flutter app talks to the same JSON endpoints as before.

Step-by-step instructions to get the API running on this Windows machine,
storing data in PostgreSQL (viewable in DBeaver, pgAdmin, HeidiSQL, etc.), and
published through **IIS**. Phones use the IIS host name, not a laptop IP.

Full IIS walkthrough: [`IIS_SETUP.md`](IIS_SETUP.md).

---

## Quick start

Prereqs: **Bun** 1.2+, PostgreSQL running locally (you have `postgresql-x64-18`).

```powershell
cd server

# 1) Point at your Postgres password (pick ONE style)
# copy .env.example .env  and edit DATABASE_PASSWORD
# or: $env:DATABASE_PASSWORD = 'YOUR_POSTGRES_PASSWORD'
# or: $env:DATABASE_URL = 'postgres://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/aclc'

# 2) Create DB + admin
bun install
bun run ensure-db
bun run seed-admin          # admin / changeme123

# 3) Run API
bun run dev                 # http://127.0.0.1:8080  (IIS is the public URL)
```

Open in DBeaver / pgAdmin / HeidiSQL:

| Field    | Value            |
|----------|------------------|
| Host     | `localhost`      |
| Port     | `5432`           |
| Database | `aclc`           |
| User     | `postgres`       |
| Password | your Postgres password |
| Schema   | `ssc`            |

Tables: `"Users"`, academic calendar (`"AcademicYears"`,
`"AcademicTerms"`, `"AcademicPrograms"`, `"Sections"`, `"Students"`,
`"StudentEnrollments"`), events (`"Events"`, `"EventSessions"`, `"EventParticipants"`),
and attendance (`"AttendanceRecords"`, `"AttendanceCorrections"`, `"AttendanceLogs"`).
PostgreSQL identifiers are quoted: PascalCase tables, camelCase columns. REST JSON
stays snake_case.

**Laragon:** stock Laragon is MySQL. This app needs **PostgreSQL** — use the Windows
Postgres install (already present on this machine), Docker, or a Laragon Postgres
addon, then connect with HeidiSQL/DBeaver/pgAdmin.

---

## Environment variables

| Variable | Default | Meaning |
|----------|---------|---------|
| `PORT` | `8080` | Backend listen port (localhost only) |
| `LISTEN_HOST` | `127.0.0.1` | Bind address — keep localhost; IIS proxies in |
| `TRUST_PROXY` | `true` | Honor `X-Forwarded-*` from IIS |
| `DATABASE_URL` | — | `postgres://user:pass@host:5432/aclc` (overrides discrete vars) |
| `DATABASE_HOST` | `localhost` | |
| `DATABASE_PORT` | `5432` | |
| `DATABASE_NAME` | `aclc` | |
| `DATABASE_USER` | `postgres` | |
| `DATABASE_PASSWORD` | `postgres` | Change this to match your install |
| `JWT_SECRET` | auto `jwt_secret.txt` | |
| `JWT_TTL_HOURS` | `12` | |
| `QR_HMAC_SECRET` | unset | Optional signed QR payloads |
| `SCAN_CACHE_TTL_MS` | `30000` | In-memory student cache TTL |
| `EVENT_CACHE_TTL_MS` | `15000` | In-memory event/window cache TTL |
| `SCAN_BATCH_WINDOW_MS` | `8` | How long to coalesce QR student lookups |
| `SCAN_WRITE_CONCURRENCY` | `8` | Max parallel confirm/cancel writes |
| `RATE_LIMIT_ENABLED` | `true` | In-process login/scan rate limits |
| `RATE_LIMIT_LOGIN_MAX` | `10` | Login attempts per IP/username per window |
| `RATE_LIMIT_SCAN_PREVIEW_MAX` | `40` | Preview scans per moderator per window |
| `RATE_LIMIT_SCAN_WRITE_MAX` | `20` | Confirm/cancel per moderator per window |

---

## Publish with IIS

Do not open port 8080 on the firewall and do not type a laptop IPv4 into the app.

1. Keep Bun on `127.0.0.1:8080` (`bun start`).
2. Follow [`IIS_SETUP.md`](IIS_SETUP.md): ARR reverse proxy, site host name on port 80/443.
3. In the Flutter app, Server Settings → `attendance.yourschool.edu` → Test → Save.

## Sanity checklist

- [ ] Postgres service running (`postgresql-x64-18`)
- [ ] `bun run ensure-db` + `bun run seed-admin` succeeded
- [ ] `http://127.0.0.1:8080/api/health` works on the server
- [ ] IIS site is started; ARR proxy enabled
- [ ] Firewall allows 80/443 (not 8080)
- [ ] Phone browser: `http://attendance.yourschool.edu/api` returns `"status":"ok"`

Reset admin password: `bun run seed-admin -- admin newpassword`.
Create another superadmin: `bun run seed-admin -- erman epass123`.

Tests: `bun test`.
