import 'package:dart_frog/dart_frog.dart';
import 'package:server/server.dart';

/// GET /admin/attendance?event_id=&date=&student_id=&session_window_id=&status=&scanned_by=&q=&limit=
Future<Response> onRequest(RequestContext context) {
  if (context.request.method != HttpMethod.get) {
    return Future.value(methodNotAllowed());
  }
  return guard(() async {
    final db = context.read<AppDatabase>();
    final rows = await listAttendance(db, filterFromQuery(context));
    return Response.json(body: rows.map((r) => r.toApi()).toList());
  });
}
