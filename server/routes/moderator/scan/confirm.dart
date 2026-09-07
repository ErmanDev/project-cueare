import 'package:dart_frog/dart_frog.dart';
import 'package:server/server.dart';

/// POST /moderator/scan/confirm
///   {event_id, student_id, session_window_id, direction?, device_note?}
///
/// Writes a `confirmed` row. Direction is re-derived server-side inside a
/// transaction; if a `direction` is supplied and no longer matches (another
/// moderator scanned the same student in between) a 409 is returned.
Future<Response> onRequest(RequestContext context) {
  if (context.request.method != HttpMethod.post) {
    return Future.value(methodNotAllowed());
  }
  return guard(() async {
    final service = context.read<AttendanceService>();
    final db = context.read<AppDatabase>();
    final auth = context.read<AuthUser>();
    final body = await readJsonBody(context);

    final log = await service.confirm(
      eventId: requireInt(body, 'event_id'),
      studentId: requireInt(body, 'student_id'),
      sessionWindowId: requireInt(body, 'session_window_id'),
      scannedBy: auth.id,
      expectedDirection: optionalString(body, 'direction'),
      deviceNote: optionalString(body, 'device_note'),
    );

    final detail = await getAttendanceDetail(db, log.id);
    return Response.json(statusCode: 201, body: detail!.toApi());
  });
}
