import '../core/utils/formatters.dart';
import '../core/utils/json_values.dart';

class AttendanceLogModel {
  const AttendanceLogModel({
    required this.id,
    required this.eventId,
    required this.studentId,
    required this.sessionWindowId,
    required this.direction,
    required this.scannedAt,
    required this.scannedBy,
    required this.status,
    this.deviceNote,
    this.studentIdCode,
    this.studentName,
    this.course,
    this.yearLevel,
    this.studentSection,
    this.sessionLabel,
    this.scannedByName,
    this.eventName,
  });

  final int id;
  final int eventId;
  final int studentId;
  final int sessionWindowId;

  /// 'IN' | 'OUT'
  final String direction;
  final DateTime scannedAt;
  final int scannedBy;

  /// 'confirmed' | 'cancelled'
  final String status;
  final String? deviceNote;

  // Joined display fields
  final String? studentIdCode;
  final String? studentName;
  final String? course;
  final int? yearLevel;
  final String? studentSection;
  final String? sessionLabel;
  final String? scannedByName;
  final String? eventName;

  bool get isConfirmed => status == 'confirmed';
  bool get isIn => direction == 'IN';

  factory AttendanceLogModel.fromJson(Map<String, dynamic> json) =>
      AttendanceLogModel(
        id: asInt(json['id']) ?? 0,
        eventId: asInt(json['event_id']) ?? 0,
        studentId: asInt(json['student_id']) ?? 0,
        sessionWindowId: asInt(json['session_window_id']) ?? 0,
        direction: json['direction'] as String? ?? 'IN',
        scannedAt:
            Fmt.parseUtc(json['scanned_at'] as String?) ??
            DateTime.now(),
        scannedBy: asInt(json['scanned_by']) ?? 0,
        status: json['status'] as String? ?? 'confirmed',
        deviceNote: json['device_note'] as String?,
        studentIdCode: json['student_id_code'] as String?,
        studentName: json['student_name'] as String?,
        course: json['course'] as String?,
        yearLevel: asInt(json['year_level']),
        studentSection: json['student_section'] as String?,
        sessionLabel: json['session_label'] as String?,
        scannedByName: json['scanned_by_name'] as String?,
        eventName: json['event_name'] as String?,
      );
}
