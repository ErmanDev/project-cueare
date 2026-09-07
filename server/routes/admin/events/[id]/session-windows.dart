import 'package:dart_frog/dart_frog.dart';
import 'package:server/server.dart';

/// GET  /admin/events/:id/session-windows
/// POST /admin/events/:id/session-windows  — {session_label, start_time, end_time, sort_order?}
Future<Response> onRequest(RequestContext context, String rawId) {
  return guard(() async {
    final eventId = parsePathId(rawId);
    final db = context.read<AppDatabase>();
    final service = context.read<AttendanceService>();
    final event = await (db.select(
      db.events,
    )..where((e) => e.id.equals(eventId))).getSingleOrNull();
    if (event == null) throw notFound('Event not found');

    switch (context.request.method) {
      case HttpMethod.get:
        final windows = await service.windowsForEvent(eventId);
        return Response.json(body: windows.map((w) => w.toApi()).toList());

      case HttpMethod.post:
        final body = await readJsonBody(context);
        final label = requireString(body, 'session_label');
        final startRaw = requireString(body, 'start_time');
        final endRaw = requireString(body, 'end_time');
        if (!TimeUtils.isValid(startRaw) || !TimeUtils.isValid(endRaw)) {
          throw badRequest('start_time and end_time must be "HH:mm"');
        }
        final start = TimeUtils.normalise(startRaw);
        final end = TimeUtils.normalise(endRaw);
        await service.validateWindow(
          eventId: eventId,
          startTime: start,
          endTime: end,
        );

        var sortOrder = optionalInt(body, 'sort_order');
        if (sortOrder == null) {
          final existing = await service.windowsForEvent(eventId);
          sortOrder = existing.isEmpty
              ? 0
              : existing
                        .map((w) => w.sortOrder)
                        .reduce((a, b) => a > b ? a : b) +
                    1;
        }

        final id = await db
            .into(db.sessionWindows)
            .insert(
              SessionWindowsCompanion.insert(
                eventId: eventId,
                sessionLabel: label,
                startTime: start,
                endTime: end,
                sortOrder: sortOrder,
              ),
            );
        final created = await (db.select(
          db.sessionWindows,
        )..where((w) => w.id.equals(id))).getSingle();
        return Response.json(statusCode: 201, body: created.toApi());

      default:
        return methodNotAllowed();
    }
  });
}
