# Backend Setup Guide — Dart Frog + PostgreSQL (Drift), Local/LAN

> **Status:** The `/server` project is already scaffolded and wired to **PostgreSQL**.
> You do **not** need to re-create the Dart Frog app or paste the sample snippets below
> unless you are rebuilding from scratch. For day-to-day use, follow the
> [Quick start](#quick-start-already-built) section.

Step-by-step instructions to get the `/server` API running on your machine,
storing data in PostgreSQL (viewable in DBeaver, pgAdmin, HeidiSQL, etc.), and
reachable by phones on the same Wi-Fi network.

---

## Quick start (already built)

Prereqs: Dart/Flutter SDK, PostgreSQL running locally (you have `postgresql-x64-18`).

```powershell
cd server

# 1) Point at your Postgres password (pick ONE style)
$env:DATABASE_PASSWORD = 'YOUR_POSTGRES_PASSWORD'
# or: $env:DATABASE_URL = 'postgres://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/ssc_attendance'
# or: copy .env.example .env  and edit DATABASE_PASSWORD  (load .env yourself / set in shell)

# 2) Create DB + admin
dart pub get
dart run tool/ensure_database.dart
dart run tool/seed_admin.dart          # admin / changeme123

# 3) Run API
dart pub global activate dart_frog_cli # once
dart_frog dev --port 8080
```

Open in DBeaver / pgAdmin / HeidiSQL:

| Field    | Value            |
|----------|------------------|
| Host     | `localhost`      |
| Port     | `5432`           |
| Database | `ssc_attendance` |
| User     | `postgres`       |
| Password | your Postgres password |

Tables: `users`, `students`, `events`, `session_windows`, `attendance_logs`.

**Laragon:** stock Laragon is MySQL. This app needs **PostgreSQL** — use the Windows
Postgres install (already present on this machine), Docker, or a Laragon Postgres
addon, then connect with HeidiSQL/DBeaver/pgAdmin.

---

## Environment variables

| Variable | Default | Meaning |
|----------|---------|---------|
| `DATABASE_URL` | — | `postgres://user:pass@host:5432/ssc_attendance` (overrides discrete vars) |
| `DATABASE_HOST` | `localhost` | |
| `DATABASE_PORT` | `5432` | |
| `DATABASE_NAME` | `ssc_attendance` | |
| `DATABASE_USER` | `postgres` | |
| `DATABASE_PASSWORD` | `postgres` | Change this to match your install |
| `JWT_SECRET` | auto `jwt_secret.txt` | |
| `JWT_TTL_HOURS` | `12` | |
| `QR_HMAC_SECRET` | unset | Optional signed QR payloads |

---

## Historical notes (from-scratch scaffold)

The sections below describe how the project was originally set up. Kept for
reference; skip them if `/server` already exists.

### 1. Prerequisites

- [Dart SDK](https://dart.dev/get-dart) (or Flutter's bundled Dart)
- PostgreSQL server listening on `localhost:5432`

### 2. Create the Dart Frog project

```bash
dart pub global activate dart_frog_cli
dart_frog create server
cd server
```

### 3. Add dependencies

```yaml
dependencies:
  drift: ^2.x
  drift_postgres: ^1.x
  postgres: ^3.x
  sqlite3: ^2.x          # still used for in-memory unit tests
  dart_jsonwebtoken: ^2.x
  crypto: ^3.x
dev_dependencies:
  drift_dev: ^2.x
  build_runner: ^2.x
```

`build.yaml` enables both dialects (`sqlite` + `postgres`) so tests stay on
SQLite while production uses Postgres.

### 4–8. Schema, middleware, auth, roles

Implemented under `server/lib/src/` and `server/routes/`. Password hashing is
salted PBKDF2-HMAC-SHA256 (not plain SHA-256). JWT secret lives in
`jwt_secret.txt` when `JWT_SECRET` is unset.

### 9. Run the server

```bash
dart_frog dev --port 8080
```

Find your LAN IP (`ipconfig` → Wi-Fi IPv4), open firewall port `8080`, and point
the Flutter app's Server Settings at `YOUR_IP:8080`.

### 10. Firewall

Windows Security → Firewall → Advanced → Inbound Rule → TCP `8080` → Allow.

### 11. Flutter app

Server Settings → `192.168.x.x:8080` → Test → Save → login `admin` / `changeme123`.

### 12. Sanity checklist

- [ ] Postgres service running (`postgresql-x64-18`)
- [ ] `ensure_database` + `seed_admin` succeeded
- [ ] Phone and laptop on the same Wi-Fi
- [ ] Firewall allows 8080
- [ ] Browser on phone: `http://YOUR_IP:8080/` returns JSON with `"status":"ok"`
