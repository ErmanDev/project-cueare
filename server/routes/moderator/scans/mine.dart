import 'package:dart_frog/dart_frog.dart';
import 'package:server/server.dart';

/// GET /moderator/scans/mine?event_id=&date=&status=&limit=
///
/// The calling moderator's own scans. Defaults to today's confirmed scans.
Future<Response> onRequest(RequestContext context) {
  if (context.request.method != HttpMethod.get) {
    return Future.value(methodNotAllowed());
  }
  return guard(() async {
    final db = context.read<AppDatabase>();
    final auth = context.read<AuthUser>();
    final service = context.read<AttendanceService>();

    final statusRaw = queryString(context, 'status');
    final dateRaw = queryString(context, 'date');
    if (statusRaw != null &&
        statusRaw != 'all' &&
        statusRaw != ScanStatus.confirmed &&
        statusRaw != ScanStatus.cancelled) {
      throw badRequest('status must be "confirmed", "cancelled" or "all"');
    }
    DateTime? date;
    if (dateRaw == null) {
      date = service.now();
    } else if (dateRaw != 'all') {
      date = DateTime.tryParse(dateRaw);
      if (date == null) throw badRequest('date must be an ISO date or "all"');
    }

    final filter = AttendanceFilter(
      eventId: queryInt(context, 'event_id'),
      studentId: queryInt(context, 'student_id'),
      sessionWindowId: queryInt(context, 'session_window_id'),
      scannedBy: auth.id, // always restricted to the caller
      status: statusRaw == 'all' ? null : (statusRaw ?? ScanStatus.confirmed),
      date: date,
      search: queryString(context, 'q'),
      limit: queryInt(context, 'limit') ?? 200,
    );

    final rows = await listAttendance(db, filter);
    return Response.json(body: rows.map((r) => r.toApi()).toList());
  });
}
