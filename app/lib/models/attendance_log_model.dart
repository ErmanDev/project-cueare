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
  final String? studentSection;
  final String? sessionLabel;
  final String? scannedByName;
  final String? eventName;

  bool get isConfirmed => status == 'confirmed';
  bool get isIn => direction == 'IN';

  factory AttendanceLogModel.fromJson(Map<String, dynamic> json) =>
      AttendanceLogModel(
        id: json['id'] as int,
        eventId: json['event_id'] as int,
        studentId: json['student_id'] as int,
        sessionWindowId: json['session_window_id'] as int,
        direction: json['direction'] as String,
        scannedAt:
            DateTime.tryParse(json['scanned_at'] as String? ?? '') ??
            DateTime.now(),
        scannedBy: json['scanned_by'] as int? ?? 0,
        status: json['status'] as String,
        deviceNote: json['device_note'] as String?,
        studentIdCode: json['student_id_code'] as String?,
        studentName: json['student_name'] as String?,
        studentSection: json['student_section'] as String?,
        sessionLabel: json['session_label'] as String?,
        scannedByName: json['scanned_by_name'] as String?,
        eventName: json['event_name'] as String?,
      );
}
