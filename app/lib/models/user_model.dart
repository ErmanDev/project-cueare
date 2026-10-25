import '../core/utils/formatters.dart';
import '../core/utils/json_values.dart';

enum UserRole {
  superadmin,
  moderator,
  student;

  static UserRole? tryParse(String? raw) {
    if (raw == null) return null;
    switch (raw.toLowerCase()) {
      case 'superadmin':
        return UserRole.superadmin;
      case 'moderator':
        return UserRole.moderator;
      case 'student':
        return UserRole.student;
      default:
        return null;
    }
  }

  String get label => switch (this) {
        superadmin => 'Superadmin',
        moderator => 'Moderator',
        student => 'Student',
      };
}

class UserModel {
  const UserModel({
    required this.id,
    required this.name,
    required this.username,
    required this.role,
    this.studentId,
    this.createdAt,
  });

  final int id;
  final String name;
  final String username;
  final UserRole role;
  final int? studentId;
  final DateTime? createdAt;

  factory UserModel.fromJson(Map<String, dynamic> json) => UserModel(
    id: asInt(json['id']) ?? 0,
    name: json['name'] as String? ?? '',
    username: json['username'] as String? ?? '',
    role: UserRole.tryParse(json['role'] as String?) ?? UserRole.moderator,
    studentId: asInt(json['student_id']),
    createdAt: Fmt.parseUtc(json['created_at'] as String?),
  );
}
