import 'student_model.dart';

/// Response of POST /moderator/scan/preview.
class ScanPreviewModel {
  const ScanPreviewModel({
    required this.student,
    required this.eventId,
    required this.eventName,
    required this.sessionWindowId,
    required this.sessionLabel,
    required this.sessionStart,
    required this.sessionEnd,
    required this.sessionMode,
    required this.computedDirection,
    required this.canConfirm,
    required this.serverTime,
    required this.existingScans,
    this.message,
  });

  final StudentModel student;
  final int eventId;
  final String eventName;
  final int sessionWindowId;
  final String sessionLabel;
  final String sessionStart;
  final String sessionEnd;

  /// 'auto' | 'manual'
  final String sessionMode;

  /// 'IN' | 'OUT' | 'ALREADY_COMPLETE'
  final String computedDirection;
  final bool canConfirm;
  final DateTime serverTime;
  final List<({String direction, DateTime scannedAt})> existingScans;
  final String? message;

  bool get isIn => computedDirection == 'IN';
  bool get isOut => computedDirection == 'OUT';

  factory ScanPreviewModel.fromJson(Map<String, dynamic> json) {
    final session = json['computed_session'] as Map<String, dynamic>;
    final event = json['event'] as Map<String, dynamic>;
    return ScanPreviewModel(
      student: StudentModel.fromJson(json['student'] as Map<String, dynamic>),
      eventId: event['id'] as int,
      eventName: event['name'] as String? ?? '',
      sessionWindowId: session['id'] as int,
      sessionLabel: session['session_label'] as String,
      sessionStart: session['start_time'] as String? ?? '',
      sessionEnd: session['end_time'] as String? ?? '',
      sessionMode: session['mode'] as String? ?? 'auto',
      computedDirection: json['computed_direction'] as String,
      canConfirm: json['can_confirm'] as bool? ?? true,
      serverTime:
          DateTime.tryParse(json['server_time'] as String? ?? '') ??
          DateTime.now(),
      existingScans: (json['existing_scans'] as List<dynamic>? ?? []).map((e) {
        final m = e as Map<String, dynamic>;
        return (
          direction: m['direction'] as String,
          scannedAt:
              DateTime.tryParse(m['scanned_at'] as String? ?? '') ??
              DateTime.now(),
        );
      }).toList(),
      message: json['message'] as String?,
    );
  }
}
