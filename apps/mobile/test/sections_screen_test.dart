import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ssc_qr_attendance/core/theme/app_theme.dart';
import 'package:ssc_qr_attendance/features/superadmin/admin_providers.dart';
import 'package:ssc_qr_attendance/features/superadmin/sections/sections_screen.dart';
import 'package:ssc_qr_attendance/models/section_model.dart';

SectionModel _section({
  required int id,
  required String code,
  required String name,
  required String programCode,
  required String programName,
  int yearLevel = 1,
  int enrolled = 12,
}) {
  return SectionModel(
    sectionId: id,
    sectionCode: code,
    sectionName: name,
    yearLevel: yearLevel,
    academicTermId: 1,
    termCode: '1S',
    termName: 'First Semester',
    yearCode: '2026-2027',
    academicProgramId: programCode.hashCode,
    programCode: programCode,
    programName: programName,
    enrolledStudentCount: enrolled,
  );
}

Widget _app({
  required List<SectionModel> sections,
  SectionBreakdown? detail,
  Size size = const Size(390, 844),
}) {
  return ProviderScope(
    overrides: [
      sectionsProvider.overrideWith((ref) async => sections),
      if (detail != null)
        sectionDetailProvider.overrideWith((ref, id) async => detail),
    ],
    child: MaterialApp(
      theme: AppTheme.light(),
      home: MediaQuery(
        data: MediaQueryData(size: size),
        child: const SectionsScreen(),
      ),
    ),
  );
}

void main() {
  final bsit = _section(
    id: 3,
    code: 'BSIT-1A',
    name: 'BSIT 1A',
    programCode: 'BSIT',
    programName: 'Information Technology',
    enrolled: 41,
  );
  final bsba = _section(
    id: 8,
    code: 'BSBA-2B',
    name: 'BSBA 2B',
    programCode: 'BSBA',
    programName: 'Business Administration',
    yearLevel: 2,
    enrolled: 1,
  );

  testWidgets('groups sections and keeps search readable on a phone', (
    tester,
  ) async {
    await tester.pumpWidget(_app(sections: [bsit, bsba]));
    await tester.pumpAndSettle();

    expect(find.text('2 sections'), findsOneWidget);
    expect(find.text('Information Technology'), findsOneWidget);
    expect(find.text('Business Administration'), findsOneWidget);
    expect(find.text('BSIT 1A'), findsOneWidget);
    expect(find.text('41'), findsOneWidget);
    expect(find.text('students'), findsWidgets);
    expect(find.text('1 student'), findsNothing);
    expect(find.text('student'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'xyz');
    await tester.pump();
    expect(find.byTooltip('Clear search'), findsOneWidget);
  });

  testWidgets('empty search teaches recovery', (tester) async {
    await tester.pumpWidget(_app(sections: const []));
    await tester.pumpAndSettle();
    expect(find.text('No sections yet'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'none');
    await tester.pump();
    expect(find.text('No matching sections'), findsOneWidget);
    expect(find.text('Clear search'), findsOneWidget);
  });

  testWidgets('detail roster shows chips and students on a tablet width', (
    tester,
  ) async {
    final detail = SectionBreakdown(
      section: bsit,
      students: [
        SectionStudentModel.fromJson({
          'student_id': 1,
          'student_number': '02-26-0011',
          'first_name': 'Juan',
          'last_name': 'Dela Cruz',
          'enrollment_status_code': 'ENROLLED',
        }),
      ],
    );
    await tester.pumpWidget(
      _app(
        sections: [bsit],
        detail: detail,
        size: const Size(1024, 768),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('BSIT 1A'));
    await tester.pumpAndSettle();

    expect(find.text('Information Technology'), findsWidgets);
    expect(find.text('Dela Cruz, Juan'), findsOneWidget);
    expect(find.text('02-26-0011'), findsOneWidget);
    expect(find.text('Enrolled'), findsOneWidget);
    expect(find.text('1st Year'), findsOneWidget);
    expect(find.text('First Semester'), findsOneWidget);
  });
}
