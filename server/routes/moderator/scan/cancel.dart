import 'package:dart_frog/dart_frog.dart';
import 'package:server/server.dart';

/// POST /moderator/scan/cancel
///   {event_id, student_id, session_window_id, direction?, device_note?}
///
/// Records a `cancelled` audit row. Cancelled rows never affect the IN/OUT
/// computation. The app may fire-and-forget this call.
Future<Response> onRequest(RequestContext context) {
  if (context.request.method != HttpMethod.post) {
    return Future.value(methodNotAllowed());
  }
  return guard(() async {
    final service = context.read<AttendanceService>();
    final auth = context.read<AuthUser>();
    final body = await readJsonBody(context);

    final log = await service.cancel(
      eventId: requireInt(body, 'event_id'),
      studentId: requireInt(body, 'student_id'),
      sessionWindowId: requireInt(body, 'session_window_id'),
      scannedBy: auth.id,
      direction: optionalString(body, 'direction'),
      deviceNote: optionalString(body, 'device_note'),
    );
    return Response.json(statusCode: 201, body: log.toApi());
  });
}
