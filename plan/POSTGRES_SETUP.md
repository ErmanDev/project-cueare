# PostgreSQL Setup & Monitoring

How to run the SSC QR Attendance server against **PostgreSQL** and inspect data in
DBeaver, pgAdmin, HeidiSQL, or similar tools.

> Stock **Laragon** ships **MySQL**, not Postgres. This app needs PostgreSQL
> (Windows installer, Docker, or a Laragon Postgres addon). Then connect with
> any Postgres-capable GUI.

---

## Prerequisites

- Node.js 20+ on PATH (`node --version`)
- PostgreSQL running locally (this machine has service `postgresql-x64-18`)
- Your `postgres` user password (set during Postgres install)

---

## 1. Configure the password

```powershell
cd "C:\Users\EMMAN\Downloads\Coding\Mobile Dev\SSC QR ATTENDANCE\server"
copy .env.example .env
notepad .env
```

Edit `.env` and set your real password:

```env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=aclc
DATABASE_USER=postgres
DATABASE_PASSWORD=YOUR_REAL_PASSWORD
```

Or use a single URL instead:

```env
DATABASE_URL=postgres://postgres:YOUR_REAL_PASSWORD@localhost:5432/aclc
```

The server loads `.env` automatically (process env vars still override it).

---

## 2. Create the database + seed admin

```powershell
cd server
bun install
bun run ensure-db            # CREATE DATABASE aclc if missing
bun run seed-admin           # creates admin / changeme123
```

Reset password later:

```powershell
bun run seed-admin -- admin newpassword
```

---

## 3. Start the API

```powershell
bun run dev
```

Or without the watcher:

```powershell
bun start
```

Check health in a browser:

```
http://localhost:8080/
```

You should see JSON like:

```json
{
  "name": "SSC QR Attendance API",
  "status": "ok",
  "database": "postgres@localhost:5432/aclc"
}
```

---

## 4. Monitor in a DB GUI

Connect with **DBeaver**, **pgAdmin**, **HeidiSQL**, etc.:

| Field    | Value                  |
| -------- | ---------------------- |
| Host     | `localhost`            |
| Port     | `5432`                 |
| Database | `aclc`                 |
| User     | `postgres`             |
| Password | your Postgres password |
| SSL      | off (local)            |

### Tables to watch

| Table             | Contents                                    |
| ----------------- | ------------------------------------------- |
| `"Users"`                              | Superadmin + moderator logins    |
| `"Students"` / `"StudentEnrollments"`  | Student QR records + roster      |
| `"Events"` / `"EventSessions"`         | Events and session time windows  |
| `"AttendanceRecords"`                  | Check-in / check-out per session |
| `"AttendanceLogs"`                     | Scan audit (`CHECK_IN` / `CHECK_OUT`) |

Useful query while testing scans:

```sql
SET search_path TO ssc;

SELECT
  l."attendanceLogId",
  l."actionCode",
  l."isCancelled",
  l."recordedAtUtc",
  ep."studentId",
  ep."eventSessionId"
FROM "AttendanceLogs" l
JOIN "AttendanceRecords" ar ON ar."attendanceRecordId" = l."attendanceRecordId"
JOIN "EventParticipants" ep ON ep."eventParticipantId" = ar."eventParticipantId"
ORDER BY l."recordedAtUtc" DESC
LIMIT 50;
```

---

## 5. Or use `psql` (CLI)

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -d aclc
```

Then:

```sql
SET search_path TO ssc;
\dt
SELECT * FROM "Users";
SELECT * FROM "AttendanceLogs" ORDER BY "attendanceLogId" DESC LIMIT 20;
\q
```

(You will be prompted for the Postgres password.)

---

## 6. Flutter app (phones)

1. Keep Bun running on `127.0.0.1:8080` and publish it with IIS
   (see [`IIS_SETUP.md`](IIS_SETUP.md)).
2. In the app: Server Settings → IIS host name (`attendance.yourschool.edu`) → Test → Save.
3. Login: `admin` / `changeme123`.

---

## Environment reference

| Variable            | Default               | Meaning                               |
| ------------------- | --------------------- | ------------------------------------- |
| `DATABASE_URL`      | —                     | Full URL; overrides the discrete vars |
| `DATABASE_HOST`     | `localhost`           |                                       |
| `DATABASE_PORT`     | `5432`                |                                       |
| `DATABASE_NAME`     | `aclc`                |                                       |
| `DATABASE_USER`     | `postgres`            |                                       |
| `DATABASE_PASSWORD` | `postgres`            | Change to match your install          |
| `JWT_SECRET`        | auto `jwt_secret.txt` |                                       |
| `JWT_TTL_HOURS`     | `12`                  |                                       |
| `QR_HMAC_SECRET`    | unset                 | Optional signed QR payloads           |

---

## Troubleshooting

| Problem                                    | Fix                                                                                             |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `password authentication failed`           | Wrong `DATABASE_PASSWORD` / `DATABASE_URL` — match the password you set for the `postgres` user |
| `database "aclc" does not exist` | Run `bun run ensure-db` |
| GUI can't connect                          | Confirm service `postgresql-x64-18` is Running; host `localhost`, port `5432`; schema `ssc` |
| Phone can't reach API                      | IIS site started, DNS host name, firewall 80/443, app uses that host name — see IIS_SETUP.md     |
| Old `attendance.db` file                   | Unused after Postgres migration — safe to delete                                                |

Unit tests: `bun test`. Attendance engine tests need a reachable Postgres.

## add superadmin

1. Change the admin password — default is admin / changeme123. Re-run:

```powershell
bun run seed-admin -- youruser yourpassword
bun run seed-admin -- erman epass
```
