# QR Event Attendance System — Cursor Build Plan

A Flutter mobile app + local (LAN-only) backend for scanning student QR codes and
recording dynamic Morning/Afternoon, IN/OUT attendance, with Superadmin / Moderator /
Student roles. Designed to run entirely on a local network (laptop as server, phones
connect to the same Wi-Fi router — no internet/cloud required).

Paste this whole file into Cursor as the project's `PLAN.md` and work through the
phases in order, checking items off as they're implemented.

---

## 1. High-Level Architecture

```
[Router / Local Wi-Fi Network]
        |
        |------ [Server laptop/PC] --- Dart Frog process serves the API on
        |             0.0.0.0:PORT (e.g. `dart_frog dev --port 8080`),
        |             backed by a single SQLite file via Drift.
        |             No separate DB service to run/manage.
        |             Reachable at 192.168.1.10:8080
        |
        |------ [Moderator phone(s)] --- Flutter app, connects to http://192.168.1.10:8080
        |------ [Superadmin phone/tablet] --- Flutter app (admin screens)
        |------ [Student phone(s)] --- optional, only to display their own QR code
```

- **No internet dependency.** Everything works as long as all devices are on the
  same router/subnet.
- **No database service to run.** SQLite is just a file (`attendance.db`) sitting
  next to the server code — nothing to start, stop, or configure a port for.
  Laragon isn't needed at all for this stack; if you still have it installed,
  it's purely optional (e.g. as a quick terminal launcher).
