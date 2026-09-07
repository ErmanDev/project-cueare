import 'package:dart_frog/dart_frog.dart';
import 'package:drift/drift.dart';
import 'package:server/server.dart';

/// GET  /admin/students?q=      — list (optional search on code/name/section)
/// POST /admin/students         — {student_id_code, full_name, section?, photo_url?}
///                                returns the student + `qr_payload`
Future<Response> onRequest(RequestContext context) {
  return guard(() async {
    final db = context.read<AppDatabase>();
    final service = context.read<AttendanceService>();

    switch (context.request.method) {
      case HttpMethod.get:
        final q = queryString(context, 'q');
        final query = db.select(db.students)
          ..orderBy([(s) => OrderingTerm.asc(s.fullName)]);
        if (q != null) {
          final like = '%${StudentCode.escapeLike(q.toLowerCase())}%';
          query.where(
            (s) =>
                s.fullName.lower().like(like, escapeChar: r'\') |
                s.studentIdCode.lower().like(like, escapeChar: r'\') |
                s.section.lower().like(like, escapeChar: r'\'),
          );
        }
        final rows = await query.get();
        return Response.json(
          body: rows
              .map(
                (s) => {...s.toApi(), 'qr_payload': service.qrPayloadFor(s)},
              )
              .toList(),
        );

      case HttpMethod.post:
        final body = await readJsonBody(context);
        final code = StudentCode.requireValid(
          requireString(body, 'student_id_code'),
        );
        final fullName = requireString(body, 'full_name');
        final section = optionalString(body, 'section');
        final photoUrl = optionalString(body, 'photo_url');

        final exists = await (db.select(
          db.students,
        )..where((s) => s.studentIdCode.equals(code))).getSingleOrNull();
        if (exists != null)
          throw conflict('Student code "$code" already exists');

        final id = await db
            .into(db.students)
            .insert(
              StudentsCompanion.insert(
                studentIdCode: code,
                fullName: fullName,
                section: Value(section),
                photoUrl: Value(photoUrl),
              ),
            );
        final created = await (db.select(
          db.students,
        )..where((s) => s.id.equals(id))).getSingle();
        return Response.json(
          statusCode: 201,
          body: {
            ...created.toApi(),
            'qr_payload': service.qrPayloadFor(created),
          },
        );

      default:
        return methodNotAllowed();
    }
  });
}
