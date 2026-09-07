import 'package:dart_frog/dart_frog.dart';
import 'package:drift/drift.dart';
import 'package:server/server.dart';

/// GET /moderator/events/active — active events with their session windows.
/// Today's event(s) come first and are flagged `is_today`, so the app can
/// preselect one while still letting the moderator pick another.
Future<Response> onRequest(RequestContext context) {
  if (context.request.method != HttpMethod.get) {
    return Future.value(methodNotAllowed());
  }
  return guard(() async {
    final db = context.read<AppDatabase>();
    final service = context.read<AttendanceService>();
    final now = service.now();

    await service.deactivateExpiredEvents();

    final events =
        await (db.select(db.events)
              ..where((e) => e.isActive.equals(true))
              ..orderBy([(e) => OrderingTerm.desc(e.eventDate)]))
            .get();
    final windows = await (db.select(
      db.sessionWindows,
    )..orderBy([(w) => OrderingTerm.asc(w.sortOrder)])).get();

    final list =
        events
            .where(
              (e) => TimeUtils.isTodayOrFuture(e.eventDate.dateTime, relativeTo: now),
            )
            .map((e) {
              final ws = windows.where((w) => w.eventId == e.id).toList();
              final current = AttendanceService.pickWindowForTime(ws, now);
              return {
                ...e.toApi(now: now),
                'is_today': TimeUtils.isSameDay(e.eventDate.dateTime, now),
                'session_windows': ws.map((w) => w.toApi()).toList(),
                'current_session_window_id': current?.id,
              };
            }).toList()
          ..sort((a, b) {
            final at = a['is_today'] == true ? 0 : 1;
            final bt = b['is_today'] == true ? 0 : 1;
            return at.compareTo(bt);
          });

    return Response.json(
      body: {'server_time': now.toIso8601String(), 'events': list},
    );
  });
}
