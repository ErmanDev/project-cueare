import 'package:dart_frog/dart_frog.dart';
import 'package:drift/drift.dart';
import 'package:server/server.dart';

/// POST /admin/students/import — bulk import.
///
/// Accepts either:
///   * `Content-Type: text/csv` body with a header row containing
///     `student_id_code, full_name[, section][, photo_url]`, or
///   * JSON `{"csv": "<csv text>"}`, or
///   * JSON `{"students": [{"student_id_code":..., "full_name":..., ...}]}`
///
/// Existing codes are updated (upsert) unless `?mode=skip` is given.
Future<Response> onRequest(RequestContext context) {
  if (context.request.method != HttpMethod.post) {
    return Future.value(methodNotAllowed());
  }
  return guard(() async {
    final db = context.read<AppDatabase>();
    final skipExisting = queryString(context, 'mode') == 'skip';
    final contentType = context.request.headers['content-type'] ?? '';

    List<Map<String, dynamic>> incoming;
    if (contentType.contains('text/csv') ||
        contentType.contains('text/plain')) {
      incoming = _fromCsv(await context.request.body());
    } else {
      final body = await readJsonBody(context);
      if (body['csv'] is String) {
        incoming = _fromCsv(body['csv'] as String);
      } else if (body['students'] is List) {
        incoming = (body['students'] as List)
            .whereType<Map<dynamic, dynamic>>()
            .map((m) => m.cast<String, dynamic>())
            .toList();
      } else {
        throw badRequest('Provide "csv" text or a "students" array');
      }
    }

    var created = 0;
    var updated = 0;
    var skipped = 0;
    final errors = <Map<String, dynamic>>[];

    await db.transaction(() async {
      for (var i = 0; i < incoming.length; i++) {
        final row = incoming[i];
        final code = (row['student_id_code'] ?? row['code'] ?? '')
            .toString()
            .trim();
        final name = (row['full_name'] ?? row['name'] ?? '').toString().trim();
        final section = _nullable(row['section']);
        final photoUrl = _nullable(row['photo_url']);

        if (code.isEmpty || name.isEmpty) {
          errors.add({
            'row': i + 1,
            'error': 'missing student_id_code or full_name',
          });
          continue;
        }
        if (!StudentCode.isValid(code)) {
          errors.add({
            'row': i + 1,
            'error': 'invalid student_id_code',
            'student_id_code': code,
          });
          continue;
        }
        final existing = await (db.select(
          db.students,
        )..where((s) => s.studentIdCode.equals(code))).getSingleOrNull();
        if (existing == null) {
          await db
              .into(db.students)
              .insert(
                StudentsCompanion.insert(
                  studentIdCode: code,
                  fullName: name,
                  section: Value(section),
                  photoUrl: Value(photoUrl),
                ),
              );
          created++;
        } else if (skipExisting) {
          skipped++;
        } else {
          await (db.update(
            db.students,
          )..where((s) => s.id.equals(existing.id))).write(
            StudentsCompanion(
              fullName: Value(name),
              section: Value(section ?? existing.section),
              photoUrl: Value(photoUrl ?? existing.photoUrl),
              updatedAt: Value(pgNow()),
            ),
          );
          updated++;
        }
      }
    });

    return Response.json(
      body: {
        'created': created,
        'updated': updated,
        'skipped': skipped,
        'errors': errors,
        'total_rows': incoming.length,
      },
    );
  });
}

String? _nullable(Object? v) {
  if (v == null) return null;
  final s = v.toString().trim();
  return s.isEmpty ? null : s;
}

List<Map<String, dynamic>> _fromCsv(String text) {
  final rows = CsvUtils.parse(text);
  if (rows.isEmpty) return const [];

  // Header detection: if the first row contains a known header name, map by
  // header; otherwise assume positional (code, name, section, photo_url).
  final first = rows.first
      .map((h) => h.trim().toLowerCase().replaceAll(' ', '_'))
      .toList();
  final knownHeaders = {'student_id_code', 'code', 'full_name', 'name'};
  final hasHeader = first.any(knownHeaders.contains);

  const positional = ['student_id_code', 'full_name', 'section', 'photo_url'];
  final headers = hasHeader ? first : positional;
  final dataRows = hasHeader ? rows.skip(1) : rows;

  return dataRows.map((r) {
    final m = <String, dynamic>{};
    for (var i = 0; i < r.length && i < headers.length; i++) {
      m[headers[i]] = r[i];
    }
    return m;
  }).toList();
}
