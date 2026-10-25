import '../core/utils/formatters.dart';
import '../core/utils/json_values.dart';
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
    this.isLate = false,
    this.isEarlyOut = false,
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
  final bool isLate;
  final bool isEarlyOut;
  final bool canConfirm;
  final DateTime serverTime;
  final List<({String direction, DateTime scannedAt})> existingScans;
  final String? message;

  bool get isIn => computedDirection == 'IN';
  bool get isOut => computedDirection == 'OUT';

  factory ScanPreviewModel.fromJson(Map<String, dynamic> json) {
    final event = (json['event'] ?? json['computed_event']) as Map<String, dynamic>? ?? const {};
    final session = (json['session'] ?? json['computed_session']) as Map<String, dynamic>? ?? const {};
    final studentMap = json['student'] as Map<String, dynamic>? ?? const {};

    return ScanPreviewModel(
      student: StudentModel.fromJson(studentMap),
      eventId: asInt(event['id']) ?? asInt(json['event_id']) ?? 0,
      eventName: event['name'] as String? ?? '',
      sessionWindowId: asInt(session['id']) ?? asInt(json['session_window_id']) ?? 0,
      sessionLabel: session['session_label'] as String? ?? 'Session',
      sessionStart: session['start_time'] as String? ?? '',
      sessionEnd: session['end_time'] as String? ?? '',
      sessionMode: session['mode'] as String? ?? 'auto',
      computedDirection: json['computed_direction'] as String? ?? 'IN',
      isLate: json['is_late'] as bool? ?? false,
      isEarlyOut: json['is_early_out'] as bool? ?? false,
      canConfirm: json['can_confirm'] as bool? ?? true,
      serverTime:
          Fmt.parseUtc(json['server_time'] as String?) ??
          DateTime.now(),
      existingScans: (json['existing_scans'] as List<dynamic>? ?? []).map((e) {
        final m = e as Map<String, dynamic>? ?? const {};
        return (
          direction: m['direction'] as String? ?? 'IN',
          scannedAt:
              Fmt.parseUtc(m['scanned_at'] as String?) ??
              DateTime.now(),
        );
      }).toList(),
      message: json['message'] as String?,
    );
  }
}
