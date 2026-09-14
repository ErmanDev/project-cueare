import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:ssc_qr_attendance/core/api/api_client.dart';
import 'package:ssc_qr_attendance/core/local/local_db.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late LocalDb db;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    db = await LocalDb.open();
  });

  test('seeds admin and logs in without a server', () {
    final user = db.login('admin', 'changeme123');
    expect(user.username, 'admin');
    expect(user.role.name, 'superadmin');
  });

  test('rejects a bad password', () {
    expect(
      () => db.login('admin', 'wrong'),
      throwsA(isA<ApiFailure>().having((e) => e.statusCode, 'status', 401)),
    );
  });

  test('deletes an event that still has session windows', () async {
    final events = db.events();
    expect(events, isNotEmpty);
    final id = events.first.id;
    expect(events.first.sessionWindows, isNotEmpty);
    await db.deleteEvent(id);
    expect(db.events().where((e) => e.id == id), isEmpty);
  });

  test('student QR lookup and IN/OUT scan work on device', () async {
    db.login('moderator', 'changeme123');
    final student = db.myQr('STU-2026-0001');
    expect(student.fullName, 'Juan Dela Cruz');

    var event = db.activeEvents().first;
    for (final extra in event.sessionWindows.skip(1).toList()) {
      await db.deleteSessionWindow(extra.id, force: true);
    }
    event = db.event(event.id);
    await db.updateSessionWindow(
      event.sessionWindows.first.id,
      start: '00:00',
      end: '23:59',
    );
    event = db.event(event.id);

    final preview = db.preview(
      eventId: event.id,
      qrPayload: 'STU-2026-0001',
    );
    expect(preview.computedDirection, 'IN');
    expect(preview.canConfirm, isTrue);
    final log = await db.confirm(preview);
    expect(log.direction, 'IN');
    expect(log.status, 'confirmed');

    final second = db.preview(
      eventId: event.id,
      qrPayload: 'STU-2026-0001',
    );
    expect(second.computedDirection, 'OUT');
  });
}
