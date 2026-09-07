import 'package:dart_frog/dart_frog.dart';
import 'package:drift/drift.dart';
import 'package:server/server.dart';

/// GET  /admin/events          — all events (newest first) with their windows
/// POST /admin/events          — {name, event_date, is_active?, session_windows?: [...]}
Future<Response> onRequest(RequestContext context) {
  return guard(() async {
    final db = context.read<AppDatabase>();
    final auth = context.read<AuthUser>();
    final service = context.read<AttendanceService>();

    switch (context.request.method) {
      case HttpMethod.get:
        await service.deactivateExpiredEvents();
        final events = await (db.select(
          db.events,
        )..orderBy([(e) => OrderingTerm.desc(e.eventDate)])).get();
        final windows = await (db.select(
          db.sessionWindows,
        )..orderBy([(w) => OrderingTerm.asc(w.sortOrder)])).get();
        final now = service.now();
        return Response.json(
          body: events
              .map(
                (e) => {
                  ...e.toApi(now: now),
                  'session_windows': windows
                      .where((w) => w.eventId == e.id)
                      .map((w) => w.toApi())
                      .toList(),
                },
              )
              .toList(),
        );

      case HttpMethod.post:
        final body = await readJsonBody(context);
        final name = requireString(body, 'name');
        final date = parseDate(body, 'event_date');
        service.requireEventDateNotPast(date);
        final isActive = optionalBool(body, 'is_active') ?? true;
        final rawWindows = body['session_windows'];

        final result = await db.transaction(() async {
          final id = await db
              .into(db.events)
              .insert(
                EventsCompanion.insert(
                  name: name,
                  eventDate: pgDateTime(date),
                  isActive: Value(isActive),
                  createdBy: auth.id,
                ),
              );

          // Optional: create windows inline (validated for overlap).
          if (rawWindows is List) {
            var order = 0;
            for (final raw in rawWindows.whereType<Map<dynamic, dynamic>>()) {
              final w = raw.cast<String, dynamic>();
              final label = requireString(w, 'session_label');
              final start = TimeUtils.normalise(requireString(w, 'start_time'));
              final end = TimeUtils.normalise(requireString(w, 'end_time'));
              await service.validateWindow(
                eventId: id,
                startTime: start,
                endTime: end,
              );
              await db
                  .into(db.sessionWindows)
                  .insert(
                    SessionWindowsCompanion.insert(
                      eventId: id,
                      sessionLabel: label,
                      startTime: start,
                      endTime: end,
                      sortOrder: optionalInt(w, 'sort_order') ?? order++,
                    ),
                  );
            }
          }

          final event = await (db.select(
            db.events,
          )..where((e) => e.id.equals(id))).getSingle();
          final windows = await service.windowsForEvent(id);
          return {
            ...event.toApi(now: service.now()),
            'session_windows': windows.map((w) => w.toApi()).toList(),
          };
        });
        return Response.json(statusCode: 201, body: result);

      default:
        return methodNotAllowed();
    }
  });
}
