import 'package:dart_frog/dart_frog.dart';
import 'package:drift/drift.dart';
import 'package:server/server.dart';

/// GET    /admin/events/:id
/// PUT    /admin/events/:id  — {name?, event_date?, is_active?}
/// DELETE /admin/events/:id  — cascades to windows + attendance logs
Future<Response> onRequest(RequestContext context, String rawId) {
  return guard(() async {
    final id = parsePathId(rawId);
    final db = context.read<AppDatabase>();
    final service = context.read<AttendanceService>();
    final existing = await (db.select(
      db.events,
    )..where((e) => e.id.equals(id))).getSingleOrNull();
    if (existing == null) throw notFound('Event not found');

    switch (context.request.method) {
      case HttpMethod.get:
        await service.deactivateExpiredEvents();
        final refreshed = await (db.select(
          db.events,
        )..where((e) => e.id.equals(id))).getSingleOrNull();
        if (refreshed == null) throw notFound('Event not found');
        final windows = await service.windowsForEvent(id);
        return Response.json(
          body: {
            ...refreshed.toApi(now: service.now()),
            'session_windows': windows.map((w) => w.toApi()).toList(),
          },
        );

      case HttpMethod.put:
        final body = await readJsonBody(context);
        final name = optionalString(body, 'name');
        final date = body.containsKey('event_date')
            ? parseDate(body, 'event_date')
            : null;
        if (date != null) service.requireEventDateNotPast(date);
        final isActive = optionalBool(body, 'is_active');
        if (isActive ?? false) {
          service.requireEventDateNotPast(
            date ?? existing.eventDate.dateTime,
          );
        }

        await (db.update(db.events)..where((e) => e.id.equals(id))).write(
          EventsCompanion(
            name: name == null ? const Value.absent() : Value(name),
            eventDate: date == null
                ? const Value.absent()
                : Value(pgDateTime(date)),
            isActive: isActive == null ? const Value.absent() : Value(isActive),
            updatedAt: Value(pgNow()),
          ),
        );
        final updated = await (db.select(
          db.events,
        )..where((e) => e.id.equals(id))).getSingle();
        final windows = await service.windowsForEvent(id);
        return Response.json(
          body: {
            ...updated.toApi(now: service.now()),
            'session_windows': windows.map((w) => w.toApi()).toList(),
          },
        );

      case HttpMethod.delete:
        await (db.delete(db.events)..where((e) => e.id.equals(id))).go();
        return Response(statusCode: 204);

      default:
        return methodNotAllowed();
    }
  });
}
