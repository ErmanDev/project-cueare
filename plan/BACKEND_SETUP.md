# Backend Setup Guide — Express + TypeScript + PostgreSQL, Local/LAN

> **Status:** `/server` is an Express REST API wired to **PostgreSQL** (schema `ssc`).
> The Flutter app talks to the same JSON endpoints as before.

Step-by-step instructions to get the API running on your machine,
storing data in PostgreSQL (viewable in DBeaver, pgAdmin, HeidiSQL, etc.), and
reachable by phones on the same Wi-Fi network.

---

## Quick start

Prereqs: Node.js 20+, PostgreSQL running locally (you have `postgresql-x64-18`).

```powershell
cd server

# 1) Point at your Postgres password (pick ONE style)
# copy .env.example .env  and edit DATABASE_PASSWORD
# or: $env:DATABASE_PASSWORD = 'YOUR_POSTGRES_PASSWORD'
# or: $env:DATABASE_URL = 'postgres://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/aclc'

# 2) Create DB + admin
npm install
npm run ensure-db
npm run seed-admin          # admin / changeme123

# 3) Run API
npm run dev                 # http://0.0.0.0:8080
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
| `PORT` | `8080` | Listen port |
| `DATABASE_URL` | — | `postgres://user:pass@host:5432/aclc` (overrides discrete vars) |
| `DATABASE_HOST` | `localhost` | |
| `DATABASE_PORT` | `5432` | |
| `DATABASE_NAME` | `aclc` | |
| `DATABASE_USER` | `postgres` | |
| `DATABASE_PASSWORD` | `postgres` | Change this to match your install |
| `JWT_SECRET` | auto `jwt_secret.txt` | |
| `JWT_TTL_HOURS` | `12` | |
| `QR_HMAC_SECRET` | unset | Optional signed QR payloads |

---

## Firewall

Windows Security → Firewall → Advanced → Inbound Rule → TCP `8080` → Allow.

Find your LAN IP (`ipconfig` → Wi-Fi IPv4), then point the Flutter app's Server
Settings at `YOUR_IP:8080`.

## Sanity checklist

- [ ] Postgres service running (`postgresql-x64-18`)
- [ ] `npm run ensure-db` + `npm run seed-admin` succeeded
- [ ] Phone and laptop on the same Wi-Fi
- [ ] Firewall allows 8080
- [ ] Browser on phone or laptop: `http://YOUR_IP:8080/` opens the Flutter app
      (Staff / Student). `http://YOUR_IP:8080/api` returns JSON `"status":"ok"`

Reset admin password: `npm run seed-admin -- admin newpassword`.
Create another superadmin: `npm run seed-admin -- erman epass123`.

Tests: `npm test`.
