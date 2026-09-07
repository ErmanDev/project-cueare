import 'package:drift_postgres/drift_postgres.dart';

import '../database/database.dart';
import 'time_utils.dart';

String _ts(PgDateTime value) => value.dateTime.toIso8601String();

/// JSON shapes returned by the API (snake_case keys).
extension UserJson on User {
  Map<String, dynamic> toApi() => {
    'id': id,
    'name': name,
    'username': username,
    'role': role,
    'created_at': _ts(createdAt),
    'updated_at': _ts(updatedAt),
  };
}

extension StudentJson on Student {
  Map<String, dynamic> toApi() => {
    'id': id,
    'student_id_code': studentIdCode,
    'full_name': fullName,
    'section': section,
    'photo_url': photoUrl,
    'created_at': _ts(createdAt),
    'updated_at': _ts(updatedAt),
  };
}

extension EventJson on Event {
  Map<String, dynamic> toApi({DateTime? now}) {
    final expired = TimeUtils.isPastDate(
      eventDate.dateTime,
      relativeTo: now ?? DateTime.now(),
    );
    return {
      'id': id,
      'name': name,
      'event_date': _ts(eventDate),
      'is_active': isActive && !expired,
      'is_expired': expired,
      'created_by': createdBy,
      'created_at': _ts(createdAt),
      'updated_at': _ts(updatedAt),
    };
  }
}

extension SessionWindowJson on SessionWindow {
  Map<String, dynamic> toApi() => {
    'id': id,
    'event_id': eventId,
    'session_label': sessionLabel,
    'start_time': startTime,
    'end_time': endTime,
    'sort_order': sortOrder,
  };
}

extension AttendanceLogJson on AttendanceLog {
  Map<String, dynamic> toApi() => {
    'id': id,
    'event_id': eventId,
    'student_id': studentId,
    'session_window_id': sessionWindowId,
    'direction': direction,
    'scanned_at': _ts(scannedAt),
    'scanned_by': scannedBy,
    'status': status,
    'device_note': deviceNote,
    'updated_at': _ts(updatedAt),
  };
}

/// An attendance log joined with its student / window / scanner for display.
class AttendanceLogDetail {
  const AttendanceLogDetail({
    required this.log,
    required this.student,
    required this.window,
    required this.scanner,
    required this.event,
  });

  final AttendanceLog log;
  final Student? student;
  final SessionWindow? window;
  final User? scanner;
  final Event? event;

  Map<String, dynamic> toApi() => {
    ...log.toApi(),
    'student_id_code': student?.studentIdCode,
    'student_name': student?.fullName,
    'student_section': student?.section,
    'session_label': window?.sessionLabel,
    'scanned_by_name': scanner?.name,
    'event_name': event?.name,
  };
}
