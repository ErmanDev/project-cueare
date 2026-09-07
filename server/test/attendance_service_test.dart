import 'package:drift/drift.dart' hide isNull, isNotNull;
import 'package:server/server.dart';
import 'package:test/test.dart';

void main() {
  late AppDatabase db;
  late AttendanceService service;
  late DateTime fakeNow;

  late int adminId;
  late int moderatorId;
  late int eventId;
  late int morningId;
  late int afternoonId;
  late int studentId;

  setUp(() async {
    db = AppDatabase.inMemory();
    fakeNow = DateTime(2026, 9, 5, 8, 30); // 08:30 → Morning
    service = AttendanceService(db, clock: () => fakeNow);

    adminId = await db
        .into(db.users)
        .insert(
          UsersCompanion.insert(
            name: 'Admin',
            username: 'admin',
            passwordHash: PasswordHasher.hash('x'),
            role: Roles.superadmin,
          ),
        );
    moderatorId = await db
        .into(db.users)
        .insert(
          UsersCompanion.insert(
            name: 'Mod',
            username: 'mod',
            passwordHash: PasswordHasher.hash('x'),
            role: Roles.moderator,
          ),
        );
    eventId = await db
        .into(db.events)
        .insert(
          EventsCompanion.insert(
            name: 'Founders Day',
            eventDate: pgDateTime(DateTime(2026, 9, 5)),
            createdBy: adminId,
          ),
        );
    morningId = await db
        .into(db.sessionWindows)
        .insert(
          SessionWindowsCompanion.insert(
            eventId: eventId,
            sessionLabel: 'Morning',
            startTime: '07:00',
            endTime: '12:00',
            sortOrder: 0,
          ),
        );
    afternoonId = await db
        .into(db.sessionWindows)
        .insert(
          SessionWindowsCompanion.insert(
            eventId: eventId,
            sessionLabel: 'Afternoon',
            startTime: '13:00',
            endTime: '17:00',
            sortOrder: 1,
          ),
        );
    studentId = await db
        .into(db.students)
        .insert(
          StudentsCompanion.insert(
            studentIdCode: 'STU-2026-0001',
            fullName: 'Juan Dela Cruz',
            section: const Value('BSIT-3A'),
          ),
        );
  });

  tearDown(() => db.close());

  group('determineDirection', () {
    test('first scan in a session is IN', () async {
      final r = await service.determineDirection(
        eventId: eventId,
        studentId: studentId,
        sessionWindowId: morningId,
      );
      expect(r.direction, Direction.in_);
      expect(r.canScan, isTrue);
    });

    test('second scan in the same session is OUT', () async {
      await service.confirm(
        eventId: eventId,
        studentId: studentId,
        sessionWindowId: morningId,
        scannedBy: moderatorId,
      );
      final r = await service.determineDirection(
        eventId: eventId,
        studentId: studentId,
        sessionWindowId: morningId,
      );
      expect(r.direction, Direction.out);
    });

    test('third scan in the same session is rejected', () async {
      final first = await service.confirm(
        eventId: eventId,
        studentId: studentId,
        sessionWindowId: morningId,
        scannedBy: moderatorId,
      );
      final second = await service.confirm(
        eventId: eventId,
        studentId: studentId,
        sessionWindowId: morningId,
        scannedBy: moderatorId,
      );
      expect(first.direction, Direction.in_);
      expect(second.direction, Direction.out);

      final r = await service.determineDirection(
        eventId: eventId,
        studentId: studentId,
        sessionWindowId: morningId,
      );
      expect(r.direction, Direction.alreadyComplete);
      expect(r.canScan, isFalse);

      expect(
        () => service.confirm(
          eventId: eventId,
          studentId: studentId,
          sessionWindowId: morningId,
          scannedBy: moderatorId,
        ),
        throwsA(
          isA<ApiException>().having((e) => e.statusCode, 'status', 409),
        ),
      );
    });

    test('cancelled scans do not affect the count', () async {
      await service.cancel(
        eventId: eventId,
        studentId: studentId,
        sessionWindowId: morningId,
        scannedBy: moderatorId,
      );
      await service.cancel(
        eventId: eventId,
        studentId: studentId,
        sessionWindowId: morningId,
        scannedBy: moderatorId,
      );
      final r = await service.determineDirection(
        eventId: eventId,
        studentId: studentId,
        sessionWindowId: morningId,
      );
      expect(r.direction, Direction.in_);
      expect(r.existing, isEmpty);
    });

    test(
      'sessions are independent: IN in Morning, then IN in Afternoon',
      () async {
        await service.confirm(
          eventId: eventId,
          studentId: studentId,
          sessionWindowId: morningId,
          scannedBy: moderatorId,
        );
        final r = await service.determineDirection(
          eventId: eventId,
          studentId: studentId,
          sessionWindowId: afternoonId,
        );
        expect(r.direction, Direction.in_);
      },
    );

    test(
      'confirm rejects a stale expected direction (race between moderators)',
      () async {
        // Moderator A previews → IN. Moderator B confirms IN first.
        await service.confirm(
          eventId: eventId,
          studentId: studentId,
          sessionWindowId: morningId,
          scannedBy: moderatorId,
        );
        // Moderator A now confirms with the stale "IN".
        expect(
          () => service.confirm(
            eventId: eventId,
            studentId: studentId,
            sessionWindowId: morningId,
            scannedBy: moderatorId,
            expectedDirection: Direction.in_,
          ),
          throwsA(
            isA<ApiException>()
                .having((e) => e.statusCode, 'status', 409)
                .having((e) => e.details?['code'], 'code', 'DIRECTION_CHANGED'),
          ),
        );
      },
    );
  });

  group('session window resolution', () {
    test('auto picks the window containing server time', () async {
      final w = await service.autoDetectWindow(eventId);
      expect(w?.id, morningId);

      fakeNow = DateTime(2026, 9, 5, 14, 0);
      final w2 = await service.autoDetectWindow(eventId);
      expect(w2?.id, afternoonId);
    });

    test('auto returns null between / after windows', () async {
      fakeNow = DateTime(2026, 9, 5, 12, 30);
      expect(await service.autoDetectWindow(eventId), isNull);
      fakeNow = DateTime(2026, 9, 5, 18, 0);
      expect(await service.autoDetectWindow(eventId), isNull);
    });

    test('end time is exclusive', () async {
      fakeNow = DateTime(2026, 9, 5, 12, 0);
      expect(await service.autoDetectWindow(eventId), isNull);
      fakeNow = DateTime(2026, 9, 5, 11, 59);
      expect((await service.autoDetectWindow(eventId))?.id, morningId);
    });

    test(
      'preview in auto mode outside windows returns 422 with options',
      () async {
        fakeNow = DateTime(2026, 9, 5, 18, 0);
        expect(
          () => service.preview(eventId: eventId, qrPayload: 'STU-2026-0001'),
          throwsA(
            isA<ApiException>()
                .having((e) => e.statusCode, 'status', 422)
                .having((e) => e.details?['code'], 'code', 'NO_ACTIVE_WINDOW'),
          ),
        );
      },
    );

    test('manual override rejected before chosen session starts', () async {
      // Morning is open at 08:30; Afternoon has not started.
      await expectLater(
        service.preview(
          eventId: eventId,
          qrPayload: 'STU-2026-0001',
          sessionWindowId: afternoonId,
        ),
        throwsA(
          isA<ApiException>()
              .having((e) => e.statusCode, 'status', 409)
              .having((e) => e.details?['code'], 'code', 'SESSION_NOT_STARTED'),
        ),
      );
    });

    test('manual override works while the chosen session is open', () async {
      fakeNow = DateTime(2026, 9, 5, 14, 0);
      final p = await service.preview(
        eventId: eventId,
        qrPayload: 'STU-2026-0001',
        sessionWindowId: afternoonId,
      );
      expect(p.window.id, afternoonId);
      expect(p.sessionMode, 'manual');
      expect(p.direction.direction, Direction.in_);
    });

    test('rejects scans before the session start time', () async {
      fakeNow = DateTime(2026, 9, 5, 6, 30);
      await expectLater(
        service.preview(
          eventId: eventId,
          qrPayload: 'STU-2026-0001',
          sessionWindowId: morningId,
        ),
        throwsA(
          isA<ApiException>()
              .having((e) => e.statusCode, 'status', 409)
              .having(
                (e) => e.details?['code'],
                'code',
                'SESSION_NOT_STARTED',
              ),
        ),
      );
    });

    test('rejects scans on a different day than the event', () async {
      fakeNow = DateTime(2026, 9, 4, 8, 30);
      await expectLater(
        service.preview(
          eventId: eventId,
          qrPayload: 'STU-2026-0001',
          sessionWindowId: morningId,
        ),
        throwsA(
          isA<ApiException>()
              .having((e) => e.statusCode, 'status', 409)
              .having((e) => e.details?['code'], 'code', 'EVENT_NOT_TODAY'),
        ),
      );
    });

    test('manual override still requires the session to be open', () async {
      fakeNow = DateTime(2026, 9, 5, 18, 0);
      await expectLater(
        service.preview(
          eventId: eventId,
          qrPayload: 'STU-2026-0001',
          sessionWindowId: afternoonId,
        ),
        throwsA(
          isA<ApiException>()
              .having((e) => e.statusCode, 'status', 409)
              .having((e) => e.details?['code'], 'code', 'SESSION_ENDED'),
        ),
      );
    });

    test('override window from another event is rejected', () async {
      final otherEvent = await db
          .into(db.events)
          .insert(
            EventsCompanion.insert(
              name: 'Other',
              eventDate: pgDateTime(DateTime(2026, 9, 6)),
              createdBy: adminId,
            ),
          );
      final otherWindow = await db
          .into(db.sessionWindows)
          .insert(
            SessionWindowsCompanion.insert(
              eventId: otherEvent,
              sessionLabel: 'Morning',
              startTime: '07:00',
              endTime: '12:00',
              sortOrder: 0,
            ),
          );
      expect(
        () => service.preview(
          eventId: eventId,
          qrPayload: 'STU-2026-0001',
          sessionWindowId: otherWindow,
        ),
        throwsA(isA<ApiException>().having((e) => e.statusCode, 'status', 404)),
      );
    });
  });

  group('preview', () {
    test('unknown student code → 404', () async {
      expect(
        () => service.preview(eventId: eventId, qrPayload: 'NOPE'),
        throwsA(isA<ApiException>().having((e) => e.statusCode, 'status', 404)),
      );
    });

    test('inactive event → 409', () async {
      await (db.update(db.events)..where((e) => e.id.equals(eventId))).write(
        const EventsCompanion(isActive: Value(false)),
      );
      await expectLater(
        service.preview(eventId: eventId, qrPayload: 'STU-2026-0001'),
        throwsA(isA<ApiException>().having((e) => e.statusCode, 'status', 409)),
      );
    });

    test('past event date is invalid automatically', () async {
      fakeNow = DateTime(2026, 9, 6, 8, 30); // day after the event
      await expectLater(
        service.preview(
          eventId: eventId,
          qrPayload: 'STU-2026-0001',
          sessionWindowId: morningId,
        ),
        throwsA(
          isA<ApiException>()
              .having((e) => e.statusCode, 'status', 409)
              .having((e) => e.details?['code'], 'code', 'EVENT_DATE_PASSED'),
        ),
      );
      final event = await (db.select(
        db.events,
      )..where((e) => e.id.equals(eventId))).getSingle();
      expect(event.isActive, isFalse);
    });

    test('preview writes nothing', () async {
      await service.preview(eventId: eventId, qrPayload: 'STU-2026-0001');
      final rows = await db.select(db.attendanceLogs).get();
      expect(rows, isEmpty);
    });
  });

  group('event date rules', () {
    test('rejects creating/updating with a past event_date', () {
      fakeNow = DateTime(2026, 9, 5, 8, 30);
      expect(
        () => service.requireEventDateNotPast(DateTime(2026, 9, 4)),
        throwsA(
          isA<ApiException>()
              .having((e) => e.statusCode, 'status', 400)
              .having((e) => e.details?['code'], 'code', 'PAST_EVENT_DATE'),
        ),
      );
      expect(
        () => service.requireEventDateNotPast(DateTime(2026, 9, 5)),
        returnsNormally,
      );
      expect(
        () => service.requireEventDateNotPast(DateTime(2026, 9, 6)),
        returnsNormally,
      );
    });

    test('deactivateExpiredEvents turns off past active events', () async {
      fakeNow = DateTime(2026, 9, 6, 10, 0);
      final n = await service.deactivateExpiredEvents();
      expect(n, 1);
      final event = await (db.select(
        db.events,
      )..where((e) => e.id.equals(eventId))).getSingle();
      expect(event.isActive, isFalse);
    });
  });

  group('QR payloads', () {
    test('plain code passes through when HMAC disabled', () {
      expect(service.studentCodeFromPayload(' STU-1 '), 'STU-1');
    });

    test('signed payload verified when HMAC enabled', () async {
      final signed = AttendanceService(db, qrHmacSecret: 'secret');
      final student = await db.select(db.students).getSingle();
      final payload = signed.qrPayloadFor(student);
      expect(signed.studentCodeFromPayload(payload), student.studentIdCode);

      expect(
        () => signed.studentCodeFromPayload(student.studentIdCode),
        throwsA(isA<ApiException>().having((e) => e.statusCode, 'status', 400)),
      );
      expect(
        () => signed.studentCodeFromPayload(
          '{"sid":"STU-2026-0001","sig":"bad"}',
        ),
        throwsA(isA<ApiException>().having((e) => e.statusCode, 'status', 400)),
      );
    });

    test('rejects SQL-injection style QR payloads', () {
      const attacks = [
        "'; DROP TABLE students;--",
        "1' OR '1'='1",
        'STU-1; SELECT * FROM users',
        '{"sid":"x\' OR 1=1--","sig":"x"}',
        '{"sid":"../../../etc/passwd"}',
      ];
      for (final attack in attacks) {
        expect(
          () => service.studentCodeFromPayload(attack),
          throwsA(
            isA<ApiException>().having((e) => e.statusCode, 'status', 400),
          ),
          reason: 'should reject: $attack',
        );
      }
    });

    test('rejects oversized QR payloads', () {
      expect(
        () => service.studentCodeFromPayload('A' * 600),
        throwsA(
          isA<ApiException>().having(
            (e) => e.details?['code'],
            'code',
            'QR_PAYLOAD_TOO_LARGE',
          ),
        ),
      );
    });
  });

  group('validateWindow', () {
    test('rejects overlapping windows on the same event', () async {
      expect(
        () => service.validateWindow(
          eventId: eventId,
          startTime: '11:00',
          endTime: '13:30',
        ),
        throwsA(
          isA<ApiException>()
              .having((e) => e.statusCode, 'status', 409)
              .having((e) => e.details?['code'], 'code', 'WINDOW_OVERLAP'),
        ),
      );
    });

    test('allows adjacent windows and edits of itself', () async {
      await service.validateWindow(
        eventId: eventId,
        startTime: '12:00',
        endTime: '13:00',
      );
      await service.validateWindow(
        eventId: eventId,
        startTime: '07:30',
        endTime: '12:00',
        excludeId: morningId,
      );
    });

    test('rejects start >= end and bad formats', () async {
      expect(
        () => service.validateWindow(
          eventId: eventId,
          startTime: '10:00',
          endTime: '09:00',
        ),
        throwsA(isA<ApiException>().having((e) => e.statusCode, 'status', 400)),
      );
      expect(
        () => service.validateWindow(
          eventId: eventId,
          startTime: '25:00',
          endTime: '09:00',
        ),
        throwsA(isA<ApiException>().having((e) => e.statusCode, 'status', 400)),
      );
    });
  });

  group('PasswordHasher', () {
    test('verifies correct password and rejects wrong one', () {
      final h = PasswordHasher.hash('changeme123', iterations: 1000);
      expect(PasswordHasher.verify('changeme123', h), isTrue);
      expect(PasswordHasher.verify('wrong', h), isFalse);
      expect(PasswordHasher.verify('changeme123', 'garbage'), isFalse);
    });
  });
}
