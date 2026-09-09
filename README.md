# SSC QR Attendance

QR event attendance: an **Express + TypeScript + PostgreSQL** REST API behind
**Internet Information Services (IIS)** on Windows, a **React** admin/moderator web
app, and a **Flutter** app for phones (Android/iOS) and Windows. Clients use the
IIS host name — not a laptop LAN IP.

```
/server   Express + TypeScript REST API + PostgreSQL (Bun)
/web      React + TypeScript admin & moderator UI
/app      Flutter app (Android / iOS / Windows)
/plan     Original build plan + backend / Postgres setup notes
```

**Postgres:** [`plan/POSTGRES_SETUP.md`](plan/POSTGRES_SETUP.md).  
**IIS (how phones reach the server):** [`plan/IIS_SETUP.md`](plan/IIS_SETUP.md).

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
# optional: $env:DATABASE_URL = 'postgres://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/aclc'
```

2. Create the database + seed the admin:

```powershell
bun install
bun run ensure-db      # CREATE DATABASE aclc if missing
bun run seed-admin     # admin / changeme123
```

### Monitor in a GUI (DBeaver / pgAdmin / HeidiSQL)

| Field    | Value            |
|----------|------------------|
| Host     | `localhost`      |
| Port     | `5432`           |
| Database | `aclc` |
| User     | `postgres`       |
| Password | *(your password)* |

Tables appear after the first server start / seed in schema `ssc` (`"Users"`,
`"Students"`, `"Events"`, `"EventSessions"`, `"AttendanceRecords"`,
`"AttendanceLogs"`, and related academic / enrollment tables).

> **Laragon note:** stock Laragon ships **MySQL**, not Postgres. Use Postgres via the
> Windows installer (you already have it), Docker, or a Laragon Postgres addon — then
> connect with HeidiSQL/DBeaver/pgAdmin. Do **not** point this app at MySQL.

## 2. Run the backend (localhost) and publish it with IIS

```powershell
cd server
bun install
bun run build:web        # React UI → ../web/dist (once, or after web changes)
bun run dev              # watch; listens on 127.0.0.1:8080
```

For events, run without the file watcher:

```powershell
bun start                # still 127.0.0.1:8080 — IIS is the public address
```

On this Windows machine only: [http://127.0.0.1:8080/](http://127.0.0.1:8080/) (admin/moderator
web app), `/api`, and `/docs`.

Then publish that process through IIS (host name on port 80 or 443). Follow
[`plan/IIS_SETUP.md`](plan/IIS_SETUP.md). Do not point phones at a laptop IPv4 or at port 8080.

During development you can also run the UI with Vite (proxies `/api` to port 8080):

```powershell
cd web
pnpm install
pnpm dev                 # http://localhost:5173
```

If you skip `bun run build:web`, `/` still returns API JSON.

Runtime file (git-ignored): `jwt_secret.txt` (auto-generated; delete it to invalidate all logins).

Optional env vars: `DATABASE_URL` (or `DATABASE_HOST` / `PORT` / `NAME` / `USER` / `PASSWORD`),
`JWT_SECRET`, `JWT_TTL_HOURS` (default 12), `QR_HMAC_SECRET`, `WEB_DIST` (override React dist folder).

Reset the admin password: `bun run seed-admin -- admin newpassword`.

Tests: `bun test` (unit tests always; attendance engine tests need Postgres).

## 3. Run the app (phones or Windows)

```powershell
cd app
flutter pub get
flutter run            # or: flutter build apk --release
```

First launch asks for the **IIS host name** (`attendance.yourschool.edu` or
`https://attendance.yourschool.edu`) — use *Test connection* then *Save*. It can
be changed later from the ethernet icon on any screen.

Moderators who cannot use the camera can still type the student code (keyboard
icon on the scanner).

Camera scanning in a **browser over plain HTTP** may be blocked (browsers
require HTTPS except on localhost). Put a certificate on the IIS site, or type
the student code instead.

## 4. Workflow

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

## 5. API summary

Canonical REST prefix is **`/api`**. The same paths also work without `/api`
(for older app builds).

```
GET  /api  /api/health
POST /api/auth/login  {username,password} → {token, role, user}
GET  /api/auth/me
GET|POST        /api/admin/moderators          PUT|DELETE /api/admin/moderators/:id
GET|POST        /api/admin/students            PUT|DELETE /api/admin/students/:id     POST /api/admin/students/import
GET|POST        /api/admin/events              GET|PUT|DELETE /api/admin/events/:id
GET|POST        /api/admin/events/:id/session-windows        PUT|DELETE /api/admin/session-windows/:id
GET             /api/admin/attendance?event_id=&date=&student_id=&session_window_id=&status=&q=
PUT|DELETE      /api/admin/attendance/:id      GET /api/admin/attendance/export (CSV)
GET  /api/moderator/events/active
GET  /api/moderator/session-windows?event_id=&mode=auto|manual&override=Morning
POST /api/moderator/scan/preview  {event_id, student_id_code, session_window_id?}
POST /api/moderator/scan/confirm  {event_id, student_id, session_window_id, direction?}
POST /api/moderator/scan/cancel   {event_id, student_id, session_window_id}
GET  /api/moderator/scans/mine?event_id=&date=all&status=all
GET  /api/student/:code/qr        GET /api/student/:code/attendance
```

`/api/admin/*` requires a superadmin JWT, `/api/moderator/*` a moderator JWT
(`Authorization: Bearer <token>`); `/api/student/*` is unauthenticated (read-only).

## 6. Troubleshooting

* **Phone can't connect** — IIS site started? Bun listening on `127.0.0.1:8080`?
  Host name in DNS? Firewall allows 80/443 (not 8080)? App Server Settings uses
  that host name?
* **"No active session window right now"** — server time is outside all windows; pick a
  session manually or fix the windows in the event editor.
* **Camera black on Android** — grant camera permission; the app also has a
  "type code manually" fallback (keyboard icon on the scanner).
* **Forgot admin password** — `bun run seed-admin -- admin newpass`.
