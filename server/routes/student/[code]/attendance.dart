import 'package:dart_frog/dart_frog.dart';
import 'package:server/server.dart';

/// GET /student/:student_id_code/attendance?event_id=
///   -> confirmed attendance history for that student (newest first)
Future<Response> onRequest(RequestContext context, String code) {
  if (context.request.method != HttpMethod.get) {
    return Future.value(methodNotAllowed());
  }
  return guard(() async {
    final db = context.read<AppDatabase>();
    final safeCode = StudentCode.requireValid(Uri.decodeComponent(code));
    final student = await (db.select(
      db.students,
    )..where((s) => s.studentIdCode.equals(safeCode))).getSingleOrNull();
    if (student == null) throw notFound('No student found for code "$safeCode"');

    final rows = await listAttendance(
      db,
      AttendanceFilter(
        studentId: student.id,
        eventId: queryInt(context, 'event_id'),
        status: ScanStatus.confirmed,
        limit: queryInt(context, 'limit') ?? 500,
      ),
    );
    return Response.json(
      body: {
        'student': student.toApi(),
        'attendance': rows.map((r) => r.toApi()).toList(),
      },
    );
  });
}
