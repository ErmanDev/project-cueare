import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:drift/drift.dart';

import '../database/database.dart';
import '../database/timestamp.dart';
import '../utils/http_utils.dart';
import '../utils/student_code.dart';
import '../utils/time_utils.dart';

abstract class Direction {
  static const in_ = 'IN';
  static const out = 'OUT';
  static const alreadyComplete = 'ALREADY_COMPLETE';
}

abstract class ScanStatus {
  static const confirmed = 'confirmed';
  static const cancelled = 'cancelled';
}

/// Result of [AttendanceService.determineDirection].
class DirectionResult {
  const DirectionResult(this.direction, this.existing);

  /// 'IN', 'OUT' or 'ALREADY_COMPLETE'.
  final String direction;

  /// Confirmed rows already present for (event, student, window).
  final List<AttendanceLog> existing;

  bool get canScan => direction != Direction.alreadyComplete;
}

/// What the moderator sees before confirming.
class ScanPreview {
  const ScanPreview({
    required this.student,
    required this.event,
    required this.window,
    required this.direction,
    required this.serverTime,
    required this.sessionMode,
    required this.existing,
  });

  final Student student;
  final Event event;
  final SessionWindow window;
  final DirectionResult direction;
  final DateTime serverTime;

  /// 'auto' | 'manual'
  final String sessionMode;
  final List<AttendanceLog> existing;

  Map<String, dynamic> toApi() => {
    'student': {
      'id': student.id,
      'student_id_code': student.studentIdCode,
      'full_name': student.fullName,
      'section': student.section,
      'photo_url': student.photoUrl,
    },
    'event': {'id': event.id, 'name': event.name},
    'computed_session': {
      'id': window.id,
      'session_label': window.sessionLabel,
      'start_time': window.startTime,
      'end_time': window.endTime,
      'mode': sessionMode,
    },
    'computed_direction': direction.direction,
    'can_confirm': direction.canScan,
    'server_time': serverTime.toIso8601String(),
    'existing_scans': existing
        .map(
          (e) => {
            'direction': e.direction,
            'scanned_at': e.scannedAt.dateTime.toIso8601String(),
          },
        )
        .toList(),
  };
}

/// Pure business logic for scans. Kept out of the route handlers so it can be
/// unit-tested against an in-memory database.
class AttendanceService {
  AttendanceService(
    this.db, {
    DateTime Function()? clock,
    this.qrHmacSecret,
  }) : _clock = clock ?? DateTime.now;

  final AppDatabase db;
  final DateTime Function() _clock;

  /// If set, QR payloads may be signed JSON `{"sid": ..., "sig": ...}`.
  final String? qrHmacSecret;

  DateTime now() => _clock();

  // ---------------------------------------------------------------------------
  // QR payloads
  // ---------------------------------------------------------------------------

  /// Builds the QR payload for a student. Plain code unless HMAC is enabled.
  String qrPayloadFor(Student student) {
    final secret = qrHmacSecret;
    if (secret == null) return student.studentIdCode;
    return jsonEncode({
      'sid': student.studentIdCode,
      'sig': _sign(student.studentIdCode, secret),
    });
  }

  /// Extracts the student code from a scanned payload. Accepts both the plain
  /// code and the signed JSON form. Throws 400 if the signature is required
  /// but missing/invalid, or if the payload/code fails safety checks.
  String studentCodeFromPayload(String raw) {
    StudentCode.requirePayloadSize(raw);
    final trimmed = raw.trim();

    if (trimmed.startsWith('{')) {
      Map<String, dynamic> obj;
      try {
        obj = jsonDecode(trimmed) as Map<String, dynamic>;
      } catch (_) {
        throw badRequest('Unrecognised QR payload');
      }
      final sid = obj['sid'];
      if (sid is! String || sid.isEmpty) {
        throw badRequest('QR payload missing "sid"');
      }
      final code = StudentCode.requireValid(sid, field: 'sid');
      final secret = qrHmacSecret;
      if (secret != null) {
        final sig = obj['sig'];
        if (sig is! String || sig != _sign(code, secret)) {
          throw badRequest('QR signature invalid');
        }
      }
      // Ignore any other JSON keys — never pass them to SQL.
      return code;
    }

    if (qrHmacSecret != null) {
      throw badRequest('QR payload is not signed');
    }
    return StudentCode.requireValid(trimmed);
  }

  String _sign(String value, String secret) =>
      Hmac(sha256, utf8.encode(secret)).convert(utf8.encode(value)).toString();

  // ---------------------------------------------------------------------------
  // Session window resolution
  // ---------------------------------------------------------------------------

  Future<List<SessionWindow>> windowsForEvent(int eventId) {
    return (db.select(db.sessionWindows)
          ..where((w) => w.eventId.equals(eventId))
          ..orderBy([(w) => OrderingTerm.asc(w.sortOrder)]))
        .get();
  }

