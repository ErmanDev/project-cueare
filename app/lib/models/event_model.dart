import '../core/utils/json_values.dart';
import 'session_window_model.dart';

class EventModel {
  const EventModel({
    required this.id,
    required this.name,
    required this.eventDate,
    required this.isActive,
    this.isExpired = false,
    this.createdBy,
    this.sessionWindows = const [],
    this.isToday = false,
    this.currentSessionWindowId,
    this.participantCount = 0,
  });

  final int id;
  final String name;
  final DateTime eventDate;
  final bool isActive;
  final bool isExpired;
  final int? createdBy;
  final List<SessionWindowModel> sessionWindows;

  /// Set by the moderator "active events" endpoint.
  final bool isToday;
  final int? currentSessionWindowId;
  final int participantCount;

  factory EventModel.fromJson(Map<String, dynamic> json) => EventModel(
    id: asInt(json['id']) ?? 0,
    name: json['name'] as String? ?? '',
    eventDate:
        DateTime.tryParse(json['event_date'] as String? ?? '') ??
        DateTime.now(),
    isActive: json['is_active'] as bool? ?? true,
    isExpired: json['is_expired'] as bool? ?? false,
    createdBy: json['created_by'] as int?,
    sessionWindows: (json['session_windows'] as List<dynamic>? ?? [])
        .map((w) => SessionWindowModel.fromJson(w as Map<String, dynamic>))
        .toList(),
    isToday: json['is_today'] as bool? ?? false,
    currentSessionWindowId: json['current_session_window_id'] as int?,
    participantCount: asInt(json['participant_count']) ?? 0,
  );
}
