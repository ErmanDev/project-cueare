import 'package:dart_frog/dart_frog.dart';
import 'package:dart_jsonwebtoken/dart_jsonwebtoken.dart';

import '../config.dart';

/// Roles supported by the system.
abstract class Roles {
  static const superadmin = 'superadmin';
  static const moderator = 'moderator';
  static const all = {superadmin, moderator};

  static bool isValid(String? role) => role != null && all.contains(role);
}

/// The authenticated principal, injected into the request context by
/// [authMiddleware].
class AuthUser {
  const AuthUser({
    required this.id,
    required this.username,
    required this.role,
  });

  final int id;
  final String username;
  final String role;

  bool get isSuperadmin => role == Roles.superadmin;
  bool get isModerator => role == Roles.moderator;
}

/// Issues a signed JWT for [userId]/[role].
String issueToken({
  required int userId,
  required String username,
  required String role,
}) {
  final config = AppConfig.instance;
  final jwt = JWT(
    {'sub': userId, 'username': username, 'role': role},
    issuer: 'ssc-qr-attendance',
  );
  return jwt.sign(SecretKey(config.jwtSecret), expiresIn: config.jwtTtl);
}

/// Verifies [token] and returns the principal, or `null` if invalid/expired.
AuthUser? verifyToken(String token) {
  try {
    final jwt = JWT.verify(token, SecretKey(AppConfig.instance.jwtSecret));
    final payload = jwt.payload as Map<String, dynamic>;
    final sub = payload['sub'];
    final id = sub is int ? sub : int.tryParse(sub.toString());
    final role = payload['role'] as String?;
    if (id == null || !Roles.isValid(role)) return null;
    return AuthUser(
      id: id,
      username: payload['username'] as String? ?? '',
      role: role!,
    );
  } catch (_) {
    return null;
  }
}

/// Dart Frog middleware: requires a valid `Authorization: Bearer <token>`
/// header whose role is in [allowedRoles], then provides [AuthUser] to the
/// downstream handler.
Middleware authMiddleware({required Set<String> allowedRoles}) {
  return (handler) {
    return (context) async {
      final header =
          context.request.headers['authorization'] ??
          context.request.headers['Authorization'];
      if (header == null || !header.toLowerCase().startsWith('bearer ')) {
        return Response.json(
          statusCode: 401,
          body: {'error': 'Missing or malformed Authorization header'},
        );
      }
      final user = verifyToken(header.substring(7).trim());
      if (user == null) {
        return Response.json(
          statusCode: 401,
          body: {'error': 'Invalid or expired token'},
        );
      }
      if (!allowedRoles.contains(user.role)) {
        return Response.json(
          statusCode: 403,
          body: {'error': 'Forbidden for role ${user.role}'},
        );
      }
      return handler(context.provide<AuthUser>(() => user));
    };
  };
}
