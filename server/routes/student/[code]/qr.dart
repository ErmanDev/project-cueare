import 'package:dart_frog/dart_frog.dart';
import 'package:server/server.dart';

/// GET /student/:student_id_code/qr
///   -> {student, qr_payload}
///
/// No login — students identify themselves by their code. LAN-only,
/// read-only, low stakes.
Future<Response> onRequest(RequestContext context, String code) {
  if (context.request.method != HttpMethod.get) {
    return Future.value(methodNotAllowed());
  }
  return guard(() async {
    final db = context.read<AppDatabase>();
    final service = context.read<AttendanceService>();
    final safeCode = StudentCode.requireValid(Uri.decodeComponent(code));
    final student = await (db.select(
      db.students,
    )..where((s) => s.studentIdCode.equals(safeCode))).getSingleOrNull();
    if (student == null) throw notFound('No student found for code "$safeCode"');
    return Response.json(
      body: {
        'student': student.toApi(),
        'qr_payload': service.qrPayloadFor(student),
      },
    );
  });
}
