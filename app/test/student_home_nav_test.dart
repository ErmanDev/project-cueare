import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ssc_qr_attendance/core/theme/app_theme.dart';
import 'package:ssc_qr_attendance/features/student/student_home_screen.dart';
import 'package:ssc_qr_attendance/features/student/student_providers.dart';
import 'package:ssc_qr_attendance/models/attendance_log_model.dart';
import 'package:ssc_qr_attendance/models/student_event_model.dart';
import 'package:ssc_qr_attendance/models/student_model.dart';
import 'package:ssc_qr_attendance/widgets/app_logo.dart';

void main() {
  testWidgets('student bar is Attendance · Fines · QR · Profile', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          myEventsProvider.overrideWith(
            (ref) async => [
              StudentEventModel(
                id: 1,
                name: 'General Assembly',
                eventDate: DateTime(2026, 9, 14),
                isActive: true,
              ),
            ],
          ),
          myFinesProvider.overrideWith((ref) async => []),
          myAttendanceProvider.overrideWith(
            (ref, code) => Stream.value(<AttendanceLogModel>[]),
          ),
          myStudentProvider.overrideWith(
            (ref, code) async => StudentModel(
              id: 1,
              studentIdCode: code,
              fullName: 'Juan Dela Cruz',
              firstName: 'Juan',
              lastName: 'Dela Cruz',
              course: 'BSIT',
              yearLevel: 1,
              section: 'A',
            ),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.light(),
          home: const MediaQuery(
            data: MediaQueryData(size: Size(390, 844)),
            child: StudentHomeScreen(studentIdCode: '02-26-0011'),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Attendance'), findsOneWidget);
    expect(find.text('Fines'), findsOneWidget);
    expect(find.text('QR'), findsOneWidget);
    expect(find.text('Profile'), findsOneWidget);
    expect(find.byType(AppLogo), findsNothing);
    expect(find.text('Events'), findsOneWidget);
    expect(find.text('General Assembly'), findsOneWidget);

    await tester.tap(find.text('Attendance'));
    await tester.pumpAndSettle();
    expect(find.text('My attendance'), findsOneWidget);

    await tester.tap(find.text('Fines'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(AppBar, 'Fines'), findsOneWidget);

    await tester.tap(find.text('Profile'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(AppBar, 'Profile'), findsOneWidget);
    expect(find.text('Juan Dela Cruz'), findsOneWidget);
    expect(find.text('Student ID'), findsOneWidget);
    expect(find.text('Change password'), findsOneWidget);

    await tester.tap(find.text('Change password'));
    await tester.pumpAndSettle();
    expect(find.text('Current password'), findsOneWidget);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('QR'));
    await tester.pumpAndSettle();
    expect(find.text('Events'), findsOneWidget);
  });
}