  /// Picks the window whose [start,end) range contains the server's current
  /// time-of-day, or `null` if none does.
  Future<SessionWindow?> autoDetectWindow(int eventId, {DateTime? at}) async {
    final windows = await windowsForEvent(eventId);
    return pickWindowForTime(windows, at ?? now());
  }

  /// Pure helper (no DB) used by [autoDetectWindow] and tests.
  static SessionWindow? pickWindowForTime(
    List<SessionWindow> windows,
    DateTime at,
  ) {
    final minutes = TimeUtils.minutesOfDay(at);
    for (final w in windows) {
      final start = TimeUtils.parseMinutes(w.startTime);
      final end = TimeUtils.parseMinutes(w.endTime);
      if (start == null || end == null) continue;
      if (minutes >= start && minutes < end) return w;
    }
    return null;
  }

  /// Resolves the session window for a scan.
  ///
  /// * If [overrideWindowId] is given (moderator chose Morning/Afternoon
  ///   explicitly), that window is used — mode = 'manual'.
  /// * Otherwise, auto-detect from server time — mode = 'auto'.
  Future<(SessionWindow, String)> resolveWindow({
    required int eventId,
    int? overrideWindowId,
  }) async {
    if (overrideWindowId != null) {
      final w = await (db.select(
        db.sessionWindows,
      )..where((t) => t.id.equals(overrideWindowId))).getSingleOrNull();
      if (w == null || w.eventId != eventId) {
        throw notFound('Session window not found for this event');
      }
      return (w, 'manual');
    }
    final w = await autoDetectWindow(eventId);
    if (w == null) {
      final windows = await windowsForEvent(eventId);
      throw ApiException(
        422,
        windows.isEmpty
            ? 'This event has no session windows configured'
            : 'No active session window right now — pick a session manually',
        details: {
          'code': 'NO_ACTIVE_WINDOW',
          'server_time': now().toIso8601String(),
          'available_windows': windows
              .map(
                (w) => {
                  'id': w.id,
                  'session_label': w.sessionLabel,
                  'start_time': w.startTime,
                  'end_time': w.endTime,
                },
              )
              .toList(),
        },
      );
    }
    return (w, 'auto');
  }

  /// Ensures scans are only accepted on the event day and while the chosen
  /// session window is open (`start_time` ≤ now < `end_time`).
  void ensureSessionAcceptingScans({
    required Event event,
    required SessionWindow window,
    DateTime? at,
  }) {
    final t = at ?? now();
    final eventDay = event.eventDate.dateTime;
    if (!TimeUtils.isSameDay(t, eventDay)) {
      final y = eventDay.year.toString().padLeft(4, '0');
      final m = eventDay.month.toString().padLeft(2, '0');
      final d = eventDay.day.toString().padLeft(2, '0');
      throw conflict(
        'Scanning for "${event.name}" is only allowed on $y-$m-$d',
        details: {
          'code': 'EVENT_NOT_TODAY',
          'event_date': eventDay.toIso8601String(),
          'server_time': t.toIso8601String(),
        },
      );
    }

    final start = TimeUtils.parseMinutes(window.startTime);
    final end = TimeUtils.parseMinutes(window.endTime);
    if (start == null || end == null) {
      throw badRequest('Session window has invalid start_time/end_time');
    }
    final minutes = TimeUtils.minutesOfDay(t);
    if (minutes < start) {
      throw conflict(
        'Session "${window.sessionLabel}" has not started yet '
        '(starts at ${window.startTime})',
        details: {
          'code': 'SESSION_NOT_STARTED',
          'session_label': window.sessionLabel,
          'start_time': window.startTime,
          'end_time': window.endTime,
          'server_time': t.toIso8601String(),
        },
      );
    }
    if (minutes >= end) {
      throw conflict(
        'Session "${window.sessionLabel}" has already ended '
        '(ended at ${window.endTime})',
        details: {
          'code': 'SESSION_ENDED',
          'session_label': window.sessionLabel,
          'start_time': window.startTime,
          'end_time': window.endTime,
          'server_time': t.toIso8601String(),
        },
      );
    }
  }

  // ---------------------------------------------------------------------------
  // IN / OUT determination
  // ---------------------------------------------------------------------------

  Future<List<AttendanceLog>> confirmedLogs({
    required int eventId,
    required int studentId,
    required int sessionWindowId,
  }) {
    return (db.select(db.attendanceLogs)
          ..where((t) => t.eventId.equals(eventId))
          ..where((t) => t.studentId.equals(studentId))
          ..where((t) => t.sessionWindowId.equals(sessionWindowId))
          ..where((t) => t.status.equals(ScanStatus.confirmed))
          ..orderBy([(t) => OrderingTerm.asc(t.scannedAt)]))
        .get();
  }

