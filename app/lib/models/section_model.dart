import '../core/utils/formatters.dart';
import '../core/utils/json_values.dart';

class SectionModel {
  const SectionModel({
    required this.sectionId,
    required this.sectionCode,
    this.sectionName,
    required this.yearLevel,
    required this.academicTermId,
    required this.termCode,
    required this.termName,
    this.yearCode,
    this.yearName,
    required this.academicProgramId,
    required this.programCode,
    required this.programName,
    required this.enrolledStudentCount,
  });

  final int sectionId;
  final String sectionCode;
  final String? sectionName;
  final int yearLevel;
  final int academicTermId;
  final String termCode;
  final String termName;
  final String? yearCode;
  final String? yearName;
  final int academicProgramId;
  final String programCode;
  final String programName;
  final int enrolledStudentCount;

  String get title =>
      (sectionName == null || sectionName!.isEmpty) ? sectionCode : sectionName!;

  String get subtitle => [
    programCode,
    Fmt.yearLevel(yearLevel),
    if (yearCode != null && yearCode!.isNotEmpty) yearCode!,
    termCode,
  ].join(' · ');

  factory SectionModel.fromJson(Map<String, dynamic> json) => SectionModel(
    sectionId: asInt(json['section_id']) ?? 0,
    sectionCode: json['section_code'] as String? ?? '',
    sectionName: asString(json['section_name']),
    yearLevel: asInt(json['year_level']) ?? 0,
    academicTermId: asInt(json['academic_term_id']) ?? 0,
    termCode: json['term_code'] as String? ?? '',
    termName: json['term_name'] as String? ?? '',
    yearCode: asString(json['year_code']),
    yearName: asString(json['year_name']),
    academicProgramId: asInt(json['academic_program_id']) ?? 0,
    programCode: json['program_code'] as String? ?? '',
    programName: json['program_name'] as String? ?? '',
    enrolledStudentCount:
        asInt(json['enrolled_student_count'] ?? json['student_count']) ?? 0,
  );
}

class SectionStudentModel {
  const SectionStudentModel({
    required this.studentId,
    required this.studentNumber,
    required this.firstName,
    this.middleName,
    required this.lastName,
    this.suffix,
    this.enrollmentStatusCode,
  });

  final int studentId;
  final String studentNumber;
  final String firstName;
  final String? middleName;
  final String lastName;
  final String? suffix;
  final String? enrollmentStatusCode;

  String get displayName {
    final mid = middleName == null || middleName!.isEmpty ? '' : ' $middleName';
    final extra = suffix == null || suffix!.isEmpty ? '' : ' $suffix';
    return '$lastName, $firstName$mid$extra'.trim();
  }

  String? get enrollmentLabel {
    final raw = enrollmentStatusCode?.trim();
    if (raw == null || raw.isEmpty) return null;
    return '${raw[0].toUpperCase()}${raw.substring(1).toLowerCase()}';
  }

  bool get isEnrolled =>
      enrollmentStatusCode?.toUpperCase() == 'ENROLLED';

  factory SectionStudentModel.fromJson(Map<String, dynamic> json) =>
      SectionStudentModel(
        studentId: asInt(json['student_id']) ?? 0,
        studentNumber: json['student_number'] as String? ?? '',
        firstName: json['first_name'] as String? ?? '',
        middleName: asString(json['middle_name']),
        lastName: json['last_name'] as String? ?? '',
        suffix: asString(json['suffix']),
        enrollmentStatusCode: asString(json['enrollment_status_code']),
      );
}

class SectionBreakdown {
  const SectionBreakdown({required this.section, required this.students});

  final SectionModel section;
  final List<SectionStudentModel> students;

  factory SectionBreakdown.fromJson(Map<String, dynamic> json) =>
      SectionBreakdown(
        section: SectionModel.fromJson(json),
        students: (json['students'] as List<dynamic>? ?? [])
            .map((e) => SectionStudentModel.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}
