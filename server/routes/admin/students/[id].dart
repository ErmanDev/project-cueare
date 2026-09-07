import 'package:dart_frog/dart_frog.dart';
import 'package:drift/drift.dart';
import 'package:server/server.dart';

/// GET    /admin/students/:id
/// PUT    /admin/students/:id  — {student_id_code?, full_name?, section?, photo_url?}
/// DELETE /admin/students/:id  — cascades to their attendance logs
Future<Response> onRequest(RequestContext context, String rawId) {
  return guard(() async {
    final id = parsePathId(rawId);
    final db = context.read<AppDatabase>();
    final service = context.read<AttendanceService>();
    final existing = await (db.select(
      db.students,
    )..where((s) => s.id.equals(id))).getSingleOrNull();
    if (existing == null) throw notFound('Student not found');

    switch (context.request.method) {
      case HttpMethod.get:
        return Response.json(
          body: {
            ...existing.toApi(),
            'qr_payload': service.qrPayloadFor(existing),
          },
        );

      case HttpMethod.put:
        final body = await readJsonBody(context);
        final code = optionalString(body, 'student_id_code');
        final fullName = optionalString(body, 'full_name');
        // Allow clearing section/photo by passing "" or null explicitly.
        final hasSection = body.containsKey('section');
        final hasPhoto = body.containsKey('photo_url');
        final section = optionalString(body, 'section');
        final photoUrl = optionalString(body, 'photo_url');
        final safeCode = code == null ? null : StudentCode.requireValid(code);

        if (safeCode != null && safeCode != existing.studentIdCode) {
          final taken =
              await (db.select(db.students)
                    ..where((s) => s.studentIdCode.equals(safeCode))
                    ..where((s) => s.id.equals(id).not()))
                  .getSingleOrNull();
          if (taken != null)
            throw conflict('Student code "$safeCode" already exists');
        }

        await (db.update(db.students)..where((s) => s.id.equals(id))).write(
          StudentsCompanion(
            studentIdCode: safeCode == null
                ? const Value.absent()
                : Value(safeCode),
            fullName: fullName == null ? const Value.absent() : Value(fullName),
            section: hasSection ? Value(section) : const Value.absent(),
            photoUrl: hasPhoto ? Value(photoUrl) : const Value.absent(),
            updatedAt: Value(pgNow()),
          ),
        );
        final updated = await (db.select(
          db.students,
        )..where((s) => s.id.equals(id))).getSingle();
        return Response.json(
          body: {
            ...updated.toApi(),
            'qr_payload': service.qrPayloadFor(updated),
          },
        );

      case HttpMethod.delete:
        await (db.delete(db.students)..where((s) => s.id.equals(id))).go();
        return Response(statusCode: 204);

      default:
        return methodNotAllowed();
    }
  });
}
