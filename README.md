# SSC QR Attendance

LAN-only QR event attendance: an **Express + TypeScript + PostgreSQL** REST API (runs on a
laptop) and a **Flutter** app — phones (Android/iOS APK) **or any browser** (same
superadmin / moderator / student UI). No internet or cloud required — every
device just joins the same Wi-Fi router.

```
/server   Express + TypeScript REST API + PostgreSQL + Flutter web
/app      Flutter app (Android / iOS / web; Windows for admin screens)
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
# optional: $env:DATABASE_URL = 'postgres://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/aclc'
```

2. Create the database + seed the admin:

```powershell
npm install
npm run ensure-db      # CREATE DATABASE aclc if missing
npm run seed-admin     # admin / changeme123
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

## 2. Run the server (laptop)

```powershell
cd server
npm install
npm run build:web        # Flutter web UI (once, or after app changes)
npm run dev              # tsx watch, port 8080 (or PORT env)
```

For events, run without the file watcher:

```powershell
npm start                # PORT env var overrides 8080
```

Then:

1. `ipconfig` → note the Wi-Fi adapter's **IPv4 address** (e.g. `192.168.1.10`).
2. Allow inbound TCP **8080** in Windows Firewall (Advanced settings → Inbound Rules → New Rule → Port).
3. Open **`http://192.168.1.10:8080/`** on a laptop or phone browser — that is the
   Flutter app (Staff login or Student code). REST JSON is at `/api`.
   Swagger UI (laptop): `http://localhost:8080/docs`.

If you skip `npm run build:web`, `/` still returns API JSON and phones must use the APK.

Runtime file (git-ignored): `jwt_secret.txt` (auto-generated; delete it to invalidate all logins).

Optional env vars: `DATABASE_URL` (or `DATABASE_HOST` / `PORT` / `NAME` / `USER` / `PASSWORD`),
`JWT_SECRET`, `JWT_TTL_HOURS` (default 12), `QR_HMAC_SECRET`, `WEB_DIST` (override Flutter web folder).

Reset the admin password: `npm run seed-admin -- admin newpassword`.

Tests: `npm test` (unit tests always; attendance engine tests need Postgres).

## 3. Run the app (phones or Chrome)

**Browser (recommended for superadmin on the laptop, and for students):** after
`npm run build:web` and `npm start`, open `http://YOUR_LAN_IP:8080/` — same
origin, no server-address screen.

**APK / `flutter run` (phones):**

```powershell
cd app
flutter pub get
flutter run            # or: flutter build apk --release
flutter run -d chrome  # Flutter web against the API at localhost:8080
```

First launch on a native build asks for the **server address** (`192.168.1.10:8080`) —
use *Test connection* then *Save*. It can be changed later from the ethernet icon
on any screen.

Camera scanning in a **phone/laptop browser over `http://192.168.x.x`** may be
blocked (browsers require HTTPS except on localhost). Moderators can still type
the student code, or use the Android APK for the camera.

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
(`Authorization: Bearer <token>`); `/api/student/*` is unauthenticated (LAN only, read-only).

## 6. Troubleshooting

* **Phone can't connect** — same Wi-Fi (not guest network / mobile data)? Server running?
  Firewall rule for 8080? IP still the same (set a DHCP reservation for the laptop)?
* **"No active session window right now"** — server time is outside all windows; pick a
  session manually or fix the windows in the event editor.
* **Camera black on Android** — grant camera permission; the app also has a
  "type code manually" fallback (keyboard icon on the scanner).
* **Forgot admin password** — `npm run seed-admin -- admin newpass`.