- The Flutter app has a one-time **"Server Settings"** screen where the user enters
  the server IP:Port (since there's no fixed domain on a LAN). Store it locally
  with `shared_preferences`.
- Backend and app are two separate folders in one repo: `/server` (a Dart Frog
  project, created with `dart_frog create server`) and `/app` (the Flutter
  project). Both are plain Dart/Flutter — one language, top to bottom.

### Recommended stack
| Layer | Choice | Why |
|---|---|---|
| Mobile app | Flutter (Dart) | Cross-platform, per requirement |
| State management | Riverpod (or Bloc if you prefer) | Testable, scales across 3 roles |
| QR scanning | `mobile_scanner` package | Actively maintained, fast |
| QR generation (student's own code) | `qr_flutter` | Simple, offline |
| HTTP client | `dio` | Interceptors for auth token, base URL config |
| Backend | **Dart Frog** | Stays in the Dart ecosystem, file-based routing |
| Database | **SQLite via Drift** | One file, no service to run, typed Dart queries, works identically whether accessed from the server or (if you ever add offline caching) the Flutter client itself |
| Auth | JWT via `dart_jsonwebtoken`, tokens stored in `flutter_secure_storage` on the client | Role-based route guarding via Dart Frog middleware |

### Why SQLite over Postgres for this project
- Single server laptop, single event running at a time, a handful of moderator
  devices — nowhere near the concurrency Postgres is built for.
- Zero setup: no service to install/start/monitor, no host/port/credentials.
- Trivial backup/reset: the whole database is one file you can copy or delete
  between events.
- SQLite in WAL mode comfortably handles bursts of scan writes from a few
  moderators at once, which is all this needs.
- If this ever grows into multi-event, multi-server, high-concurrency
  territory, Drift's query layer can be pointed at Postgres later with
  relatively little rewrite — but don't pay that complexity cost up front.

---

## 2. Roles & Permissions

| Action | Superadmin | Moderator | Student |
|---|---|---|---|
| Create/edit/delete moderator accounts | ✅ | ❌ | ❌ |
| Create/edit/delete student records | ✅ | ❌ | ❌ |
| Create/edit events & session time windows | ✅ | ❌ | ❌ |
| View / edit / delete attendance records | ✅ (full CRUD) | ❌ (view own scans only) | ❌ |
| Scan QR & confirm/cancel attendance | ❌ | ✅ | ❌ |
| Override "this scan = Morning/Afternoon" before scanning | ❌ | ✅ | ❌ |
| View own attendance history / show own QR | ❌ | ❌ | ✅ |

---

## 3. Data Model (Drift schema, Dart)

Define tables as Drift `Table` classes in `/server/lib/src/database/tables.dart`.
Drift generates typed queries, migrations, and DAOs from this — no hand-written
SQL needed, and no separate `.sql` migration files to keep in sync.

```dart
import 'package:drift/drift.dart';

// users: superadmin & moderator login accounts
class Users extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get name => text()();
  TextColumn get username => text().unique()();
  TextColumn get passwordHash => text()();
  TextColumn get role => text()(); // 'superadmin' | 'moderator' — validate in code
  DateTimeColumn get createdAt => dateTime().withDefault(currentDateAndTime)();
}

// students: the QR-code holders (not necessarily "users" who log in)
class Students extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get studentIdCode => text().unique()(); // the value encoded in the QR
  TextColumn get fullName => text()();
  TextColumn get section => text().nullable()();
  TextColumn get photoUrl => text().nullable()();
  DateTimeColumn get createdAt => dateTime().withDefault(currentDateAndTime)();
}

// events: one row per event this system is tracking
class Events extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get name => text()();
  DateTimeColumn get eventDate => dateTime()();
  BoolColumn get isActive => boolean().withDefault(const Constant(true))();
  IntColumn get createdBy => integer().references(Users, #id)();
}

// sessionWindows: admin-defined, dynamic, PER EVENT
// e.g. Morning 07:00–12:00, Afternoon 13:00–17:00
class SessionWindows extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get eventId => integer().references(Events, #id)();
  TextColumn get sessionLabel => text()(); // "Morning" / "Afternoon" (admin can rename/add more)
  TextColumn get startTime => text()(); // store as "HH:mm", compare as strings/minutes
  TextColumn get endTime => text()();
  IntColumn get sortOrder => integer()(); // which session comes first in the day
}

// attendanceLogs: the actual scan records
class AttendanceLogs extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get eventId => integer().references(Events, #id)();
  IntColumn get studentId => integer().references(Students, #id)();
  IntColumn get sessionWindowId => integer().references(SessionWindows, #id)();
  TextColumn get direction => text()(); // 'IN' | 'OUT' — auto-computed
  DateTimeColumn get scannedAt => dateTime().withDefault(currentDateAndTime)();
  IntColumn get scannedBy => integer().references(Users, #id)(); // moderator
  TextColumn get status => text()(); // 'confirmed' | 'cancelled'
  TextColumn get deviceNote => text().nullable()();
}
```

```dart
@DriftDatabase(tables: [Users, Students, Events, SessionWindows, AttendanceLogs])
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(NativeDatabase.createInBackground(File('attendance.db')));

  @override
  int get schemaVersion => 1;
}
```

Run `dart run build_runner build` after defining tables to generate
`app_database.g.dart`. The lookup the auto IN/OUT logic depends on
(`eventId + studentId + sessionWindowId`) doesn't need a manual index — SQLite
handles this table size trivially, but you can add one via a migration later
if you want (`CREATE INDEX ...` inside a Drift `MigrationStrategy`).

---

## 4. The Core Logic: Dynamic Morning/Afternoon + Auto IN/OUT

This is the heart of the app. Two independent things are being decided per scan:

**A) Which session window does this scan belong to?**
- Default: auto-detected from the **current server time** compared against the
  admin's configured `session_windows` for the active event.
- Override: the moderator can, *before scanning*, tap a toggle/segmented control
  ("Morning" / "Afternoon" / auto) — this is the "moderator can set that this
  attendance is for morning before scanning" requirement. If they don't touch it,
  it defaults to auto (based on time).

**B) Is this scan an IN or an OUT?**
Fully automatic — the moderator never chooses this. Algorithm run server-side
(so it's authoritative and can't be spoofed by two moderators scanning at once):

```
function determineDirection(event_id, student_id, session_window_id):
    # In Drift: (db.select(db.attendanceLogs)
    #   ..where((t) => t.eventId.equals(event_id))
    #   ..where((t) => t.studentId.equals(student_id))
    #   ..where((t) => t.sessionWindowId.equals(session_window_id))
    #   ..where((t) => t.status.equals('confirmed'))
    #   ..orderBy([(t) => OrderingTerm(expression: t.scannedAt)])
    # ).get()
    existing = SELECT * FROM attendance_logs
               WHERE event_id = event_id
                 AND student_id = student_id
                 AND session_window_id = session_window_id
                 AND status = 'confirmed'
               ORDER BY scanned_at ASC

    if existing is empty:
        return 'IN'
    elif existing has exactly one row and that row.direction == 'IN':
        return 'OUT'
    else:
        # already has both IN and OUT for this session
        return 'ALREADY_COMPLETE'  -- surface as an error/info to moderator,
                                    -- e.g. "Already timed IN & OUT for Morning"
```

