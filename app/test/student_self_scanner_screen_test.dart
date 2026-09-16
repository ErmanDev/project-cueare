import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ssc_qr_attendance/core/api/repositories.dart';
import 'package:ssc_qr_attendance/core/theme/app_theme.dart';
import 'package:ssc_qr_attendance/features/student/student_self_scanner_screen.dart';
import 'package:ssc_qr_attendance/models/self_scan_result_model.dart';

class FakeStudentRepository implements StudentRepository {
  SelfScanResultModel? mockResult;
  String? lastToken;
  Object? mockError;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);

  @override
  Future<SelfScanResultModel> selfScan(String qrToken) async {
    lastToken = qrToken;
    if (mockError != null) throw mockError!;
    return mockResult ??
        const SelfScanResultModel(
          scanResultCode: 'ACCEPTED',
          message: 'Attendance recorded successfully',
          eventName: 'General Assembly',
          sessionName: 'Morning Session',
        );
  }
}

void main() {
  late FakeStudentRepository fakeRepo;

  setUp(() {
    fakeRepo = FakeStudentRepository();
  });

  Widget buildWidget() {
    return ProviderScope(
      overrides: [
        studentRepositoryProvider.overrideWithValue(fakeRepo),
      ],
      child: MaterialApp(
        theme: AppTheme.light(),
        home: const StudentSelfScannerScreen(),
      ),
    );
  }

  testWidgets('renders desktop placeholder and handles manual token entry success', (
    tester,
  ) async {
    debugDefaultTargetPlatformOverride = TargetPlatform.windows;
    try {
      await tester.pumpWidget(buildWidget());
      await tester.pump();

      expect(find.text('Scan Venue QR'), findsOneWidget);
      expect(find.text('Enter token'), findsOneWidget);

      await tester.tap(find.text('Enter token'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.text('Enter venue QR token'), findsOneWidget);

      await tester.enterText(find.byType(TextField), 'VALID_VENUE_TOKEN');
      await tester.tap(find.text('Submit'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      expect(fakeRepo.lastToken, 'VALID_VENUE_TOKEN');
      expect(find.text('Attendance Recorded'), findsOneWidget);
      expect(find.text('General Assembly — Morning Session'), findsOneWidget);

      await tester.tap(find.text('Scan another'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      expect(find.text('Attendance Recorded'), findsNothing);
    } finally {
      debugDefaultTargetPlatformOverride = null;
    }
  });

  testWidgets('handles selfScan rejection result', (tester) async {
    debugDefaultTargetPlatformOverride = TargetPlatform.windows;
    try {
      fakeRepo.mockResult = const SelfScanResultModel(
        scanResultCode: 'REJECTED',
        message: 'Outside session window',
      );

      await tester.pumpWidget(buildWidget());
      await tester.pump();

      await tester.tap(find.text('Enter token'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      await tester.enterText(find.byType(TextField), 'EXPIRED_TOKEN');
      await tester.tap(find.text('Submit'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      expect(fakeRepo.lastToken, 'EXPIRED_TOKEN');
      expect(find.text('Scan Rejected'), findsOneWidget);
      expect(find.text('Outside session window'), findsOneWidget);
    } finally {
      debugDefaultTargetPlatformOverride = null;
    }
  });
}
