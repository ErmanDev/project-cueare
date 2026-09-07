import 'package:dart_frog/dart_frog.dart';
import 'package:server/server.dart';

/// GET /admin/attendance/export?event_id=&date=&...  → CSV download.
/// Same filters as GET /admin/attendance. Defaults to confirmed rows only
/// unless `status` is given explicitly.
Future<Response> onRequest(RequestContext context) {
  if (context.request.method != HttpMethod.get) {
    return Future.value(methodNotAllowed());
  }
  return guard(() async {
    final db = context.read<AppDatabase>();
    var filter = filterFromQuery(context);
    if (filter.status == null && queryString(context, 'status') == null) {
      filter = AttendanceFilter(
        eventId: filter.eventId,
        studentId: filter.studentId,
        sessionWindowId: filter.sessionWindowId,
        scannedBy: filter.scannedBy,
        status: ScanStatus.confirmed,
        date: filter.date,
        search: filter.search,
        limit: filter.limit,
      );
    }
    final rows = await listAttendance(db, filter);

    final csv = CsvUtils.encode([
      [
        'id',
        'event',
        'student_id_code',
        'student_name',
        'section',
        'session',
        'direction',
        'scanned_at',
        'scanned_by',
        'status',
        'note',
      ],
      for (final r in rows)
        [
          r.log.id,
          r.event?.name,
          r.student?.studentIdCode,
          r.student?.fullName,
          r.student?.section,
          r.window?.sessionLabel,
          r.log.direction,
          r.log.scannedAt.dateTime.toIso8601String(),
          r.scanner?.name,
          r.log.status,
          r.log.deviceNote,
        ],
    ]);

    final stamp = DateTime.now().toIso8601String().substring(0, 10);
    return Response(
      body: csv,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="attendance_$stamp.csv"',
      },
    );
  });
}
