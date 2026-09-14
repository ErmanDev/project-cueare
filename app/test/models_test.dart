import 'package:flutter_test/flutter_test.dart';
import 'package:ssc_qr_attendance/core/utils/formatters.dart';
import 'package:ssc_qr_attendance/models/event_model.dart';
import 'package:ssc_qr_attendance/models/event_participant_model.dart';
import 'package:ssc_qr_attendance/models/section_model.dart';
import 'package:ssc_qr_attendance/features/student/student_providers.dart';
import 'package:ssc_qr_attendance/models/attendance_log_model.dart';
import 'package:ssc_qr_attendance/models/student_fine_model.dart';
import 'package:ssc_qr_attendance/models/scan_preview_model.dart';
import 'package:ssc_qr_attendance/models/student_model.dart';

void main() {
  test('year level suffixes match the web formatter', () {
    expect(Fmt.yearLevel(1), '1st Year');
    expect(Fmt.yearLevel(2), '2nd Year');
    expect(Fmt.yearLevel(3), '3rd Year');
    expect(Fmt.yearLevel(4), '4th Year');
    expect(Fmt.yearLevel(11), '11th Year');
    expect(Fmt.yearLevel(null), '—');
  });

  test('student JSON includes course, year, and name parts', () {
    final s = StudentModel.fromJson({
      'id': 42,
      'student_id_code': '02-26-0011',
      'first_name': 'Juan',
      'middle_name': 'Santos',
      'last_name': 'Dela Cruz',
      'full_name': 'Juan Santos Dela Cruz',
      'course': 'BSIT',
      'year_level': '1',
      'section': 'A',
      'user_id': 9,
    });
    expect(s.course, 'BSIT');
    expect(s.yearLevel, 1);
    expect(s.programLine, 'BSIT · 1st Year · A');
    expect(s.userId, 9);
  });

  test('event JSON includes expired flag and participant count', () {
    final e = EventModel.fromJson({
      'id': 7,
      'name': 'Acquaintance',
      'event_date': '2026-09-13T00:00:00.000Z',
      'is_active': false,
      'is_expired': true,
      'participant_count': 18,
      'session_windows': [],
    });
    expect(e.isExpired, isTrue);
    expect(e.participantCount, 18);
  });

  test('participant display name is last, first middle', () {
    final p = EventParticipantModel.fromJson({
      'student_id': 9,
      'student_id_code': '02-26-0011',
      'first_name': 'Juan',
      'middle_name': 'Santos',
      'last_name': 'Dela Cruz',
      'course': 'BSIT',
      'year_level': 2,
      'section': 'A',
    });
    expect(p.displayName, 'Dela Cruz, Juan Santos');
    expect(p.programLine, 'BSIT · 2nd Year · A');
  });

  test('section JSON maps enrolled_student_count', () {
    final s = SectionModel.fromJson({
      'section_id': 3,
      'section_code': 'BSIT-1A',
      'section_name': 'BSIT 1A',
      'year_level': 1,
      'academic_term_id': 1,
      'term_code': '1ST',
      'term_name': 'First Semester',
      'year_code': '2026-2027',
      'academic_program_id': 2,
      'program_code': 'BSIT',
      'program_name': 'Information Technology',
      'enrolled_student_count': 41,
    });
    expect(s.title, 'BSIT 1A');
    expect(s.enrolledStudentCount, 41);
    expect(s.subtitle, contains('1st Year'));
  });

  test('enrollment status is title-cased for chips', () {
    final enrolled = SectionStudentModel.fromJson({
      'student_id': 1,
      'student_number': '02-26-0011',
      'first_name': 'Juan',
      'last_name': 'Dela Cruz',
      'enrollment_status_code': 'ENROLLED',
    });
    expect(enrolled.enrollmentLabel, 'Enrolled');
    expect(enrolled.isEnrolled, isTrue);
  });

  test('student fine JSON groups by event and formats the amount', () {
    final fine = StudentFineModel.fromJson({
      'assessment_id': 3,
      'event_id': 7,
      'event_name': 'Acquaintance',
      'session_name': 'Morning',
      'violation_code': 'ABSENT',
      'assessed_amount': 100.5,
      'outstanding_amount': 100.5,
      'status': 'ASSESSED',
      'currency_code': 'PHP',
    });
    expect(fine.eventName, 'Acquaintance');
    expect(fine.violationLabel, 'Absent');
    expect(fine.amountLabel, '₱100.50');
    expect(fine.isOpen, isTrue);
  });

  test('scan preview JSON marks late check-in', () {
    final p = ScanPreviewModel.fromJson({
      'student': {
        'id': 1,
        'student_id_code': 'STU-2026-0001',
        'full_name': 'Juan Dela Cruz',
        'section': 'BSIT-3A',
      },
      'event': {'id': 7, 'name': 'Founders Day'},
      'computed_session': {
        'id': 3,
        'session_label': 'Morning',
        'start_time': '07:00',
        'end_time': '12:00',
        'mode': 'manual',
      },
      'computed_direction': 'IN',
      'is_late': true,
      'can_confirm': true,
      'server_time': '2026-09-05T10:43:00.000Z',
      'existing_scans': [],
      'message': 'Arrived after 07:30 — will be marked LATE',
    });
    expect(p.isLate, isTrue);
    expect(p.canConfirm, isTrue);
    expect(p.computedDirection, 'IN');
  });

  test('attendanceSame ignores unchanged polls and sees a new scan', () {
    AttendanceLogModel log(int id) => AttendanceLogModel(
      id: id,
      eventId: 1,
      studentId: 2,
      sessionWindowId: 3,
      direction: 'IN',
      scannedAt: DateTime.utc(2026, 9, 14, 1, 0),
      scannedBy: 4,
      status: 'confirmed',
    );
    expect(attendanceSame([log(1)], [log(1)]), isTrue);
    expect(attendanceSame([log(1)], [log(1), log(2)]), isFalse);
  });
}
