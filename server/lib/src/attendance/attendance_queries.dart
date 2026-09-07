import 'package:dart_frog/dart_frog.dart';
import 'package:drift/drift.dart';

import '../database/database.dart';
import '../database/timestamp.dart';
import '../utils/http_utils.dart';
import '../utils/serializers.dart';
import '../utils/student_code.dart';
import '../utils/time_utils.dart';
import 'attendance_service.dart';

/// Builds an [AttendanceFilter] from standard query parameters:
/// `event_id, student_id, session_window_id, scanned_by, status, date, q, limit`.
AttendanceFilter filterFromQuery(RequestContext context) {
  final status = queryString(context, 'status');
  if (status != null &&
      status != ScanStatus.confirmed &&
      status != ScanStatus.cancelled) {
    throw badRequest('status must be "confirmed" or "cancelled"');
  }
  return AttendanceFilter(
    eventId: queryInt(context, 'event_id'),
    studentId: queryInt(context, 'student_id'),
    sessionWindowId: queryInt(context, 'session_window_id'),
    scannedBy: queryInt(context, 'scanned_by'),
    status: status,
    date: queryDate(context, 'date'),
    search: queryString(context, 'q'),
    limit: queryInt(context, 'limit'),
  );
}

/// Filters for listing attendance logs.
class AttendanceFilter {
  const AttendanceFilter({
    this.eventId,
    this.studentId,
    this.sessionWindowId,
    this.scannedBy,
    this.status,
    this.date,
    this.search,
    this.limit,
  });

  final int? eventId;
  final int? studentId;
  final int? sessionWindowId;
  final int? scannedBy;

  /// 'confirmed' | 'cancelled' | null (= all)
  final String? status;

  /// Restrict to scans on this calendar day (server local time).
  final DateTime? date;

  /// Free-text on student name / code.
  final String? search;
  final int? limit;
}

/// Joined attendance listing shared by admin, moderator and student routes.
Future<List<AttendanceLogDetail>> listAttendance(
  AppDatabase db,
  AttendanceFilter f,
) async {
  final logs = db.attendanceLogs;
  final students = db.students;
  final windows = db.sessionWindows;
  final users = db.users;
  final events = db.events;

  final query = db.select(logs).join([
    leftOuterJoin(students, students.id.equalsExp(logs.studentId)),
    leftOuterJoin(windows, windows.id.equalsExp(logs.sessionWindowId)),
    leftOuterJoin(users, users.id.equalsExp(logs.scannedBy)),
    leftOuterJoin(events, events.id.equalsExp(logs.eventId)),
  ]);

  final conditions = <Expression<bool>>[];
  if (f.eventId != null) conditions.add(logs.eventId.equals(f.eventId!));
  if (f.studentId != null) conditions.add(logs.studentId.equals(f.studentId!));
  if (f.sessionWindowId != null) {
    conditions.add(logs.sessionWindowId.equals(f.sessionWindowId!));
  }
  if (f.scannedBy != null) conditions.add(logs.scannedBy.equals(f.scannedBy!));
  if (f.status != null) conditions.add(logs.status.equals(f.status!));
  if (f.date != null) {
    final start = TimeUtils.startOfDay(f.date!);
    final end = start.add(const Duration(days: 1));
    conditions.add(logs.scannedAt.isBiggerOrEqualValue(pgDateTime(start)));
    conditions.add(logs.scannedAt.isSmallerThanValue(pgDateTime(end)));
  }
  if (f.search != null && f.search!.isNotEmpty) {
    final like = '%${StudentCode.escapeLike(f.search!.toLowerCase())}%';
    conditions.add(
      students.fullName.lower().like(like, escapeChar: r'\') |
          students.studentIdCode.lower().like(like, escapeChar: r'\'),
    );
  }
  if (conditions.isNotEmpty) {
    query.where(conditions.reduce((a, b) => a & b));
  }
  query.orderBy([OrderingTerm.desc(logs.scannedAt)]);
  if (f.limit != null) query.limit(f.limit!);

  final rows = await query.get();
  return rows
      .map(
        (row) => AttendanceLogDetail(
          log: row.readTable(logs),
          student: row.readTableOrNull(students),
          window: row.readTableOrNull(windows),
          scanner: row.readTableOrNull(users),
          event: row.readTableOrNull(events),
        ),
      )
      .toList();
}

Future<AttendanceLogDetail?> getAttendanceDetail(AppDatabase db, int id) async {
  final logs = db.attendanceLogs;
  final row = await (db.select(logs).join([
    leftOuterJoin(db.students, db.students.id.equalsExp(logs.studentId)),
    leftOuterJoin(
      db.sessionWindows,
      db.sessionWindows.id.equalsExp(logs.sessionWindowId),
    ),
    leftOuterJoin(db.users, db.users.id.equalsExp(logs.scannedBy)),
    leftOuterJoin(db.events, db.events.id.equalsExp(logs.eventId)),
  ])..where(logs.id.equals(id))).getSingleOrNull();
  if (row == null) return null;
  return AttendanceLogDetail(
    log: row.readTable(logs),
    student: row.readTableOrNull(db.students),
    window: row.readTableOrNull(db.sessionWindows),
    scanner: row.readTableOrNull(db.users),
    event: row.readTableOrNull(db.events),
  );
}
