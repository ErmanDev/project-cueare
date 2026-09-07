import 'session_window_model.dart';

class EventModel {
  const EventModel({
    required this.id,
    required this.name,
    required this.eventDate,
    required this.isActive,
    this.createdBy,
    this.sessionWindows = const [],
    this.isToday = false,
    this.currentSessionWindowId,
  });

  final int id;
  final String name;
  final DateTime eventDate;
  final bool isActive;
  final int? createdBy;
  final List<SessionWindowModel> sessionWindows;

  /// Set by the moderator "active events" endpoint.
  final bool isToday;
  final int? currentSessionWindowId;

  factory EventModel.fromJson(Map<String, dynamic> json) => EventModel(
    id: json['id'] as int,
    name: json['name'] as String? ?? '',
    eventDate:
        DateTime.tryParse(json['event_date'] as String? ?? '') ??
        DateTime.now(),
    isActive: json['is_active'] as bool? ?? true,
    createdBy: json['created_by'] as int?,
    sessionWindows: (json['session_windows'] as List<dynamic>? ?? [])
        .map((w) => SessionWindowModel.fromJson(w as Map<String, dynamic>))
        .toList(),
    isToday: json['is_today'] as bool? ?? false,
    currentSessionWindowId: json['current_session_window_id'] as int?,
  );
}