  /// 1st confirmed scan in a session = IN, 2nd = OUT, 3rd+ = rejected.
  /// Cancelled rows are ignored.
  Future<DirectionResult> determineDirection({
    required int eventId,
    required int studentId,
    required int sessionWindowId,
  }) async {
    final existing = await confirmedLogs(
      eventId: eventId,
      studentId: studentId,
      sessionWindowId: sessionWindowId,
    );
    return DirectionResult(computeDirection(existing), existing);
  }

  /// Pure function version of the algorithm, for tests / reuse.
  static String computeDirection(List<AttendanceLog> confirmedExisting) {
    if (confirmedExisting.isEmpty) return Direction.in_;
    if (confirmedExisting.length == 1 &&
        confirmedExisting.first.direction == Direction.in_) {
      return Direction.out;
    }
    return Direction.alreadyComplete;
  }

  // ---------------------------------------------------------------------------
  // Scan flow
  // ---------------------------------------------------------------------------

  Future<Student> _studentByCode(String code) async {
    final student = await (db.select(
      db.students,
    )..where((s) => s.studentIdCode.equals(code))).getSingleOrNull();
    if (student == null) {
      throw notFound('No student found for code "$code"');
    }
    return student;
  }

  Future<Event> _eventById(int id) async {
    final event = await (db.select(
      db.events,
    )..where((e) => e.id.equals(id))).getSingleOrNull();
    if (event == null) throw notFound('Event not found');
    return event;
  }

  /// Rejects calendar dates before today (used when creating/updating events).
  void requireEventDateNotPast(DateTime date) {
    if (TimeUtils.isPastDate(date, relativeTo: now())) {
      throw badRequest(
        'event_date cannot be in the past',
        details: {
          'code': 'PAST_EVENT_DATE',
          'event_date': date.toIso8601String(),
          'server_time': now().toIso8601String(),
        },
      );
    }
  }

  /// Past event dates are invalid automatically: deactivate + reject scans.
  Future<Event> ensureEventUsable(Event event) async {
    if (TimeUtils.isPastDate(event.eventDate.dateTime, relativeTo: now())) {
      if (event.isActive) {
        await (db.update(db.events)..where((e) => e.id.equals(event.id))).write(
          EventsCompanion(
            isActive: const Value(false),
            updatedAt: Value(pgNow()),
          ),
        );
      }
      throw conflict(
        'Event "${event.name}" date has passed and is no longer valid',
        details: {
          'code': 'EVENT_DATE_PASSED',
          'event_date': event.eventDate.dateTime.toIso8601String(),
          'server_time': now().toIso8601String(),
        },
      );
    }
    if (!event.isActive) {
      throw conflict('Event "${event.name}" is not active');
    }
    return event;
  }

  /// Deactivates any still-active events whose date is already past.
  Future<int> deactivateExpiredEvents() async {
    final active = await (db.select(
      db.events,
    )..where((e) => e.isActive.equals(true))).get();
    var count = 0;
    for (final event in active) {
      if (!TimeUtils.isPastDate(event.eventDate.dateTime, relativeTo: now())) {
        continue;
      }
      await (db.update(db.events)..where((e) => e.id.equals(event.id))).write(
        EventsCompanion(
          isActive: const Value(false),
          updatedAt: Value(pgNow()),
        ),
      );
      count++;
    }
    return count;
  }

  /// Read-only: computes what would be recorded. No DB writes.
  Future<ScanPreview> preview({
    required int eventId,
    required String qrPayload,
    int? sessionWindowId,
  }) async {
    final event = await _eventById(eventId);
    await ensureEventUsable(event);
    final code = studentCodeFromPayload(qrPayload);
    final student = await _studentByCode(code);
    final (window, mode) = await resolveWindow(
      eventId: eventId,
      overrideWindowId: sessionWindowId,
    );
    ensureSessionAcceptingScans(event: event, window: window);
    final direction = await determineDirection(
      eventId: eventId,
      studentId: student.id,
      sessionWindowId: window.id,
    );
    return ScanPreview(
      student: student,
      event: event,
      window: window,
      direction: direction,
      serverTime: now(),
      sessionMode: mode,
      existing: direction.existing,
    );
  }

