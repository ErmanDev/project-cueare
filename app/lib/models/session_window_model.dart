import '../core/utils/json_values.dart';

class SessionWindowModel {
  const SessionWindowModel({
    required this.id,
    required this.eventId,
    required this.sessionLabel,
    required this.startTime,
    required this.endTime,
    required this.sortOrder,
  });

  final int id;
  final int eventId;
  final String sessionLabel;

  /// "HH:mm"
  final String startTime;
  final String endTime;
  final int sortOrder;

  String get timeRange => '$startTime – $endTime';

  factory SessionWindowModel.fromJson(Map<String, dynamic> json) =>
      SessionWindowModel(
        id: asInt(json['id']) ?? 0,
        eventId: asInt(json['event_id']) ?? 0,
        sessionLabel: json['session_label'] as String? ?? 'Session',
        startTime: json['start_time'] as String? ?? '',
        endTime: json['end_time'] as String? ?? '',
        sortOrder: asInt(json['sort_order']) ?? 0,
      );
}
