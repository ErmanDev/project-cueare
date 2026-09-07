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
        id: json['id'] as int,
        eventId: json['event_id'] as int? ?? 0,
        sessionLabel: json['session_label'] as String,
        startTime: json['start_time'] as String,
        endTime: json['end_time'] as String,
        sortOrder: json['sort_order'] as int? ?? 0,
      );
}