- This means: 1st scan in a session = IN. 2nd scan in the *same* session = OUT.
  A 3rd scan is rejected with a clear message (moderator can view the student's
  log and, if it's superadmin, edit/delete a bad record).
- Because direction is derived, **cancelling a scan must not count** — only rows
  with `status = 'confirmed'` are considered, so a mis-scan that the moderator
  cancels doesn't lock in a wrong IN/OUT state.
- Confirm/Cancel flow: scanning just *previews* the result (shows student photo,
  name, computed session + direction) and only writes to `attendance_logs` with
  `status='confirmed'` when the moderator taps Confirm. Cancel discards it — no
  DB row at all (or writes `status='cancelled'` if you want an audit trail; recommended).

### Edge cases to design for
- Student scans **after the last session window of the day has closed** → show
  "No active session window right now" and let the moderator either pick a
  session manually or block the scan (admin-configurable).
- Overlapping windows (bad admin config) → validate on save in the admin UI,
  reject overlapping `start_time`/`end_time` for the same event.
- Clock drift between phone and server → always compute direction using the
  **server's** clock, never the phone's.

---

## 5. Backend API (Dart Frog file-based routes, REST/JSON)

Dart Frog maps folder structure directly to routes, e.g. `routes/auth/login.dart`
handles `POST /auth/login`, `routes/moderator/scan/preview.dart` handles
`POST /moderator/scan/preview`, etc. Dynamic segments use `[id].dart` (e.g.
`routes/admin/students/[id].dart` for `PUT`/`DELETE /admin/students/:id`).

```
POST   /auth/login                       {username, password} -> {token, role}
                                          # sign JWT with dart_jsonwebtoken

# Superadmin
GET    /admin/moderators
POST   /admin/moderators
PUT    /admin/moderators/:id
DELETE /admin/moderators/:id

GET    /admin/students
POST   /admin/students                   (also generates/returns QR payload)
PUT    /admin/students/:id
DELETE /admin/students/:id
POST   /admin/students/import            (bulk CSV import — recommended)

GET    /admin/events
POST   /admin/events
PUT    /admin/events/:id
DELETE /admin/events/:id

GET    /admin/events/:id/session-windows
POST   /admin/events/:id/session-windows       {label, start_time, end_time}
PUT    /admin/session-windows/:id
DELETE /admin/session-windows/:id

GET    /admin/attendance?event_id=&date=&student_id=
PUT    /admin/attendance/:id             (manual correction)
DELETE /admin/attendance/:id

# Moderator
GET    /moderator/events/active                        # today's active event(s)
GET    /moderator/session-windows?event_id=&mode=auto|manual&override=Morning
POST   /moderator/scan/preview           {event_id, student_id_code, session_window_id?}
                                          -> {student, computed_session, computed_direction}
POST   /moderator/scan/confirm           {event_id, student_id, session_window_id, direction}
POST   /moderator/scan/cancel            {preview_id}   # optional, if you log previews

# Student (optional, read-only)
GET    /student/:student_id_code/qr
GET    /student/:student_id_code/attendance?event_id=
```

Auth: JWT in `Authorization: Bearer <token>`, verified and role-checked in a
Dart Frog `middleware.dart` file (one per route group — e.g.
`routes/admin/_middleware.dart` requires `role == superadmin`,
`routes/moderator/_middleware.dart` requires `role == moderator`).

---

## 6. Flutter App Structure

```
lib/
  main.dart
  core/
    api/dio_client.dart
    api/api_endpoints.dart
    config/server_settings.dart        # stores/edits LAN IP:port
    auth/auth_state.dart               # Riverpod provider: role, token
    theme/app_theme.dart
  models/
    user_model.dart
    student_model.dart
    event_model.dart
    session_window_model.dart
    attendance_log_model.dart
  features/
    auth/
      login_screen.dart
      server_config_screen.dart
    superadmin/
      dashboard_screen.dart
      moderators/  (list, add, edit)
      students/    (list, add, edit, bulk import, qr preview)
      events/      (list, add/edit, session window editor)
      attendance/  (searchable/filterable table, edit, delete)
    moderator/
      dashboard_screen.dart
      session_override_widget.dart     # Morning / Afternoon / Auto toggle
      scanner_screen.dart              # camera + mobile_scanner
      scan_result_dialog.dart          # shows student + computed IN/OUT + Confirm/Cancel
      my_scans_history_screen.dart
    student/
      my_qr_screen.dart
      my_attendance_screen.dart
  widgets/
    role_gate.dart                     # redirect based on role
    loading_indicator.dart
    error_banner.dart
```

### Key UX detail for the moderator scan flow
1. Moderator opens Scanner screen. A segmented control at the top reads
   **[Auto | Morning | Afternoon]**, defaulting to Auto.
2. Moderator scans a QR → app calls `/moderator/scan/preview` with the student
   code + whichever session mode is selected.
3. A modal/bottom sheet appears: student photo/name + **"Morning — IN"** (or
   whatever was computed) + two big buttons: **Confirm** / **Cancel**.
4. Confirm → POST to `/moderator/scan/confirm`, show success toast, auto-return
   to scanning (keep camera warm for the next student).
5. Cancel → dismiss, nothing written, camera resumes immediately.

---

## 7. QR Code Content & Security

- QR payload = just the student's unique `student_id_code` (e.g. `STU-2026-0143`),
  optionally wrapped in a small signed JSON to prevent trivial forgery:
  `{"sid":"STU-2026-0143","sig":"<HMAC>"}` — HMAC signed server-side at
  generation time with a secret only the server knows; the app doesn't need to
  verify it locally, the server does on `/scan/preview`.
- Keep QR payload small — a plain string is fine for a LAN-only, low-stakes
  event context; add the HMAC only if you're worried about students printing
  fake/duplicate QR codes.

---

## 8. Build Phases (work through in Cursor)

### Phase 0 — Project scaffolding
- [ ] Install Dart Frog CLI (`dart pub global activate dart_frog_cli`), then
      `dart_frog create server` for the backend
- [ ] Add `drift`, `sqlite3`, and `dart_jsonwebtoken` to `/server/pubspec.yaml`
      (plus `drift_dev` and `build_runner` as dev dependencies)
- [ ] Define tables (Section 3), run `dart run build_runner build` to generate
      the Drift database code
- [ ] Confirm `attendance.db` gets created on first run and note the machine's
      LAN IP (`ipconfig`) for phones to use
- [ ] Init `/app` (Flutter) in the same repo
- [ ] Flutter: add packages (`dio`, `mobile_scanner`, `qr_flutter`, `riverpod`,
      `shared_preferences`, `flutter_secure_storage`)
- [ ] Server Settings screen (enter LAN IP:port, persisted locally)

### Phase 1 — Auth & roles
- [ ] Seed one superadmin row into `users` (one-off Dart script, hash the
      password first)
- [ ] `routes/auth/login.dart`: verify password hash, issue JWT with `dart_jsonwebtoken`
- [ ] Flutter login screen + token storage + role-based routing (`role_gate.dart`)

### Phase 2 — Superadmin: people & events
- [ ] CRUD for moderators
- [ ] CRUD for students (+ QR generation)
- [ ] CRUD for events
- [ ] Session window editor per event (label, start/end time, overlap validation)

### Phase 3 — Core attendance engine (backend)
- [ ] Implement `determineDirection()` logic (Section 4) as a plain Dart function/
      class (e.g. `lib/src/attendance_service.dart`) — keep it out of the route
      handler so it's unit-testable in isolation
- [ ] `routes/moderator/scan/preview.dart` (no DB write)
- [ ] `routes/moderator/scan/confirm.dart` (writes confirmed row)
- [ ] `routes/moderator/scan/cancel.dart` (optional audit row)
- [ ] Dart tests (`dart test`) for the attendance service: first scan = IN,
      second scan same session = OUT, third = rejected, cancelled scans don't
      affect the count

### Phase 4 — Moderator app flow
- [ ] Scanner screen with `mobile_scanner`
- [ ] Session override segmented control (Auto/Morning/Afternoon)
- [ ] Scan result dialog with Confirm/Cancel
- [ ] "My scans today" history list

### Phase 5 — Superadmin attendance management
- [ ] Attendance table screen: filter by event/date/student
- [ ] Manual edit (fix wrong direction/session) and delete
- [ ] Export to CSV (nice-to-have)

### Phase 6 — Student view (optional)
- [ ] "My QR" screen (generated from their `student_id_code`)
- [ ] "My attendance" read-only history

### Phase 7 — Polish & LAN hardening
- [ ] Handle server-unreachable gracefully (retry banner, don't crash scanner)
- [ ] Handle multiple moderators scanning concurrently (rely on server as source
      of truth, not local state; SQLite WAL mode handles concurrent writes fine
      at this scale)
- [ ] App icon, splash, basic theming
- [ ] Back up the `attendance.db` file after each event (it's just one file —
      copy it somewhere safe)
- [ ] See the separate `BACKEND_SETUP.md` for exact local run instructions

---

## 9. Open Questions to Settle Before/While Building (answer these in Cursor's chat as you go)
- Should "Cancel" leave an audit trail row, or just discard silently?
- What happens if a student's 3rd scan attempt occurs (already IN+OUT) — hard
  block, or let superadmin/moderator force an extra entry?
- Do you want offline queueing on the moderator's phone (e.g. `sqflite`/`hive`
  to cache a scan if Wi-Fi briefly drops, syncing later) or is "always
  connected to the local router" a safe assumption for your event?
- One event at a time, or should the moderator pick from multiple active events?
