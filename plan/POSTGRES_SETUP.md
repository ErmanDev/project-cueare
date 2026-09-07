# PostgreSQL Setup & Monitoring

How to run the SSC QR Attendance server against **PostgreSQL** and inspect data in
DBeaver, pgAdmin, HeidiSQL, or similar tools.

> Stock **Laragon** ships **MySQL**, not Postgres. This app needs PostgreSQL
> (Windows installer, Docker, or a Laragon Postgres addon). Then connect with
> any Postgres-capable GUI.

---

## Prerequisites

- Dart / Flutter SDK on PATH (`dart --version`)
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
DATABASE_NAME=ssc_attendance
DATABASE_USER=postgres
DATABASE_PASSWORD=YOUR_REAL_PASSWORD
```

Or use a single URL instead:

```env
DATABASE_URL=postgres://postgres:YOUR_REAL_PASSWORD@localhost:5432/ssc_attendance
```

The server loads `.env` automatically (process env vars still override it).

---

## 2. Create the database + seed admin

```powershell
cd server
dart pub get
dart run tool/ensure_database.dart   # CREATE DATABASE ssc_attendance if missing
dart run tool/seed_admin.dart        # creates admin / changeme123
```

Reset password later:

```powershell
dart run tool/seed_admin.dart admin newpassword
```

---

## 3. Start the API

```powershell
dart pub global activate dart_frog_cli   # once
dart_frog dev --port 8080
```

Or production-style:

```powershell
dart_frog build
dart build/bin/server.dart
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
  "database": "postgres@localhost:5432/ssc_attendance"
}
```

---

## 4. Monitor in a DB GUI

Connect with **DBeaver**, **pgAdmin**, **HeidiSQL**, etc.:

| Field    | Value                  |
| -------- | ---------------------- |
| Host     | `localhost`            |
| Port     | `5432`                 |
| Database | `ssc_attendance`       |
| User     | `postgres`             |
| Password | your Postgres password |
| SSL      | off (local)            |

### Tables to watch

| Table             | Contents                                    |
| ----------------- | ------------------------------------------- |
| `users`           | Superadmin + moderator accounts             |
| `students`        | Student records / QR codes                  |
| `events`          | Events                                      |
| `session_windows` | Morning / Afternoon (or custom) time ranges |
| `attendance_logs` | IN / OUT scans (`confirmed` / `cancelled`)  |

Useful query while testing scans:

```sql
SELECT id, direction, status, scanned_at, student_id, session_window_id
FROM attendance_logs
ORDER BY scanned_at DESC
LIMIT 50;
```

---

## 5. Or use `psql` (CLI)

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -d ssc_attendance
```

Then:

```sql
\dt
SELECT * FROM users;
SELECT * FROM attendance_logs ORDER BY id DESC LIMIT 20;
\q
```

(You will be prompted for the Postgres password.)

---

## 6. Flutter app (phones)

1. Keep the server running.
2. `ipconfig` → copy your Wi-Fi **IPv4**.
3. Allow Windows Firewall inbound TCP **8080**.
4. In the app: Server Settings → `YOUR_IP:8080` → Test → Save.
5. Login: `admin` / `changeme123`.

---

## Environment reference

| Variable            | Default               | Meaning                               |
| ------------------- | --------------------- | ------------------------------------- |
| `DATABASE_URL`      | —                     | Full URL; overrides the discrete vars |
| `DATABASE_HOST`     | `localhost`           |                                       |
| `DATABASE_PORT`     | `5432`                |                                       |
| `DATABASE_NAME`     | `ssc_attendance`      |                                       |
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
| `database "ssc_attendance" does not exist` | Run `dart run tool/ensure_database.dart`                                                        |
| GUI can't connect                          | Confirm service `postgresql-x64-18` is Running; host `localhost`, port `5432`                   |
| Phone can't reach API                      | Same Wi-Fi, firewall allows 8080, correct LAN IP in app settings                                |
| Old `attendance.db` file                   | Unused after Postgres migration — safe to delete                                                |

Unit tests still use **in-memory SQLite** (`dart test`) and do not need Postgres.

## add superadmin

1. Change the admin password — default is admin
   / changeme123. Re-run:

   dart run tool/seed_admin.dart youruser
   yourpassword

dart run tool/seed_admin.dart erman epass
