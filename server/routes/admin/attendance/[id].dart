import 'package:dart_frog/dart_frog.dart';
import 'package:drift/drift.dart';
import 'package:server/server.dart';

/// GET    /admin/attendance/:id
/// PUT    /admin/attendance/:id  — manual correction:
///                                 {direction?, session_window_id?, status?, scanned_at?, device_note?}
/// DELETE /admin/attendance/:id
Future<Response> onRequest(RequestContext context, String rawId) {
  return guard(() async {
    final id = parsePathId(rawId);
    final db = context.read<AppDatabase>();
    final existing = await getAttendanceDetail(db, id);
    if (existing == null) throw notFound('Attendance record not found');

    switch (context.request.method) {
      case HttpMethod.get:
        return Response.json(body: existing.toApi());

      case HttpMethod.put:
        final body = await readJsonBody(context);
        final direction = optionalString(body, 'direction');
        final status = optionalString(body, 'status');
        final windowId = optionalInt(body, 'session_window_id');
        final scannedAtRaw = optionalString(body, 'scanned_at');
        final hasNote = body.containsKey('device_note');
        final note = optionalString(body, 'device_note');

        if (direction != null &&
            direction != Direction.in_ &&
            direction != Direction.out) {
          throw badRequest('direction must be "IN" or "OUT"');
        }
        if (status != null &&
            status != ScanStatus.confirmed &&
            status != ScanStatus.cancelled) {
          throw badRequest('status must be "confirmed" or "cancelled"');
        }
        if (windowId != null) {
          final w = await (db.select(
            db.sessionWindows,
          )..where((t) => t.id.equals(windowId))).getSingleOrNull();
          if (w == null || w.eventId != existing.log.eventId) {
            throw badRequest('session_window_id does not belong to this event');
          }
        }
        DateTime? scannedAt;
        if (scannedAtRaw != null) {
          scannedAt = DateTime.tryParse(scannedAtRaw);
          if (scannedAt == null) {
            throw badRequest('scanned_at must be an ISO-8601 timestamp');
          }
        }

        await (db.update(
          db.attendanceLogs,
        )..where((t) => t.id.equals(id))).write(
          AttendanceLogsCompanion(
            direction: direction == null
                ? const Value.absent()
                : Value(direction),
            status: status == null ? const Value.absent() : Value(status),
            sessionWindowId: windowId == null
                ? const Value.absent()
                : Value(windowId),
            scannedAt: scannedAt == null
                ? const Value.absent()
                : Value(pgDateTime(scannedAt)),
            deviceNote: hasNote ? Value(note) : const Value.absent(),
            updatedAt: Value(pgNow()),
          ),
        );
        final updated = await getAttendanceDetail(db, id);
        return Response.json(body: updated!.toApi());

      case HttpMethod.delete:
        await (db.delete(
          db.attendanceLogs,
        )..where((t) => t.id.equals(id))).go();
        return Response(statusCode: 204);

      default:
        return methodNotAllowed();
    }
  });
}