  /// Writes a confirmed row. The direction is re-derived inside a transaction
  /// so two moderators scanning the same student at once can't both write IN.
  /// If [expectedDirection] is supplied and no longer matches, throws 409.
  Future<AttendanceLog> confirm({
    required int eventId,
    required int studentId,
    required int sessionWindowId,
    required int scannedBy,
    String? expectedDirection,
    String? deviceNote,
  }) async {
    final note = _sanitizeDeviceNote(deviceNote);
    return db.transaction(() async {
      final event = await _eventById(eventId);
      await ensureEventUsable(event);
      final window = await (db.select(
        db.sessionWindows,
      )..where((w) => w.id.equals(sessionWindowId))).getSingleOrNull();
      if (window == null || window.eventId != eventId) {
        throw notFound('Session window not found for this event');
      }
      ensureSessionAcceptingScans(event: event, window: window);
      final student = await (db.select(
        db.students,
      )..where((s) => s.id.equals(studentId))).getSingleOrNull();
      if (student == null) throw notFound('Student not found');

      final result = await determineDirection(
        eventId: eventId,
        studentId: studentId,
        sessionWindowId: sessionWindowId,
      );
      if (!result.canScan) {
        throw conflict(
          'Already timed IN & OUT for ${window.sessionLabel}',
          details: {'code': 'ALREADY_COMPLETE'},
        );
      }
      if (expectedDirection != null && expectedDirection != result.direction) {
        throw conflict(
          'Attendance state changed — now would be ${result.direction}. '
          'Please re-scan.',
          details: {
            'code': 'DIRECTION_CHANGED',
            'computed_direction': result.direction,
          },
        );
      }

      final id = await db
          .into(db.attendanceLogs)
          .insert(
            AttendanceLogsCompanion.insert(
              eventId: eventId,
              studentId: studentId,
              sessionWindowId: sessionWindowId,
              direction: result.direction,
              scannedAt: Value(pgDateTime(now())),
              scannedBy: scannedBy,
              status: ScanStatus.confirmed,
              deviceNote: Value(note),
            ),
          );
      return (db.select(
        db.attendanceLogs,
      )..where((t) => t.id.equals(id))).getSingle();
    });
  }

  /// Writes a `cancelled` audit row (does not affect IN/OUT computation).
  Future<AttendanceLog> cancel({
    required int eventId,
    required int studentId,
    required int sessionWindowId,
    required int scannedBy,
    String? direction,
    String? deviceNote,
  }) async {
    final note = _sanitizeDeviceNote(deviceNote);
    final event = await _eventById(eventId);
    await ensureEventUsable(event);
    final window = await (db.select(
      db.sessionWindows,
    )..where((w) => w.id.equals(sessionWindowId))).getSingleOrNull();
    if (window == null || window.eventId != eventId) {
      throw notFound('Session window not found for this event');
    }
    ensureSessionAcceptingScans(event: event, window: window);

    final id = await db
        .into(db.attendanceLogs)
        .insert(
          AttendanceLogsCompanion.insert(
            eventId: eventId,
            studentId: studentId,
            sessionWindowId: sessionWindowId,
            direction: direction ?? Direction.in_,
            scannedAt: Value(pgDateTime(now())),
            scannedBy: scannedBy,
            status: ScanStatus.cancelled,
            deviceNote: Value(note),
          ),
        );
    return (db.select(
      db.attendanceLogs,
    )..where((t) => t.id.equals(id))).getSingle();
  }

  static const _maxDeviceNoteLength = 200;

  /// Truncates / strips control chars — values are still bound as parameters.
  static String? _sanitizeDeviceNote(String? raw) {
    if (raw == null) return null;
    final cleaned = raw.replaceAll(RegExp(r'[\x00-\x1F\x7F]'), ' ').trim();
    if (cleaned.isEmpty) return null;
    return cleaned.length <= _maxDeviceNoteLength
        ? cleaned
        : cleaned.substring(0, _maxDeviceNoteLength);
  }

  // ---------------------------------------------------------------------------
  // Session window validation (admin)
  // ---------------------------------------------------------------------------

  /// Validates a window's times and ensures it doesn't overlap another window
  /// on the same event. [excludeId] is the window being edited.
  Future<void> validateWindow({
    required int eventId,
    required String startTime,
    required String endTime,
    int? excludeId,
  }) async {
    final start = TimeUtils.parseMinutes(startTime);
    final end = TimeUtils.parseMinutes(endTime);
    if (start == null || end == null) {
      throw badRequest('start_time and end_time must be "HH:mm"');
    }
    if (start >= end) {
      throw badRequest('start_time must be before end_time');
    }
    final others = await windowsForEvent(eventId);
    for (final o in others) {
      if (o.id == excludeId) continue;
      final os = TimeUtils.parseMinutes(o.startTime);
      final oe = TimeUtils.parseMinutes(o.endTime);
      if (os == null || oe == null) continue;
      if (TimeUtils.overlaps(start, end, os, oe)) {
        throw conflict(
          'Overlaps existing session "${o.sessionLabel}" '
          '(${o.startTime}–${o.endTime})',
          details: {'code': 'WINDOW_OVERLAP', 'conflicting_window_id': o.id},
        );
      }
    }
  }
}
