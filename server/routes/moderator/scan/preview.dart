import 'package:dart_frog/dart_frog.dart';
import 'package:server/server.dart';

/// POST /moderator/scan/preview
///   {event_id, student_id_code (raw QR payload), session_window_id?}
///   -> {student, computed_session, computed_direction, can_confirm, ...}
///
/// Read-only: nothing is written to the database.
Future<Response> onRequest(RequestContext context) {
  if (context.request.method != HttpMethod.post) {
    return Future.value(methodNotAllowed());
  }
  return guard(() async {
    final service = context.read<AttendanceService>();
    final body = await readJsonBody(context);
    final eventId = requireInt(body, 'event_id');
    final payload =
        optionalString(body, 'student_id_code') ??
        optionalString(body, 'qr_payload');
    if (payload == null) throw badRequest('student_id_code is required');

    final preview = await service.preview(
      eventId: eventId,
      qrPayload: payload,
      sessionWindowId: optionalInt(body, 'session_window_id'),
    );

    final json = preview.toApi();
    if (!preview.direction.canScan) {
      json['message'] =
          'Already timed IN & OUT for ${preview.window.sessionLabel}';
    }
    return Response.json(body: json);
  });
}
