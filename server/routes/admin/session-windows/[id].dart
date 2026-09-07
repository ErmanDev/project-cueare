import 'package:dart_frog/dart_frog.dart';
import 'package:drift/drift.dart';
import 'package:server/server.dart';

/// PUT    /admin/session-windows/:id  — {session_label?, start_time?, end_time?, sort_order?}
/// DELETE /admin/session-windows/:id
Future<Response> onRequest(RequestContext context, String rawId) {
  return guard(() async {
    final id = parsePathId(rawId);
    final db = context.read<AppDatabase>();
    final service = context.read<AttendanceService>();
    final existing = await (db.select(
      db.sessionWindows,
    )..where((w) => w.id.equals(id))).getSingleOrNull();
    if (existing == null) throw notFound('Session window not found');

    switch (context.request.method) {
      case HttpMethod.get:
        return Response.json(body: existing.toApi());

      case HttpMethod.put:
        final body = await readJsonBody(context);
        final label = optionalString(body, 'session_label');
        final startRaw = optionalString(body, 'start_time');
        final endRaw = optionalString(body, 'end_time');
        final sortOrder = optionalInt(body, 'sort_order');

        if ((startRaw != null && !TimeUtils.isValid(startRaw)) ||
            (endRaw != null && !TimeUtils.isValid(endRaw))) {
          throw badRequest('start_time and end_time must be "HH:mm"');
        }
        final start = startRaw == null
            ? existing.startTime
            : TimeUtils.normalise(startRaw);
        final end = endRaw == null
            ? existing.endTime
            : TimeUtils.normalise(endRaw);
        await service.validateWindow(
          eventId: existing.eventId,
          startTime: start,
          endTime: end,
          excludeId: id,
        );

        await (db.update(
          db.sessionWindows,
        )..where((w) => w.id.equals(id))).write(
          SessionWindowsCompanion(
            sessionLabel: label == null ? const Value.absent() : Value(label),
            startTime: Value(start),
            endTime: Value(end),
            sortOrder: sortOrder == null
                ? const Value.absent()
                : Value(sortOrder),
          ),
        );
        final updated = await (db.select(
          db.sessionWindows,
        )..where((w) => w.id.equals(id))).getSingle();
        return Response.json(body: updated.toApi());

      case HttpMethod.delete:
        final scans =
            await (db.selectOnly(db.attendanceLogs)
                  ..addColumns([db.attendanceLogs.id.count()])
                  ..where(db.attendanceLogs.sessionWindowId.equals(id)))
                .map((row) => row.read(db.attendanceLogs.id.count()) ?? 0)
                .getSingle();
        if (scans > 0 && queryString(context, 'force') != 'true') {
          throw conflict(
            'This session has $scans attendance records. '
            'Add ?force=true to delete the session and its records.',
            details: {'code': 'HAS_RECORDS', 'count': scans},
          );
        }
        await (db.delete(
          db.sessionWindows,
        )..where((w) => w.id.equals(id))).go();
        return Response(statusCode: 204);

      default:
        return methodNotAllowed();
    }
  });
}
