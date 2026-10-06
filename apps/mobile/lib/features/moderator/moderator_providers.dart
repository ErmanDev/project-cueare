import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/repositories.dart';
import '../../models/attendance_log_model.dart';
import '../../models/event_model.dart';

/// Active events (today's first).
final activeEventsProvider = FutureProvider<List<EventModel>>(
  (ref) => ref.watch(moderatorRepositoryProvider).activeEvents(),
);

/// The event the moderator is scanning for. Defaults to today's event
/// (or the first active one) once events load.
class SelectedEventNotifier extends Notifier<EventModel?> {
  @override
  EventModel? build() {
    final events = ref.watch(activeEventsProvider).value;
    if (events == null || events.isEmpty) return null;
    final current = stateOrNull;
    if (current != null) {
      // Keep selection (with refreshed data) if it still exists.
      final refreshed = events.where((e) => e.id == current.id).firstOrNull;
      if (refreshed != null) return refreshed;
    }
    return events.firstWhere((e) => e.isToday, orElse: () => events.first);
  }

  void select(EventModel e) => state = e;
}

final selectedEventProvider =
    NotifierProvider<SelectedEventNotifier, EventModel?>(
      SelectedEventNotifier.new,
    );

/// Session override: `null` = Auto (server picks by time), otherwise the
/// chosen session window id. Reset when the event changes.
class SessionOverrideNotifier extends Notifier<int?> {
  @override
  int? build() {
    ref.watch(selectedEventProvider.select((e) => e?.id));
    return null;
  }

  void set(int? windowId) => state = windowId;
}

final sessionOverrideProvider = NotifierProvider<SessionOverrideNotifier, int?>(
  SessionOverrideNotifier.new,
);

/// "My scans today" for the selected event.
final myScansProvider = FutureProvider<List<AttendanceLogModel>>((ref) {
  final event = ref.watch(selectedEventProvider);
  return ref.watch(moderatorRepositoryProvider).myScans(eventId: event?.id);
});
