import '../core/utils/formatters.dart';
import '../core/utils/json_values.dart';

class StudentModel {
  const StudentModel({
    required this.id,
    required this.studentIdCode,
    required this.fullName,
    this.firstName,
    this.middleName,
    this.lastName,
    this.course,
    this.yearLevel,
    this.section,
    this.photoUrl,
    this.userId,
    this.qrPayload,
    this.createdAt,
  });

  final int id;
  final String studentIdCode;
  final String fullName;
  final String? firstName;
  final String? middleName;
  final String? lastName;
  final String? course;
  final int? yearLevel;
  final String? section;
  final String? photoUrl;
  final int? userId;

  /// What to encode in the QR. Falls back to the code itself.
  final String? qrPayload;
  final DateTime? createdAt;

  String get qrData => qrPayload ?? studentIdCode;

  String get programLine => [
    if (course != null && course!.isNotEmpty) course!,
    if (yearLevel != null) Fmt.yearLevel(yearLevel),
    if (section != null && section!.isNotEmpty) section!,
  ].join(' · ');

  StudentModel copyWith({String? qrPayload}) => StudentModel(
    id: id,
    studentIdCode: studentIdCode,
    fullName: fullName,
    firstName: firstName,
    middleName: middleName,
    lastName: lastName,
    course: course,
    yearLevel: yearLevel,
    section: section,
    photoUrl: photoUrl,
    userId: userId,
    qrPayload: qrPayload ?? this.qrPayload,
    createdAt: createdAt,
  );

  factory StudentModel.fromJson(Map<String, dynamic> json) => StudentModel(
    id: asInt(json['id']) ?? 0,
    studentIdCode: json['student_id_code'] as String? ?? '',
    fullName: json['full_name'] as String? ?? '',
    firstName: asString(json['first_name']),
    middleName: asString(json['middle_name']),
    lastName: asString(json['last_name']),
    course: asString(json['course']),
    yearLevel: asInt(json['year_level']),
    section: json['section'] as String?,
    photoUrl: json['photo_url'] as String?,
    userId: asInt(json['user_id']),
    qrPayload: json['qr_payload'] as String?,
    createdAt: json['created_at'] == null
        ? null
        : DateTime.tryParse(json['created_at'] as String),
  );
}
