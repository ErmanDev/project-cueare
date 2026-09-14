import '../core/utils/formatters.dart';
import '../core/utils/json_values.dart';

class StudentEventSessionModel {
  const StudentEventSessionModel({
    required this.sessionId,
    required this.sessionName,
    this.sessionDate,
    required this.status,
    this.checkedInAt,
    this.checkedOutAt,
  });

  final int sessionId;
  final String sessionName;
  final DateTime? sessionDate;
  final String status;
  final DateTime? checkedInAt;
  final DateTime? checkedOutAt;

  String get scanLabel {
    if (checkedOutAt != null) return 'OUT';
    if (checkedInAt != null) return 'IN';
    return 'Pending';
  }

  String? get scanTime {
    final at = checkedOutAt ?? checkedInAt;
    return at == null ? null : Fmt.time(at.toLocal());
  }

  factory StudentEventSessionModel.fromJson(Map<String, dynamic> json) =>
      StudentEventSessionModel(
        sessionId: asInt(json['session_id']) ?? 0,
        sessionName: json['session_name'] as String? ?? 'Session',
        sessionDate: DateTime.tryParse(json['session_date'] as String? ?? ''),
        status: json['status'] as String? ?? 'PENDING',
        checkedInAt: DateTime.tryParse(json['checked_in_at_utc'] as String? ?? ''),
        checkedOutAt: DateTime.tryParse(
          json['checked_out_at_utc'] as String? ?? '',
        ),
      );
}

class StudentEventModel {
  const StudentEventModel({
    required this.id,
    required this.name,
    required this.eventDate,
    required this.isActive,
    this.isExpired = false,
    this.sessions = const [],
  });

  final int id;
  final String name;
  final DateTime eventDate;
  final bool isActive;
  final bool isExpired;
  final List<StudentEventSessionModel> sessions;

  bool get canShowQr => isActive && !isExpired;

  factory StudentEventModel.fromJson(Map<String, dynamic> json) =>
      StudentEventModel(
        id: asInt(json['id']) ?? 0,
        name: json['name'] as String? ?? '',
        eventDate:
            DateTime.tryParse(json['event_date'] as String? ?? '') ??
            DateTime.now(),
        isActive: json['is_active'] as bool? ?? false,
        isExpired: json['is_expired'] as bool? ?? false,
        sessions: (json['sessions'] as List<dynamic>? ?? [])
            .map(
              (e) => StudentEventSessionModel.fromJson(
                e as Map<String, dynamic>,
              ),
            )
            .toList(),
      );
}

class StudentEventQrModel {
  const StudentEventQrModel({
    required this.token,
    required this.eventName,
    required this.studentName,
    this.studentIdCode,
  });

  final String token;
  final String eventName;
  final String studentName;
  final String? studentIdCode;

  factory StudentEventQrModel.fromJson(Map<String, dynamic> json) {
    final event = json['event'] as Map<String, dynamic>? ?? const {};
    final student = json['student'] as Map<String, dynamic>? ?? const {};
    return StudentEventQrModel(
      token: json['token'] as String? ?? '',
      eventName: event['name'] as String? ?? 'Event',
      studentName: student['full_name'] as String? ?? '',
      studentIdCode: student['student_id_code'] as String?,
    );
  }
}
