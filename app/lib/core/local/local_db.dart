import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../models/attendance_log_model.dart';
import '../../models/event_model.dart';
import '../../models/scan_preview_model.dart';
import '../../models/session_window_model.dart';
import '../../models/student_model.dart';
import '../../models/user_model.dart';
import '../api/api_client.dart';

const _prefsKey = 'ssc_local_db_v1';

String ymd(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

DateTime dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

int minutesOf(String hhmm) {
  final parts = hhmm.split(':');
  final h = int.tryParse(parts[0]) ?? 0;
  final m = parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0;
  return h * 60 + m;
}

bool sameDay(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

class _Staff {
  _Staff({required this.user, required this.password});
  UserModel user;
  String password;
}

/// On-device attendance database. Replaces the HTTP API.
class LocalDb {
  LocalDb._(this._prefs);

  final SharedPreferences _prefs;

  final List<_Staff> _staff = [];
  final List<StudentModel> _students = [];
  final List<EventModel> _events = [];
  final List<AttendanceLogModel> _logs = [];

  int _nextUserId = 1;
  int _nextStudentId = 1;
  int _nextEventId = 1;
  int _nextWindowId = 1;
  int _nextLogId = 1;
  int? actorUserId;

  static Future<LocalDb> open({SharedPreferences? prefs}) async {
    final db = LocalDb._(prefs ?? await SharedPreferences.getInstance());
    await db._load();
    return db;
  }

  Future<void> _load() async {
    final raw = _prefs.getString(_prefsKey);
    if (raw == null || raw.isEmpty) {
      _seed();
      await persist();
      return;
    }
    try {
      _read(jsonDecode(raw) as Map<String, dynamic>);
      if (_staff.isEmpty) {
        _seed();
        await persist();
      }
    } catch (_) {
      _seed();
      await persist();
    }
  }

  void _seed() {
    _staff
      ..clear()
      ..add(
        _Staff(
          user: UserModel(
            id: 1,
            name: 'Super Admin',
            username: 'admin',
            role: UserRole.superadmin,
            createdAt: DateTime.now(),
          ),
          password: 'changeme123',
        ),
      )
      ..add(
        _Staff(
          user: UserModel(
            id: 2,
            name: 'Scanner',
            username: 'moderator',
            role: UserRole.moderator,
            createdAt: DateTime.now(),
          ),
          password: 'changeme123',
        ),
      );
    _students
      ..clear()
      ..addAll([
        StudentModel(
          id: 1,
          studentIdCode: 'STU-2026-0001',
          fullName: 'Juan Dela Cruz',
          section: 'BSIT-3A',
          createdAt: DateTime.now(),
        ),
        StudentModel(
          id: 2,
          studentIdCode: 'STU-2026-0002',
          fullName: 'Maria Santos',
          section: 'BSBA-2B',
          createdAt: DateTime.now(),
        ),
      ]);
    final today = dateOnly(DateTime.now());
    _events
      ..clear()
      ..add(
        EventModel(
          id: 1,
          name: 'General Assembly',
          eventDate: today,
          isActive: true,
          createdBy: 1,
          sessionWindows: [
            SessionWindowModel(
              id: 1,
              eventId: 1,
              sessionLabel: 'Morning',
              startTime: '07:00',
              endTime: '12:00',
              sortOrder: 0,
            ),
            SessionWindowModel(
              id: 2,
              eventId: 1,
              sessionLabel: 'Afternoon',
              startTime: '13:00',
              endTime: '17:00',
              sortOrder: 1,
            ),
          ],
        ),
      );
    _logs.clear();
    _nextUserId = 3;
    _nextStudentId = 3;
    _nextEventId = 2;
    _nextWindowId = 3;
    _nextLogId = 1;
  }

  Future<void> persist() async {
    await _prefs.setString(_prefsKey, jsonEncode(_toJson()));
  }

  Map<String, dynamic> _toJson() => {
    'next_user_id': _nextUserId,
    'next_student_id': _nextStudentId,
    'next_event_id': _nextEventId,
    'next_window_id': _nextWindowId,
    'next_log_id': _nextLogId,
    'staff': [
      for (final s in _staff)
        {
          'id': s.user.id,
          'name': s.user.name,
          'username': s.user.username,
          'role': s.user.role.name,
          'password': s.password,
          'created_at': s.user.createdAt?.toIso8601String(),
        },
    ],
    'students': [
      for (final s in _students)
        {
          'id': s.id,
          'student_id_code': s.studentIdCode,
          'full_name': s.fullName,
          'section': s.section,
          'photo_url': s.photoUrl,
          'created_at': s.createdAt?.toIso8601String(),
        },
    ],
    'events': [
      for (final e in _events)
        {
          'id': e.id,
          'name': e.name,
          'event_date': ymd(e.eventDate),
          'is_active': e.isActive,
          'created_by': e.createdBy,
          'session_windows': [
            for (final w in e.sessionWindows)
              {
                'id': w.id,
                'event_id': w.eventId,
                'session_label': w.sessionLabel,
                'start_time': w.startTime,
                'end_time': w.endTime,
                'sort_order': w.sortOrder,
              },
          ],
        },
    ],
    'logs': [
      for (final l in _logs)
        {
          'id': l.id,
          'event_id': l.eventId,
          'student_id': l.studentId,
          'session_window_id': l.sessionWindowId,
          'direction': l.direction,
          'scanned_at': l.scannedAt.toIso8601String(),
          'scanned_by': l.scannedBy,
          'status': l.status,
          'device_note': l.deviceNote,
        },
    ],
  };

  void _read(Map<String, dynamic> json) {
    _nextUserId = json['next_user_id'] as int? ?? 1;
    _nextStudentId = json['next_student_id'] as int? ?? 1;
    _nextEventId = json['next_event_id'] as int? ?? 1;
    _nextWindowId = json['next_window_id'] as int? ?? 1;
    _nextLogId = json['next_log_id'] as int? ?? 1;
    _staff
      ..clear()
      ..addAll([
        for (final raw in json['staff'] as List<dynamic>? ?? [])
          _Staff(
            user: UserModel.fromJson(raw as Map<String, dynamic>),
            password: (raw['password'] as String?) ?? '',
          ),
      ]);
    _students
      ..clear()
      ..addAll([
        for (final raw in json['students'] as List<dynamic>? ?? [])
          StudentModel.fromJson(raw as Map<String, dynamic>),
      ]);
    _events
      ..clear()
      ..addAll([
        for (final raw in json['events'] as List<dynamic>? ?? [])
          _eventFromStored(raw as Map<String, dynamic>),
      ]);
    _logs
      ..clear()
      ..addAll([
        for (final raw in json['logs'] as List<dynamic>? ?? [])
          _hydrateLog(AttendanceLogModel.fromJson(raw as Map<String, dynamic>)),
      ]);
  }

  EventModel _eventFromStored(Map<String, dynamic> json) {
    final parts = (json['event_date'] as String? ?? '').split('-');
    final date = parts.length == 3
        ? DateTime(
            int.tryParse(parts[0]) ?? 1970,
            int.tryParse(parts[1]) ?? 1,
            int.tryParse(parts[2]) ?? 1,
          )
        : dateOnly(DateTime.now());
    return EventModel(
      id: json['id'] as int,
      name: json['name'] as String? ?? '',
      eventDate: date,
      isActive: json['is_active'] as bool? ?? true,
      createdBy: json['created_by'] as int?,
      sessionWindows: [
        for (final w in json['session_windows'] as List<dynamic>? ?? [])
          SessionWindowModel.fromJson(w as Map<String, dynamic>),
      ],
    );
  }

  AttendanceLogModel _hydrateLog(AttendanceLogModel log) {
    final student = _students.where((s) => s.id == log.studentId).firstOrNull;
    final event = _events.where((e) => e.id == log.eventId).firstOrNull;
    final window = event?.sessionWindows
        .where((w) => w.id == log.sessionWindowId)
        .firstOrNull;
    final scanner = _staff.where((s) => s.user.id == log.scannedBy).firstOrNull;
    return AttendanceLogModel(
      id: log.id,
      eventId: log.eventId,
      studentId: log.studentId,
      sessionWindowId: log.sessionWindowId,
      direction: log.direction,
      scannedAt: log.scannedAt,
      scannedBy: log.scannedBy,
      status: log.status,
      deviceNote: log.deviceNote,
      studentIdCode: student?.studentIdCode,
      studentName: student?.fullName,
      studentSection: student?.section,
      sessionLabel: window?.sessionLabel,
      scannedByName: scanner?.user.name,
      eventName: event?.name,
    );
  }

  UserModel login(String username, String password) {
    final staff = _staff
        .where(
          (s) =>
              s.user.username.toLowerCase() == username.trim().toLowerCase() &&
              s.password == password,
        )
        .firstOrNull;
    if (staff == null) {
      throw const ApiFailure(
        message: 'Invalid username or password.',
        statusCode: 401,
      );
    }
    actorUserId = staff.user.id;
    return staff.user;
  }

  StudentModel requireStudentByCode(String code) {
    final trimmed = code.trim();
    final student = _students
        .where(
          (s) =>
              s.studentIdCode.toLowerCase() == trimmed.toLowerCase() ||
              (s.qrPayload != null && s.qrPayload == trimmed),
        )
        .firstOrNull;
    if (student == null) {
      throw const ApiFailure(message: 'Student not found', statusCode: 404);
    }
    return student;
  }

  List<UserModel> moderators() =>
      _staff.where((s) => s.user.role == UserRole.moderator).map((s) => s.user).toList();

  Future<UserModel> createModerator({
    required String name,
    required String username,
    required String password,
  }) async {
    final userName = username.trim();
    if (_staff.any((s) => s.user.username.toLowerCase() == userName.toLowerCase())) {
      throw const ApiFailure(message: 'Username already taken', statusCode: 409);
    }
    final user = UserModel(
      id: _nextUserId++,
      name: name.trim(),
      username: userName,
      role: UserRole.moderator,
      createdAt: DateTime.now(),
    );
    _staff.add(_Staff(user: user, password: password));
    await persist();
    return user;
  }

  Future<UserModel> updateModerator(
    int id, {
    String? name,
    String? username,
    String? password,
  }) async {
    final i = _staff.indexWhere((s) => s.user.id == id);
    if (i < 0) throw const ApiFailure(message: 'Moderator not found', statusCode: 404);
    final current = _staff[i];
    if (username != null) {
      final taken = _staff.any(
        (s) =>
            s.user.id != id &&
            s.user.username.toLowerCase() == username.trim().toLowerCase(),
      );
      if (taken) {
        throw const ApiFailure(message: 'Username already taken', statusCode: 409);
      }
    }
    final updated = UserModel(
      id: current.user.id,
      name: name?.trim() ?? current.user.name,
      username: username?.trim() ?? current.user.username,
      role: current.user.role,
      createdAt: current.user.createdAt,
    );
    _staff[i] = _Staff(
      user: updated,
      password: (password != null && password.isNotEmpty)
          ? password
          : current.password,
    );
    await persist();
    return updated;
  }

  Future<void> deleteModerator(int id) async {
    if (_logs.any((l) => l.scannedBy == id)) {
      throw const ApiFailure(
        message:
            'Moderators who have already scanned cannot be deleted — reset their password instead.',
        statusCode: 409,
      );
    }
    _staff.removeWhere((s) => s.user.id == id);
    await persist();
  }

  List<StudentModel> students({String? query}) {
    final q = query?.trim().toLowerCase();
    if (q == null || q.isEmpty) return List.of(_students);
    return _students
        .where(
          (s) =>
              s.fullName.toLowerCase().contains(q) ||
              s.studentIdCode.toLowerCase().contains(q) ||
              (s.section?.toLowerCase().contains(q) ?? false),
        )
        .toList();
  }

  Future<StudentModel> createStudent({
    required String studentIdCode,
    required String fullName,
    String? section,
    String? photoUrl,
  }) async {
    final code = studentIdCode.trim();
    if (_students.any((s) => s.studentIdCode.toLowerCase() == code.toLowerCase())) {
      throw ApiFailure(message: 'Student code "$code" already exists', statusCode: 409);
    }
    final student = StudentModel(
      id: _nextStudentId++,
      studentIdCode: code,
      fullName: fullName.trim(),
      section: section?.trim().isEmpty == true ? null : section?.trim(),
      photoUrl: photoUrl,
      createdAt: DateTime.now(),
    );
    _students.add(student);
    await persist();
    return student;
  }

  Future<StudentModel> updateStudent(
    int id, {
    String? studentIdCode,
    String? fullName,
    String? section,
    String? photoUrl,
  }) async {
    final i = _students.indexWhere((s) => s.id == id);
    if (i < 0) throw const ApiFailure(message: 'Student not found', statusCode: 404);
    final current = _students[i];
    if (studentIdCode != null) {
      final taken = _students.any(
        (s) =>
            s.id != id &&
            s.studentIdCode.toLowerCase() == studentIdCode.trim().toLowerCase(),
      );
      if (taken) {
        throw ApiFailure(
          message: 'Student code "${studentIdCode.trim()}" already exists',
          statusCode: 409,
        );
      }
    }
    final updated = StudentModel(
      id: current.id,
      studentIdCode: studentIdCode?.trim() ?? current.studentIdCode,
      fullName: fullName?.trim() ?? current.fullName,
      section: section,
      photoUrl: photoUrl,
      createdAt: current.createdAt,
    );
    _students[i] = updated;
    await persist();
    return updated;
  }

  Future<void> deleteStudent(int id) async {
    _logs.removeWhere((l) => l.studentId == id);
    _students.removeWhere((s) => s.id == id);
    await persist();
  }

  Future<Map<String, dynamic>> importStudentsCsv(
    String csv, {
    bool skipExisting = false,
  }) async {
    final rows = _parseCsv(csv);
    if (rows.isEmpty) {
      return {
        'created': 0,
        'updated': 0,
        'skipped': 0,
        'errors': <String>[],
        'total_rows': 0,
      };
    }
    final header = rows.first.map((c) => c.trim().toLowerCase()).toList();
    final dataRows = rows.skip(1);
    var created = 0;
    var updated = 0;
    var skipped = 0;
    final errors = <String>[];
    var total = 0;

    String cell(List<String> row, List<String> names) {
      for (final name in names) {
        final i = header.indexOf(name);
        if (i >= 0 && i < row.length) return row[i].trim();
      }
      return '';
    }

    for (final row in dataRows) {
      if (row.every((c) => c.trim().isEmpty)) continue;
      total++;
      try {
        final code = cell(row, ['studentid', 'student_id_code', 'student id']);
        final first = cell(row, ['fname', 'first_name', 'first name']);
        final last = cell(row, ['lname', 'last_name', 'last name']);
        final mid = cell(row, ['mname', 'middle_name', 'middle name']);
        var full = cell(row, ['full_name', 'fullname', 'name']);
        if (full.isEmpty) {
          full = [first, mid, last].where((p) => p.isNotEmpty).join(' ');
        }
        final course = cell(row, ['course', 'program']);
        final sectioning = cell(row, ['sectioning', 'section']);
        final year = cell(row, ['yrlevel', 'year_level', 'year']);
        final section = [
          course,
          year,
          sectioning,
        ].where((p) => p.isNotEmpty).join('-');
        if (code.isEmpty || full.isEmpty) {
          errors.add('Row $total: missing StudentID or name');
          continue;
        }
        final existing = _students
            .where((s) => s.studentIdCode.toLowerCase() == code.toLowerCase())
            .firstOrNull;
        if (existing != null) {
          if (skipExisting) {
            skipped++;
            continue;
          }
          await updateStudent(
            existing.id,
            fullName: full,
            section: section.isEmpty ? existing.section : section,
          );
          updated++;
        } else {
          await createStudent(
            studentIdCode: code,
            fullName: full,
            section: section.isEmpty ? null : section,
          );
          created++;
        }
      } catch (e) {
        errors.add('Row $total: $e');
      }
    }
    return {
      'created': created,
      'updated': updated,
      'skipped': skipped,
      'errors': errors,
      'total_rows': total,
    };
  }

  List<EventModel> events() {
    final list = List<EventModel>.of(_events)
      ..sort((a, b) => b.eventDate.compareTo(a.eventDate));
    return list.map(_decorateEvent).toList();
  }

  EventModel event(int id) {
    final e = _events.where((x) => x.id == id).firstOrNull;
    if (e == null) throw const ApiFailure(message: 'Event not found', statusCode: 404);
    return _decorateEvent(e);
  }

  EventModel _decorateEvent(EventModel e) {
    final now = DateTime.now();
    final today = sameDay(e.eventDate, now);
    final current = today ? _windowAt(e, now) : null;
    return EventModel(
      id: e.id,
      name: e.name,
      eventDate: e.eventDate,
      isActive: e.isActive,
      createdBy: e.createdBy,
      sessionWindows: List.of(e.sessionWindows)
        ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder)),
      isToday: today,
      currentSessionWindowId: current?.id,
    );
  }

  SessionWindowModel? _windowAt(EventModel e, DateTime now) {
    final mins = now.hour * 60 + now.minute;
    for (final w in e.sessionWindows) {
      if (minutesOf(w.startTime) <= mins && mins < minutesOf(w.endTime)) {
        return w;
      }
    }
    return null;
  }

  Future<EventModel> createEvent({
    required String name,
    required DateTime eventDate,
    bool isActive = true,
    List<({String label, String start, String end})> windows = const [],
  }) async {
    final id = _nextEventId++;
    final created = EventModel(
      id: id,
      name: name.trim(),
      eventDate: dateOnly(eventDate),
      isActive: isActive,
      createdBy: actorUserId,
      sessionWindows: [
        for (var i = 0; i < windows.length; i++)
          SessionWindowModel(
            id: _nextWindowId++,
            eventId: id,
            sessionLabel: windows[i].label,
            startTime: windows[i].start,
            endTime: windows[i].end,
            sortOrder: i,
          ),
      ],
    );
    _events.add(created);
    await persist();
    return _decorateEvent(created);
  }

  Future<EventModel> updateEvent(
    int id, {
    String? name,
    DateTime? eventDate,
    bool? isActive,
  }) async {
    final i = _events.indexWhere((e) => e.id == id);
    if (i < 0) throw const ApiFailure(message: 'Event not found', statusCode: 404);
    final current = _events[i];
    _events[i] = EventModel(
      id: current.id,
      name: name?.trim() ?? current.name,
      eventDate: eventDate != null ? dateOnly(eventDate) : current.eventDate,
      isActive: isActive ?? current.isActive,
      createdBy: current.createdBy,
      sessionWindows: current.sessionWindows,
    );
    await persist();
    return _decorateEvent(_events[i]);
  }

  Future<void> deleteEvent(int id) async {
    _logs.removeWhere((l) => l.eventId == id);
    _events.removeWhere((e) => e.id == id);
    await persist();
  }

  int _eventIndexForWindow(int windowId) {
    return _events.indexWhere((e) => e.sessionWindows.any((w) => w.id == windowId));
  }

  Future<SessionWindowModel> createSessionWindow(
    int eventId, {
    required String label,
    required String start,
    required String end,
    int? sortOrder,
  }) async {
    final i = _events.indexWhere((e) => e.id == eventId);
    if (i < 0) throw const ApiFailure(message: 'Event not found', statusCode: 404);
    final event = _events[i];
    _validateWindow(event, start: start, end: end);
    final window = SessionWindowModel(
      id: _nextWindowId++,
      eventId: eventId,
      sessionLabel: label.trim(),
      startTime: start,
      endTime: end,
      sortOrder: sortOrder ?? event.sessionWindows.length,
    );
    _events[i] = EventModel(
      id: event.id,
      name: event.name,
      eventDate: event.eventDate,
      isActive: event.isActive,
      createdBy: event.createdBy,
      sessionWindows: [...event.sessionWindows, window],
    );
    await persist();
    return window;
  }

  Future<SessionWindowModel> updateSessionWindow(
    int id, {
    String? label,
    String? start,
    String? end,
    int? sortOrder,
  }) async {
    final ei = _eventIndexForWindow(id);
    if (ei < 0) {
      throw const ApiFailure(message: 'Session window not found', statusCode: 404);
    }
    final event = _events[ei];
    final nextStart = start ?? event.sessionWindows.firstWhere((w) => w.id == id).startTime;
    final nextEnd = end ?? event.sessionWindows.firstWhere((w) => w.id == id).endTime;
    _validateWindow(event, start: nextStart, end: nextEnd, excludeId: id);
    SessionWindowModel? updated;
    _events[ei] = EventModel(
      id: event.id,
      name: event.name,
      eventDate: event.eventDate,
      isActive: event.isActive,
      createdBy: event.createdBy,
      sessionWindows: [
        for (final w in event.sessionWindows)
          if (w.id == id)
            updated = SessionWindowModel(
              id: w.id,
              eventId: w.eventId,
              sessionLabel: label?.trim() ?? w.sessionLabel,
              startTime: nextStart,
              endTime: nextEnd,
              sortOrder: sortOrder ?? w.sortOrder,
            )
          else
            w,
      ],
    );
    await persist();
    return updated!;
  }

  Future<void> deleteSessionWindow(int id, {bool force = false}) async {
    final scans = _logs.where((l) => l.sessionWindowId == id && l.isConfirmed).length;
    if (scans > 0 && !force) {
      throw ApiFailure(
        message:
            'This session has $scans attendance records. Add force to delete them.',
        statusCode: 409,
        code: 'HAS_RECORDS',
        data: {'count': scans},
      );
    }
    _logs.removeWhere((l) => l.sessionWindowId == id);
    final ei = _eventIndexForWindow(id);
    if (ei < 0) return;
    final event = _events[ei];
    _events[ei] = EventModel(
      id: event.id,
      name: event.name,
      eventDate: event.eventDate,
      isActive: event.isActive,
      createdBy: event.createdBy,
      sessionWindows: event.sessionWindows.where((w) => w.id != id).toList(),
    );
    await persist();
  }

  void _validateWindow(
    EventModel event, {
    required String start,
    required String end,
    int? excludeId,
  }) {
    if (minutesOf(start) >= minutesOf(end)) {
      throw const ApiFailure(
        message: 'Start time must be before end time',
        statusCode: 400,
      );
    }
    for (final w in event.sessionWindows) {
      if (w.id == excludeId) continue;
      if (minutesOf(start) < minutesOf(w.endTime) &&
          minutesOf(w.startTime) < minutesOf(end)) {
        throw ApiFailure(
          message: '"$start–$end" overlaps "${w.sessionLabel}"',
          statusCode: 409,
        );
      }
    }
  }

  List<AttendanceLogModel> attendance({
    int? eventId,
    DateTime? date,
    int? studentId,
    int? sessionWindowId,
    String? status,
    String? search,
    int? limit,
  }) {
    var list = _logs.map(_hydrateLog).toList();
    if (eventId != null) list = list.where((l) => l.eventId == eventId).toList();
    if (studentId != null) {
      list = list.where((l) => l.studentId == studentId).toList();
    }
    if (sessionWindowId != null) {
      list = list.where((l) => l.sessionWindowId == sessionWindowId).toList();
    }
    if (date != null) {
      list = list.where((l) => sameDay(l.scannedAt, date)).toList();
    }
    if (status != null) list = list.where((l) => l.status == status).toList();
    if (search != null && search.trim().isNotEmpty) {
      final s = search.trim().toLowerCase();
      list = list
          .where(
            (l) =>
                (l.studentName?.toLowerCase().contains(s) ?? false) ||
                (l.studentIdCode?.toLowerCase().contains(s) ?? false) ||
                (l.eventName?.toLowerCase().contains(s) ?? false),
          )
          .toList();
    }
    list.sort((a, b) => b.scannedAt.compareTo(a.scannedAt));
    if (limit != null && list.length > limit) {
      list = list.take(limit).toList();
    }
    return list;
  }

  Future<AttendanceLogModel> updateAttendance(
    int id, {
    String? direction,
    int? sessionWindowId,
    String? status,
    DateTime? scannedAt,
    String? deviceNote,
  }) async {
    final i = _logs.indexWhere((l) => l.id == id);
    if (i < 0) {
      throw const ApiFailure(message: 'Attendance record not found', statusCode: 404);
    }
    final current = _logs[i];
    _logs[i] = AttendanceLogModel(
      id: current.id,
      eventId: current.eventId,
      studentId: current.studentId,
      sessionWindowId: sessionWindowId ?? current.sessionWindowId,
      direction: direction ?? current.direction,
      scannedAt: scannedAt ?? current.scannedAt,
      scannedBy: current.scannedBy,
      status: status ?? current.status,
      deviceNote: deviceNote ?? current.deviceNote,
    );
    await persist();
    return _hydrateLog(_logs[i]);
  }

  Future<void> deleteAttendance(int id) async {
    _logs.removeWhere((l) => l.id == id);
    await persist();
  }

  String exportAttendanceCsv({
    int? eventId,
    DateTime? date,
    int? studentId,
    int? sessionWindowId,
    String? status,
    String? search,
    int? limit,
  }) {
    final rows = attendance(
      eventId: eventId,
      date: date,
      studentId: studentId,
      sessionWindowId: sessionWindowId,
      status: status,
      search: search,
      limit: limit,
    );
    final buf = StringBuffer(
      'id,event,student_code,student,section,session,direction,status,scanned_at,scanned_by\n',
    );
    for (final l in rows) {
      buf.writeln(
        [
          l.id,
          _csv(l.eventName),
          _csv(l.studentIdCode),
          _csv(l.studentName),
          _csv(l.studentSection),
          _csv(l.sessionLabel),
          l.direction,
          l.status,
          l.scannedAt.toIso8601String(),
          _csv(l.scannedByName),
        ].join(','),
      );
    }
    return buf.toString();
  }

  List<EventModel> activeEvents() =>
      events().where((e) => e.isActive).toList()..sort((a, b) {
        if (a.isToday != b.isToday) return a.isToday ? -1 : 1;
        return b.eventDate.compareTo(a.eventDate);
      });

  ScanPreviewModel preview({
    required int eventId,
    required String qrPayload,
    int? sessionWindowId,
  }) {
    final student = requireStudentByCode(qrPayload);
    final ev = event(eventId);
    if (!ev.isActive) {
      throw const ApiFailure(message: 'Event is not active', statusCode: 409);
    }
    final now = DateTime.now();
    if (!sameDay(ev.eventDate, now)) {
      throw ApiFailure(
        message: 'Scanning for "${ev.name}" is only allowed on ${ymd(ev.eventDate)}',
        statusCode: 409,
      );
    }
    SessionWindowModel? window;
    var mode = 'auto';
    if (sessionWindowId != null) {
      window = ev.sessionWindows.where((w) => w.id == sessionWindowId).firstOrNull;
      mode = 'manual';
      if (window == null) {
        throw const ApiFailure(message: 'Session not found', statusCode: 404);
      }
      final mins = now.hour * 60 + now.minute;
      if (mins < minutesOf(window.startTime) || mins >= minutesOf(window.endTime)) {
        throw ApiFailure(
          message: '${window.sessionLabel} is not open right now',
          statusCode: 409,
        );
      }
    } else {
      window = _windowAt(ev, now);
      if (window == null) {
        throw const ApiFailure(
          message: 'No session window is open right now',
          statusCode: 422,
          code: 'NO_ACTIVE_WINDOW',
        );
      }
    }
    final existing = _logs
        .where(
          (l) =>
              l.eventId == eventId &&
              l.studentId == student.id &&
              l.sessionWindowId == window!.id &&
              l.isConfirmed,
        )
        .toList()
      ..sort((a, b) => a.scannedAt.compareTo(b.scannedAt));
    final direction = switch (existing.length) {
      0 => 'IN',
      1 => 'OUT',
      _ => 'ALREADY_COMPLETE',
    };
    return ScanPreviewModel(
      student: student,
      eventId: ev.id,
      eventName: ev.name,
      sessionWindowId: window.id,
      sessionLabel: window.sessionLabel,
      sessionStart: window.startTime,
      sessionEnd: window.endTime,
      sessionMode: mode,
      computedDirection: direction,
      canConfirm: direction != 'ALREADY_COMPLETE',
      serverTime: now,
      existingScans: [
        for (final l in existing) (direction: l.direction, scannedAt: l.scannedAt),
      ],
      message: direction == 'ALREADY_COMPLETE'
          ? 'Already timed IN & OUT for ${window.sessionLabel}'
          : null,
    );
  }

  Future<AttendanceLogModel> confirm(ScanPreviewModel p, {String? note}) async {
    if (!p.canConfirm) {
      throw ApiFailure(
        message: p.message ?? 'Already recorded for this session',
        statusCode: 409,
        code: 'ALREADY_COMPLETE',
      );
    }
    final log = AttendanceLogModel(
      id: _nextLogId++,
      eventId: p.eventId,
      studentId: p.student.id,
      sessionWindowId: p.sessionWindowId,
      direction: p.computedDirection,
      scannedAt: DateTime.now(),
      scannedBy: actorUserId ?? 0,
      status: 'confirmed',
      deviceNote: note,
    );
    _logs.add(log);
    await persist();
    return _hydrateLog(log);
  }

  Future<void> cancel(ScanPreviewModel p) async {
    final dir = p.computedDirection == 'ALREADY_COMPLETE' ? 'IN' : p.computedDirection;
    final i = _logs.lastIndexWhere(
      (l) =>
          l.eventId == p.eventId &&
          l.studentId == p.student.id &&
          l.sessionWindowId == p.sessionWindowId &&
          l.direction == dir &&
          l.isConfirmed,
    );
    if (i >= 0) {
      final current = _logs[i];
      _logs[i] = AttendanceLogModel(
        id: current.id,
        eventId: current.eventId,
        studentId: current.studentId,
        sessionWindowId: current.sessionWindowId,
        direction: current.direction,
        scannedAt: current.scannedAt,
        scannedBy: current.scannedBy,
        status: 'cancelled',
        deviceNote: current.deviceNote,
      );
      await persist();
    }
  }

  List<AttendanceLogModel> myScans({
    int? eventId,
    bool allDates = false,
    bool includeCancelled = false,
  }) {
    final actor = actorUserId;
    var list = _logs.where((l) => actor == null || l.scannedBy == actor);
    if (eventId != null) list = list.where((l) => l.eventId == eventId);
    if (!allDates) {
      final today = DateTime.now();
      list = list.where((l) => sameDay(l.scannedAt, today));
    }
    if (!includeCancelled) list = list.where((l) => l.isConfirmed);
    final out = list.map(_hydrateLog).toList()
      ..sort((a, b) => b.scannedAt.compareTo(a.scannedAt));
    return out;
  }

  StudentModel myQr(String code) {
    final s = requireStudentByCode(code);
    return StudentModel(
      id: s.id,
      studentIdCode: s.studentIdCode,
      fullName: s.fullName,
      section: s.section,
      photoUrl: s.photoUrl,
      qrPayload: s.studentIdCode,
      createdAt: s.createdAt,
    );
  }

  List<AttendanceLogModel> myAttendance(String code) {
    final s = requireStudentByCode(code);
    return attendance(studentId: s.id);
  }

  static String _csv(String? v) {
    final s = v ?? '';
    if (s.contains(',') || s.contains('"') || s.contains('\n')) {
      return '"${s.replaceAll('"', '""')}"';
    }
    return s;
  }

  static List<List<String>> _parseCsv(String raw) {
    final text = raw.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
    final delimiter = text.contains('\t') && !text.contains(',') ? '\t' : ',';
    final rows = <List<String>>[];
    var row = <String>[];
    var cell = StringBuffer();
    var quoted = false;
    for (var i = 0; i < text.length; i++) {
      final ch = text[i];
      if (quoted) {
        if (ch == '"') {
          if (i + 1 < text.length && text[i + 1] == '"') {
            cell.write('"');
            i++;
          } else {
            quoted = false;
          }
        } else {
          cell.write(ch);
        }
      } else if (ch == '"') {
        quoted = true;
      } else if (ch == delimiter) {
        row.add(cell.toString());
        cell = StringBuffer();
      } else if (ch == '\n') {
        row.add(cell.toString());
        rows.add(row);
        row = [];
        cell = StringBuffer();
      } else {
        cell.write(ch);
      }
    }
    if (cell.isNotEmpty || row.isNotEmpty) {
      row.add(cell.toString());
      rows.add(row);
    }
    return rows;
  }
}

final localDbProvider = Provider<LocalDb>((ref) {
  throw StateError('LocalDb was not provided. Call LocalDb.open() in main().');
});
