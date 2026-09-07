import 'package:dart_frog/dart_frog.dart';
import 'package:server/server.dart';

/// GET /moderator/session-windows?event_id=&mode=auto|manual&override=Morning
///
/// Returns all windows for the event plus which one is `selected` given the
/// mode/override — handy for the Auto/Morning/Afternoon toggle.
Future<Response> onRequest(RequestContext context) {
  if (context.request.method != HttpMethod.get) {
    return Future.value(methodNotAllowed());
  }
  return guard(() async {
    final service = context.read<AttendanceService>();
    final eventId = queryInt(context, 'event_id');
    if (eventId == null) throw badRequest('event_id is required');
    final mode = queryString(context, 'mode') ?? 'auto';
    final override = queryString(context, 'override');

    final windows = await service.windowsForEvent(eventId);
    final now = service.now();

    SessionWindow? selected;
    if (mode == 'manual') {
      if (override == null)
        throw badRequest('override is required in manual mode');
      selected = windows.cast<SessionWindow?>().firstWhere(
        (w) =>
            w!.sessionLabel.toLowerCase() == override.toLowerCase() ||
            w.id.toString() == override,
        orElse: () => null,
      );
      if (selected == null) throw notFound('No session named "$override"');
    } else {
      selected = AttendanceService.pickWindowForTime(windows, now);
    }

    return Response.json(
      body: {
        'server_time': now.toIso8601String(),
        'mode': mode,
        'selected': selected?.toApi(),
        'windows': windows.map((w) => w.toApi()).toList(),
      },
    );
  });
}
