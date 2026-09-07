enum UserRole {
  superadmin,
  moderator;

  static UserRole? tryParse(String? raw) {
    switch (raw) {
      case 'superadmin':
        return UserRole.superadmin;
      case 'moderator':
        return UserRole.moderator;
      default:
        return null;
    }
  }

  String get label => switch (this) {
    UserRole.superadmin => 'Superadmin',
    UserRole.moderator => 'Moderator',
  };
}

class UserModel {
  const UserModel({
    required this.id,
    required this.name,
    required this.username,
    required this.role,
    this.createdAt,
  });

  final int id;
  final String name;
  final String username;
  final UserRole role;
  final DateTime? createdAt;

  factory UserModel.fromJson(Map<String, dynamic> json) => UserModel(
    id: json['id'] as int,
    name: json['name'] as String? ?? '',
    username: json['username'] as String? ?? '',
    role: UserRole.tryParse(json['role'] as String?) ?? UserRole.moderator,
    createdAt: json['created_at'] == null
        ? null
        : DateTime.tryParse(json['created_at'] as String),
  );
}
