import '../core/utils/formatters.dart';
import '../core/utils/json_values.dart';

class EventParticipantModel {
  const EventParticipantModel({
    required this.studentId,
    this.studentIdCode,
    required this.firstName,
    this.middleName,
    required this.lastName,
    this.course,
    this.yearLevel,
    this.section,
    this.addedAt,
  });

  final int studentId;
  final String? studentIdCode;
  final String firstName;
  final String? middleName;
  final String lastName;
  final String? course;
  final int? yearLevel;
  final String? section;
  final DateTime? addedAt;

  String get displayName {
    final mid = middleName == null || middleName!.isEmpty ? '' : ' $middleName';
    final given = '$firstName$mid'.trim();
    if (lastName.isEmpty) return given.isEmpty ? (studentIdCode ?? 'Student') : given;
    if (given.isEmpty) return lastName;
    return '$lastName, $given';
  }

  String get programLine => [
    if (course != null && course!.isNotEmpty) course!,
    if (yearLevel != null) Fmt.yearLevel(yearLevel),
    if (section != null && section!.isNotEmpty) section!,
  ].join(' · ');

  factory EventParticipantModel.fromJson(Map<String, dynamic> json) =>
      EventParticipantModel(
        studentId: asInt(json['student_id']) ?? 0,
        studentIdCode: asString(json['student_id_code']),
        firstName: json['first_name'] as String? ?? '',
        middleName: asString(json['middle_name']),
        lastName: json['last_name'] as String? ?? '',
        course: asString(json['course']),
        yearLevel: asInt(json['year_level']),
        section: asString(json['section']),
        addedAt: json['added_at'] == null
            ? null
            : DateTime.tryParse(json['added_at'].toString()),
      );
}

class EventParticipantTokenModel {
  const EventParticipantTokenModel({
    required this.tokenId,
    required this.eventId,
    required this.studentId,
    required this.token,
    required this.isRevoked,
    this.studentIdCode,
    required this.firstName,
    this.middleName,
    required this.lastName,
    this.course,
    this.yearLevel,
    this.section,
  });

  final int tokenId;
  final int eventId;
  final int studentId;
  final String token;
  final bool isRevoked;
  final String? studentIdCode;
  final String firstName;
  final String? middleName;
  final String lastName;
  final String? course;
  final int? yearLevel;
  final String? section;

  String get displayName {
    final mid = middleName == null || middleName!.isEmpty ? '' : ' $middleName';
    final given = '$firstName$mid'.trim();
    if (lastName.isEmpty) return given.isEmpty ? (studentIdCode ?? 'Student') : given;
    if (given.isEmpty) return lastName;
    return '$lastName, $given';
  }

  factory EventParticipantTokenModel.fromJson(Map<String, dynamic> json) =>
      EventParticipantTokenModel(
        tokenId: asInt(json['token_id']) ?? 0,
        eventId: asInt(json['event_id']) ?? 0,
        studentId: asInt(json['student_id']) ?? 0,
        token: json['token'] as String? ?? '',
        isRevoked: json['is_revoked'] as bool? ?? false,
        studentIdCode: asString(json['student_id_code']),
        firstName: json['first_name'] as String? ?? '',
        middleName: asString(json['middle_name']),
        lastName: json['last_name'] as String? ?? '',
        course: asString(json['course']),
        yearLevel: asInt(json['year_level']),
        section: asString(json['section']),
      );
}
