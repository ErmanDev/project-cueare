# SSC QR Attendance

LAN-only QR event attendance: a **Dart Frog + PostgreSQL** server (runs on a laptop) and a
**Flutter** app (moderator phones scan student QR codes; superadmin manages everything;
students can display their own QR). No internet or cloud required — every device just
joins the same Wi-Fi router.

```
/server   Dart Frog API + Drift/PostgreSQL
/app      Flutter app (Android / iOS; Windows build works for admin screens only)
/plan     Original build plan + backend / Postgres setup notes
```

**Postgres setup & GUI monitoring:** see [`plan/POSTGRES_SETUP.md`](plan/POSTGRES_SETUP.md).

## 1. PostgreSQL (one-time)

You already need a running Postgres (Windows installer, Docker, or Laragon's Postgres
addon). Your machine has `postgresql-x64-18` available.

1. Create a `.env` in `/server` (copy from `.env.example`) and set your real password:

```powershell
cd server
copy .env.example .env
# edit .env → DATABASE_PASSWORD=YOUR_POSTGRES_PASSWORD
```

Or set it in the shell for this session:

```powershell
$env:DATABASE_PASSWORD = 'YOUR_POSTGRES_PASSWORD'
# optional: $env:DATABASE_URL = 'postgres://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/ssc_attendance'
```

2. Create the database + seed the admin:

```powershell
dart pub get
dart run tool/ensure_database.dart   # CREATE DATABASE ssc_attendance if missing
dart run tool/seed_admin.dart        # admin / changeme123
```

### Monitor in a GUI (DBeaver / pgAdmin / HeidiSQL)

| Field    | Value            |
|----------|------------------|
| Host     | `localhost`      |
| Port     | `5432`           |
| Database | `ssc_attendance` |
| User     | `postgres`       |
| Password | *(your password)* |

Tables appear after the first server start / seed (`users`, `students`, `events`,
`session_windows`, `attendance_logs`).

> **Laragon note:** stock Laragon ships **MySQL**, not Postgres. Use Postgres via the
> Windows installer (you already have it), Docker, or a Laragon Postgres addon — then
> connect with HeidiSQL/DBeaver/pgAdmin. Do **not** point this app at MySQL.

## 2. Run the server (laptop)

```powershell
cd server
dart pub get
dart pub global activate dart_frog_cli   # once
dart_frog dev --port 8080                # hot reload
```

For events, prefer the production build (no hot-reload overhead):

```powershell
dart_frog build
dart build/bin/server.dart               # PORT env var overrides 8080
```

Then:

1. `ipconfig` → note the Wi-Fi adapter's **IPv4 address** (e.g. `192.168.1.10`).
2. Allow inbound TCP **8080** in Windows Firewall (Advanced settings → Inbound Rules → New Rule → Port).
3. From a phone browser open `http://192.168.1.10:8080/` — you should see `{"status":"ok", "database":"postgres@localhost:5432/ssc_attendance", ...}`.

Runtime file (git-ignored): `jwt_secret.txt` (auto-generated; delete it to invalidate all logins).

Optional env vars: `DATABASE_URL` (or `DATABASE_HOST` / `PORT` / `NAME` / `USER` / `PASSWORD`),
`JWT_SECRET`, `JWT_TTL_HOURS` (default 12), `QR_HMAC_SECRET`.

Reset the admin password: `dart run tool/seed_admin.dart admin newpassword`.

Tests: `dart test` (still use in-memory SQLite — no Postgres required for unit tests).

## 2. Run the app (phones)

```powershell
cd app
flutter pub get
flutter run            # or: flutter build apk --release  →  build/app/outputs/flutter-apk/app-release.apk
```

First launch asks for the **server address** (`192.168.1.10:8080`) — use *Test connection*
then *Save*. It can be changed later from the ⚙ icon on any screen.

## 3. Workflow

| Role | Login | What they do |
|---|---|---|
| Superadmin | `admin` / `changeme123` (change it!) | Events + session windows, students (single/CSV import, QR preview), moderator accounts, attendance records (filter / edit / delete / export CSV) |
| Moderator | account created by superadmin | Pick event → **[Auto \| Morning \| Afternoon]** → scan → confirm/cancel; "My scans today" |
| Student | just their student code, no password | My QR, My attendance |

Setup order: **event with session windows → students → moderators → scan.**

### How IN / OUT is decided (server-side, authoritative)

* The session (Morning/Afternoon/…) is picked from the **server clock** against the event's
  windows, unless the moderator selected one manually before scanning.
* Per (event, student, session): 1st confirmed scan = **IN**, 2nd = **OUT**, 3rd+ = blocked
  ("Already timed IN & OUT for Morning"). Superadmin can edit/delete records to fix mistakes.
* *Cancel* on the preview sheet writes a `cancelled` audit row that never affects IN/OUT.
* Confirm re-derives the direction inside a transaction, so two moderators scanning the same
  student at once can't both record IN.
* Outside every window in Auto mode, the moderator is asked to pick a session (or block).

## 4. API summary

```
POST /auth/login  {username,password} → {token, role, user}
GET  /auth/me
GET|POST        /admin/moderators          PUT|DELETE /admin/moderators/:id
GET|POST        /admin/students            PUT|DELETE /admin/students/:id     POST /admin/students/import
GET|POST        /admin/events              GET|PUT|DELETE /admin/events/:id
GET|POST        /admin/events/:id/session-windows        PUT|DELETE /admin/session-windows/:id
GET             /admin/attendance?event_id=&date=&student_id=&session_window_id=&status=&q=
PUT|DELETE      /admin/attendance/:id      GET /admin/attendance/export (CSV)
GET  /moderator/events/active
GET  /moderator/session-windows?event_id=&mode=auto|manual&override=Morning
POST /moderator/scan/preview  {event_id, student_id_code, session_window_id?}
POST /moderator/scan/confirm  {event_id, student_id, session_window_id, direction?}
POST /moderator/scan/cancel   {event_id, student_id, session_window_id}
GET  /moderator/scans/mine?event_id=&date=all&status=all
GET  /student/:code/qr        GET /student/:code/attendance
```

`/admin/*` requires a superadmin JWT, `/moderator/*` a moderator JWT
(`Authorization: Bearer <token>`); `/student/*` is unauthenticated (LAN only, read-only).

## 5. Troubleshooting

* **Phone can't connect** — same Wi-Fi (not guest network / mobile data)? Server running?
  Firewall rule for 8080? IP still the same (set a DHCP reservation for the laptop)?
* **"No active session window right now"** — server time is outside all windows; pick a
  session manually or fix the windows in the event editor.
* **Camera black on Android** — grant camera permission; the app also has a
  "type code manually" fallback (keyboard icon on the scanner).
* **Forgot admin password** — `dart run tool/seed_admin.dart admin newpass`.
